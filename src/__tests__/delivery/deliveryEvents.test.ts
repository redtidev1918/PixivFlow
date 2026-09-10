/**
 * Audit-event coverage for the outbox worker: readiness deferrals (rate-limited,
 * no attempt consumed), retry/done/dead transitions, and idempotent reuse.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Database } from '../../storage/Database';
import { OutboxWorker } from '../../delivery/OutboxWorker';
import { DeliveryAck } from '../../delivery/DeliveryAck';

function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'pf-events-'));
  const db = new Database(join(dir, 't.db'));
  db.migrate();
  return fn(db).finally(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

/** Dispatcher with structured readinessProbe (like DeliveryDispatcher). */
class ScriptedDispatcher {
  deliverCalls = 0;
  ready: { ready: boolean; reason?: string; status?: number } = { ready: true };
  constructor(private script: Array<() => Promise<{ ack: DeliveryAck }>> = []) {}
  async readinessProbe() {
    return this.ready;
  }
  async isReady() {
    return this.ready.ready;
  }
  async deliver(): Promise<{ ack: DeliveryAck }> {
    this.deliverCalls++;
    const step = this.script.shift();
    if (!step) throw new Error('unexpected deliver call');
    return step();
  }
  async notify(): Promise<void> {}
}

const CONTEXT = {
  idempotencyKey: 'k',
  executionId: 'exec-1',
  slotId: 'exec-1',
  pixivId: '555',
};

function enqueue(db: Database, key: string, maxAttempts = 3) {
  const { row: delivery } = db.deliveries.insertIntent({
    id: `d-${randomUUID()}`, deliveryTarget: 'bot1', workType: 'illustration',
    pixivId: '555', idempotencyKey: `dk-${randomUUID()}`,
  });
  const row = db.outbox.enqueue({
    kind: 'delivery', deliveryTarget: 'bot1', idempotencyKey: key + '-unique',
    deliveryId: delivery.id,
    payload: { files: [], context: { ...CONTEXT, idempotencyKey: key } },
    maxAttempts,
  });
  return row;
}

function events(db: Database, outboxId: string) {
  return db.outbox.listEvents({ outboxId, limit: 50 }).reverse();
}

