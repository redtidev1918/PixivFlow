/**
 * Failure-injection tests for the delivery outbox + slot FSM.
 *
 * These exercise the "exactly one remote side effect" guarantee under the
 * failures that actually occur on a 512 MiB auto-suspend machine:
 *  - ACK loss (timeout AFTER the provider created the record)
 *  - duplicate triggers / retries carrying the same idempotency key
 *  - a crash mid-delivery (a stale 'processing' lease left on disk)
 *  - permanent provider rejection -> bounded retries -> dead letter
 *  - notification side effects failing independently of content delivery
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { OutboxWorker } from '../../delivery/OutboxWorker';
import { DeliveryAck } from '../../delivery/DeliveryAck';

function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-outbox-fi-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  return fn(db).finally(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

}

/** Programmable delivery provider: each call pops the next scripted result. */
class FakeDispatcher {
  deliverCalls = 0;
  notifyCalls = 0;
  deliveredKeys: string[] = [];
  constructor(
    private deliverScript: Array<() => Promise<{ ack: DeliveryAck }>> = [],
    private notifyScript: Array<() => Promise<void>> = [],
  ) {}
  async deliver(_name: string, request: { context: Record<string, unknown> }): Promise<{ ack: DeliveryAck }> {
    this.deliverCalls++;
    const step = this.deliverScript.shift();
    if (!step) throw new Error('unexpected deliver call');
    const result = await step();
    if (result.ack.kind === 'accepted' || result.ack.kind === 'idempotent_replay') {
      // Simulate the PROVIDER deduping on our key: it creates the record once.
      const key = String(request.context?.idempotencyKey ?? '');
      if (!this.deliveredKeys.includes(key)) this.deliveredKeys.push(key);
    }
    return result;
  }
  async notify(): Promise<void> {
    this.notifyCalls++;
    const step = this.notifyScript.shift();
    if (!step) throw new Error('unexpected notify call');
    await step();
  }
}

const ctx = { idempotencyKey: 'k-1' } as any;