describe('OutboxWorker audit events', () => {
  it('defers without consuming an attempt and rate-limits deferred events', async () => {
    await withDb(async (db) => {
      const dispatcher = new ScriptedDispatcher();
      dispatcher.ready = { ready: false, reason: 'http_503', status: 503 };
      const worker = new OutboxWorker(db, dispatcher as any, { pollIntervalMs: 999_999 });
      const row = enqueue(db, 'k-defer');

      await worker.drainOnce();
      await worker.drainOnce(); // second poll within 60s must NOT add another event

      expect(db.outbox.get(row.id)).toMatchObject({ status: 'pending', attempts: 0 });
      const deferred = events(db, row.id).filter((e) => e.event === 'outbox.deferred');
      expect(deferred).toHaveLength(1);
      expect(deferred[0]).toMatchObject({
        errorClass: 'dependency_not_ready',
        retryable: 1,
        countsAsAttempt: 0,
        executionId: 'exec-1',
        pixivId: '555',
      });
      expect(JSON.parse(deferred[0].detail!)).toMatchObject({ reason: 'http_503', status: 503 });
    });
  });

  it('delivers after the dependency becomes ready and records claimed+delivered', async () => {
    await withDb(async (db) => {
      const dispatcher = new ScriptedDispatcher([
        async () => ({ ack: { kind: 'accepted', remoteId: 'm-1' } as DeliveryAck }),
      ]);
      dispatcher.ready = { ready: false, reason: 'connection_refused' };
      const worker = new OutboxWorker(db, dispatcher as any, { retryBaseMs: 0 });
      const row = enqueue(db, 'k-ready');

      await worker.drainOnce();
      expect(db.outbox.get(row.id)!.attempts).toBe(0);
      dispatcher.ready = { ready: true };
      await worker.drainOnce();

      const names = events(db, row.id).map((e) => `${e.event}:${e.countsAsAttempt}`);
      expect(names).toEqual([
        'outbox.deferred:0',
        'outbox.claimed:0',
        'outbox.delivered:0',
      ]);
      expect(dispatcher.deliverCalls).toBe(1);
    });
  });

  it('records a retry with error_class and counts_as_attempt=1', async () => {
    await withDb(async (db) => {
      const dispatcher = new ScriptedDispatcher([
        async () => { throw new Error('network timeout awaiting ack'); },
      ]);
      const worker = new OutboxWorker(db, dispatcher as any, { retryBaseMs: 0 });
      const row = enqueue(db, 'k-retry');

      // One process() call = one attempt (drainOnce would loop on the 0ms backoff).
      const [claimed] = db.outbox.claimDue('test', 1000, 10);
      expect(await (worker as any).process(claimed)).toBe('retry_wait');

      expect(db.outbox.get(row.id)).toMatchObject({ status: 'retry_wait', attempts: 1 });
      const retry = events(db, row.id).find((e) => e.event === 'outbox.retry_scheduled')!;
      expect(retry).toMatchObject({ errorClass: 'network_timeout', retryable: 1, countsAsAttempt: 1 });
      const detail = JSON.parse(retry.detail!);
      expect(detail.attempt).toBe(1);
      expect(typeof detail.nextInMs).toBe('number');
    });
  });

  it('dead-letters after max attempts and records outbox.dead non-retryable', async () => {
    await withDb(async (db) => {
      const dispatcher = new ScriptedDispatcher(
        Array.from({ length: 2 }, () => async () => { throw new Error('400 bad payload'); }),
      );
      const worker = new OutboxWorker(db, dispatcher as any, { retryBaseMs: 0 });
      const row = enqueue(db, 'k-dead2', 2);

      for (let i = 0; i < 2; i++) await worker.drainOnce();

      expect(db.outbox.get(row.id)!.status).toBe('dead');
      const dead = events(db, row.id).filter((e) => e.event === 'outbox.dead');
      expect(dead).toHaveLength(1);
      expect(dead[0]).toMatchObject({ errorClass: 'invalid_payload', retryable: 0, countsAsAttempt: 1 });
    });
  });

  it('records delivery.duplicate only when the ack attests reuse', async () => {
    await withDb(async (db) => {
      const dispatcher = new ScriptedDispatcher([
        async () => ({ ack: { kind: 'idempotent_replay', remoteId: 'm-9' } as DeliveryAck }),
      ]);
      const worker = new OutboxWorker(db, dispatcher as any, { retryBaseMs: 0 });
      const row = enqueue(db, 'k-dup');

      await worker.drainOnce();

      const dup = events(db, row.id).filter((e) => e.event === 'delivery.duplicate');
      expect(dup).toHaveLength(1);
      expect(dup[0]).toMatchObject({ errorClass: 'duplicate', retryable: 0, countsAsAttempt: 0 });
      expect(JSON.parse(dup[0].detail!)).toMatchObject({ reason: 'idempotent_replay', remoteId: 'm-9' });
    });
  });

  it('transport timeout classifies as network_timeout and counts as an attempt', async () => {
    await withDb(async (db) => {
      const dispatcher = new ScriptedDispatcher([
        async () => { throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }); },
      ]);
      const worker = new OutboxWorker(db, dispatcher as any, { retryBaseMs: 0 });
      const row = enqueue(db, 'k-abort');

      const [claimed] = db.outbox.claimDue('test', 1000, 10);
      await (worker as any).process(claimed);
      const retry = db.outbox.listEvents({ outboxId: row.id }).find((e) => e.event === 'outbox.retry_scheduled')!;
      expect(retry.errorClass).toBe('network_timeout');
      expect(retry.countsAsAttempt).toBe(1);
    });
  });
});