describe('OutboxWorker failure injection', () => {
  it('ACK loss converges to one remote record via idempotent_replay', async () => {
    await withDb(async (db) => {
      const dispatcher = new FakeDispatcher([
        // Attempt 1: request reached the provider and it posted, but the ACK was
        // lost (timeout). No local confirmation yet.
        async () => {
          throw new Error('network timeout awaiting ack');
        },
        // Attempt 2: provider recognises our key and replays the SAME record.
        async () => ({ ack: { kind: 'idempotent_replay', remoteId: 'm-42' } as DeliveryAck }),
      ]);
      const worker = new OutboxWorker(db, dispatcher as any, {
        retryBaseMs: 0, // no real waiting in tests
      });
      const { row: delivery } = db.deliveries.insertIntent({
        id: 'd-1', deliveryTarget: 'bot1', workType: 'illustration',
        pixivId: '100', idempotencyKey: 'k-1',
      });
      db.outbox.enqueue({
        kind: 'delivery', deliveryTarget: 'bot1', idempotencyKey: 'k-1',
        deliveryId: delivery.id,
        payload: { files: [], context: ctx },
        maxAttempts: 5,
      });

      const first = await worker.drainOnce();
      // Attempt 1 is retryable; backoff is 0 but next_attempt is still in the
      // future-free window because retryBaseMs=0 -> due immediately next round.
      const second = await worker.drainOnce();

      expect(dispatcher.deliveredKeys).toEqual(['k-1']); // exactly one remote record
      const ledger = db.deliveries.getById('d-1')!;
      expect(ledger.status).toBe('delivered');
      expect(ledger.remoteId).toBe('m-42');
      const row = db.outbox.getByKey('delivery', 'k-1')!;
      expect(row.status).toBe('done');
      expect(first.processed + second.processed).toBe(2);
    });
  });

  it('duplicate triggers with the same key enqueue and deliver exactly once', async () => {
    await withDb(async (db) => {
      const dispatcher = new FakeDispatcher([
        async () => ({ ack: { kind: 'accepted', remoteId: 'm-7' } as DeliveryAck }),
      ]);
      const worker = new OutboxWorker(db, dispatcher as any);
      const { row: delivery } = db.deliveries.insertIntent({
        id: 'd-2', deliveryTarget: 'bot1', workType: 'illustration',
        pixivId: '101', idempotencyKey: 'k-dup',
      });
      for (let i = 0; i < 3; i++) {
        db.outbox.enqueue({
          kind: 'delivery', deliveryTarget: 'bot1', idempotencyKey: 'k-dup',
          deliveryId: delivery.id, payload: { files: [], context: { idempotencyKey: 'k-dup' } },
        });
      }
      const res = await worker.drainOnce();
      expect(res.done).toBe(1);
      expect(dispatcher.deliverCalls).toBe(1);
    });
  });

  it('a stale processing lease left by a crashed worker is resumed with the same intent', async () => {
    await withDb(async (db) => {
      const dispatcher = new FakeDispatcher([
        async () => ({ ack: { kind: 'accepted', remoteId: 'm-9' } as DeliveryAck }),
      ]);
      const worker = new OutboxWorker(db, dispatcher as any);
      const { row: delivery } = db.deliveries.insertIntent({
        id: 'd-3', deliveryTarget: 'bot1', workType: 'illustration',
        pixivId: '102', idempotencyKey: 'k-crash',
      });
      const row = db.outbox.enqueue({
        kind: 'delivery', deliveryTarget: 'bot1', idempotencyKey: 'k-crash',
        deliveryId: delivery.id, payload: { files: [], context: { idempotencyKey: 'k-crash' } },
      });
      // Simulate a process killed between claim and markDone.
      db.outbox.claimDue('dead-worker-pid', 1, 10);
      expect(db.outbox.get(row.id)!.status).toBe('processing');

      // Nothing due while the lease is live.
      expect(await worker.drainOnce()).toMatchObject({ processed: 0 });

      // After lease expiry the restarted worker claims the SAME row.
      await new Promise((r) => setTimeout(r, 5));
      const res = await worker.drainOnce();
      expect(res.done).toBe(1);
      expect(dispatcher.deliverCalls).toBe(1);
      expect(db.outbox.get(row.id)!.status).toBe('done');
    });
  });

  it('permanent rejection retries up to maxAttempts then dead-letters and records failure', async () => {
    await withDb(async (db) => {
      const dispatcher = new FakeDispatcher(
        Array.from({ length: 3 }, () => async () => ({
          ack: { kind: 'permanent_failure', error: '400 bad payload' } as DeliveryAck,
        })),
      );
      const dead: string[] = [];
      const worker = new OutboxWorker(db, dispatcher as any, {
        retryBaseMs: 0, onDead: (r, err) => dead.push(r.id + ':' + err),
      });
      const { row: delivery } = db.deliveries.insertIntent({
        id: 'd-4', deliveryTarget: 'bot1', workType: 'illustration',
        pixivId: '103', idempotencyKey: 'k-dead',
      });
      db.outbox.enqueue({
        kind: 'delivery', deliveryTarget: 'bot1', idempotencyKey: 'k-dead',
        deliveryId: delivery.id, payload: { files: [], context: { idempotencyKey: 'k-dead' } },
        maxAttempts: 3,
      });
      // Each drain round processes the row once; retryBaseMs=0 keeps it due.
      let deadCount = 0;
      for (let i = 0; i < 3 && deadCount === 0; i++) {
        deadCount = (await worker.drainOnce()).dead;
      }
      expect(deadCount).toBe(1);
      expect(db.outbox.getByKey('delivery', 'k-dead')!.status).toBe('dead');
      expect(db.deliveries.getById('d-4')!.status).toBe('failed');
      expect(dead).toHaveLength(1);
    });
  });

  it('notifications are pumped independently: a failing content delivery does not block them', async () => {
    await withDb(async (db) => {
      const dispatcher = new FakeDispatcher(
        [async () => { throw new Error('delivery down'); }],
        [async () => { /* notification succeeds */ }],
      );
      const worker = new OutboxWorker(db, dispatcher as any, {
        retryBaseMs: 0, batchSize: 8,
      });
      db.outbox.enqueue({
        kind: 'delivery', deliveryTarget: 'bot1', idempotencyKey: 'k-content',
        payload: { files: [], context: { idempotencyKey: 'k-content' } },
        maxAttempts: 1,
      });
      db.outbox.enqueue({
        kind: 'notification', deliveryTarget: 'bot1', idempotencyKey: 'k-note',
        payload: { text: 'queued for review' },
      });
      // Drain until the notification is done (delivery dead-letters after 1 try).
      let noteDone = false;
      for (let i = 0; i < 5 && !noteDone; i++) {
        await worker.drainOnce();
        noteDone = db.outbox.getByKey('notification', 'k-note')?.status === 'done';
      }
      expect(noteDone).toBe(true);
      expect(dispatcher.notifyCalls).toBe(1);
      expect(db.outbox.getByKey('delivery', 'k-content')!.status).toBe('dead');
    });
  });

  it('duplicate_existing marks the ledger duplicate without deleting cached files', async () => {
    await withDb(async (db) => {
      const dir = mkdtempSync(join(tmpdir(), 'pf-cache-'));
      const file = join(dir, 'f.jpg');
      writeFileSync(file, 'x');
      const dispatcher = new FakeDispatcher([
        async () => ({
          ack: { kind: 'duplicate_existing', remoteId: 'm-1', matchedKey: 'older-key' } as DeliveryAck,
        }),
      ]);
      const terminal: string[] = [];
      const worker = new OutboxWorker(db, dispatcher as any, {
        onDeliveryTerminal: (_id, ack) => terminal.push(ack.kind),
      });
      const { row: delivery } = db.deliveries.insertIntent({
        id: 'd-5', deliveryTarget: 'bot1', workType: 'illustration',
        pixivId: '104', idempotencyKey: 'k-hist',
      });
      db.outbox.enqueue({
        kind: 'delivery', deliveryTarget: 'bot1', idempotencyKey: 'k-hist',
        deliveryId: delivery.id,
        payload: { files: [file], cleanupFiles: [], context: { idempotencyKey: 'k-hist' } },
      });
      await worker.drainOnce();
      expect(db.deliveries.getById('d-5')!.status).toBe('duplicate');
      expect(terminal).toEqual(['duplicate_existing']);
      // Historical duplicate created no new post; the cache file is retained
      // (nothing confirmed delivered by THIS intent).
      const { existsSync } = await import('node:fs');
      expect(existsSync(file)).toBe(true);
      rmSync(dir, { recursive: true, force: true });
    });
  });
});