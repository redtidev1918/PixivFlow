/**
 * Regression: a provider may accept the request (HTTP 2xx) yet persist a record
 * that is ALREADY terminally failed. That record is keyed by OUR idempotency
 * key, so a retry only ever returns the same broken record.
 *
 * The production failure this pins down: TelePost answered a reused record with
 * `status=failed, reuse_reason=idempotent_replay`; Core's ack parser classified
 * it as `idempotent_replay`, the ledger recorded `delivered`, and the Slot cell
 * was promoted to `submitted` — a REMOTE FAILURE REPORTED AS END-TO-END SUCCESS.
 *
 * The invariant: remote failure must never be reported as success. These tests
 * fail on the pre-fix code (which surfaced `idempotent_replay`/`accepted` and a
 * `submitted` cell) and pass only when a terminal remote status outranks the
 * transport-level 2xx.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from '../../storage/Database';
import { OutboxWorker } from '../../delivery/OutboxWorker';
import { DeliveryAck, parseDeliveryAck } from '../../delivery/DeliveryAck';
import { settleDeliveryTerminal } from '../../delivery/settleDeliveryTerminal';
import { SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { StandaloneConfig, ScheduleConfig, TargetConfig } from '../../config';

const SLOT_TARGET = 'daily-illust';
const SCHEDULE: ScheduleConfig = {
  id: 'schedule-a',
  name: 'Schedule A',
  cron: '0 10 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
} as ScheduleConfig;
const CONFIG = { schedulerRuntime: { trigger: { graceMinutes: 120 } } } as StandaloneConfig;
// 2026-09-08 10:00 Shanghai == 02:00 UTC.
const AT = new Date('2026-09-08T02:00:30Z');

function withDb<T>(fn: (db: Database) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-remote-failed-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  return Promise.resolve(fn(db)).finally(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

/** Materialize a Slot whose cell is mid-delivery (delivery_pending). */
function prepareDeliveryCell(db: Database) {
  const coord = new SlotCoordinator(db);
  const slot = coord.resolveOccurrence(SCHEDULE, CONFIG, 'http', AT).context!;
  coord.prepare(slot, SCHEDULE, [{ id: SLOT_TARGET, type: 'illustration' } as TargetConfig]);
  coord.lockWork(slot.slotId, SLOT_TARGET, '555', 'illustration');
  coord.markCell(slot.slotId, SLOT_TARGET, 'delivery_pending');
  return slot;
}

function insertBoundIntent(db: Database, slotId: string) {
  return db.deliveries.insertIntent({
    id: 'delivery-555',
    deliveryTarget: 'telepost',
    workType: 'illustration',
    pixivId: '555',
    slotId,
    targetId: SLOT_TARGET,
    idempotencyKey: `pixivflow:telepost:illustration:555:${slotId}:${SLOT_TARGET}`,
  }).row;
}

/** Minimal programmable delivery dispatcher (delivery-only tests). */
class StubDispatcher {
  constructor(private script: Array<() => Promise<{ ack: DeliveryAck }>>) {}
  async isReady(): Promise<boolean> {
    return true;
  }
  async deliver(): Promise<{ ack: DeliveryAck }> {
    const step = this.script.shift();
    if (!step) throw new Error('unexpected deliver call');
    return step();
  }
  async notify(): Promise<void> {}
}

// The exact TelePost envelope for review #59: a REUSED record that is failed.
const failedReplayEnvelope = {
  ok: true,
  data: {
    status: 'failed',
    reused: true,
    reuse_reason: 'idempotent_replay',
    matched_idempotency_key: 'pixivflow:telepost:illustration:555:slot-1:daily-illust',
    review_id: 59,
  },
};

describe('remote delivery failure semantics', () => {
  describe('parseDeliveryAck: a terminal remote status outranks HTTP 2xx', () => {
    it('classifies a reused FAILED record as remote_failed, not idempotent_replay', () => {
      const ack = parseDeliveryAck(200, failedReplayEnvelope);
      expect(ack.kind).toBe('remote_failed');
      if (ack.kind === 'remote_failed') {
        expect(ack.remoteStatus).toBe('failed');
        expect(ack.remoteId).toBe('59');
      }
    });

    it('classifies a fresh (non-reused) FAILED record as remote_failed, not accepted', () => {
      const ack = parseDeliveryAck(200, {
        ok: true,
        data: { status: 'failed', reused: false, review_id: 60 },
      });
      expect(ack.kind).toBe('remote_failed');
    });

    it.each(['failed', 'rejected', 'invalid', 'expired'])(
      'treats remote status %s as terminal (case-insensitive)',
      (status) => {
        const ack = parseDeliveryAck(200, { ok: true, data: { status, review_id: 1 } });
        expect(ack.kind).toBe('remote_failed');
      }
    );

    it('does NOT over-reach: a reused PUBLISHED record stays idempotent_replay', () => {
      const ack = parseDeliveryAck(200, {
        ok: true,
        data: { status: 'published', reused: true, reuse_reason: 'idempotent_replay', review_id: 7 },
      });
      expect(ack.kind).toBe('idempotent_replay');
    });

    it('does NOT over-reach: a plain 2xx accepted record stays accepted', () => {
      const ack = parseDeliveryAck(200, {
        ok: true,
        data: { status: 'preparing', reused: false, review_id: 7 },
      });
      expect(ack.kind).toBe('accepted');
    });
  });

  describe('OutboxWorker: a remote_failed ack is terminal and never promoted', () => {
    it('records the ledger as failed and never retries the (pinned) remote record', async () => {
      await withDb(async (db) => {
        const dispatcher = new StubDispatcher([
          async () => ({ ack: { kind: 'remote_failed', remoteId: '59', remoteStatus: 'failed', error: 'downstream failed' } as DeliveryAck }),
        ]);
        const terminal: string[] = [];
        const worker = new OutboxWorker(db, dispatcher as never, {
          retryBaseMs: 0,
          onDeliveryTerminal: (_id, ack) => terminal.push(ack.kind),
        });
        const slot = prepareDeliveryCell(db);
        const intent = insertBoundIntent(db, slot.slotId);
        db.outbox.enqueue({
          kind: 'delivery',
          deliveryTarget: 'telepost',
          idempotencyKey: 'outbox:555',
          deliveryId: intent.id,
          payload: { files: [], context: { idempotencyKey: intent.idempotencyKey } },
          maxAttempts: 5,
        });

        const first = await worker.drainOnce();
        const second = await worker.drainOnce();

        expect(first.done + second.done).toBe(1);
        expect(second.processed).toBe(0); // nothing left to retry
        const ledger = db.deliveries.getById(intent.id)!;
        expect(ledger.status).toBe('failed');
        expect(ledger.remoteStatus).toBe('failed');
        expect(terminal).toEqual(['remote_failed']);
      });
    });
  });

  describe('settleDeliveryTerminal: the Slot cell follows the remote truth', () => {
    it('settles a delivery_pending cell as failed (NEVER submitted) for remote_failed', async () => {
      await withDb(async (db) => {
        const slot = prepareDeliveryCell(db);
        const intent = insertBoundIntent(db, slot.slotId);

        const applied = settleDeliveryTerminal(db, intent.id, {
          kind: 'remote_failed',
          remoteId: '59',
          remoteStatus: 'failed',
          error: 'downstream reported terminal status failed',
        });

        expect(applied).toBe(true);
        const cell = db.slots.getCell(slot.slotId, SLOT_TARGET)!;
        expect(cell.status).toBe('failed');
        expect(cell.status).not.toBe('submitted');
        expect(cell.lastError).toContain('failed');
      });
    });

    it('still promotes a confirmed accepted ack to submitted', async () => {
      await withDb(async (db) => {
        const slot = prepareDeliveryCell(db);
        const intent = insertBoundIntent(db, slot.slotId);

        settleDeliveryTerminal(db, intent.id, { kind: 'accepted', remoteId: '60' });

        expect(db.slots.getCell(slot.slotId, SLOT_TARGET)!.status).toBe('submitted');
      });
    });

    it('settles a historical duplicate as duplicate, not submitted', async () => {
      await withDb(async (db) => {
        const slot = prepareDeliveryCell(db);
        const intent = insertBoundIntent(db, slot.slotId);

        settleDeliveryTerminal(db, intent.id, {
          kind: 'duplicate_existing',
          remoteId: '1',
          matchedKey: 'older-key',
        });

        expect(db.slots.getCell(slot.slotId, SLOT_TARGET)!.status).toBe('duplicate');
      });
    });

    it('is a no-op for an intent with no Slot (ad-hoc/batch run)', async () => {
      await withDb(async (db) => {
        const intent = db.deliveries.insertIntent({
          id: 'd-adhoc',
          deliveryTarget: 'telepost',
          workType: 'illustration',
          pixivId: '777',
          idempotencyKey: 'adhoc-key',
        }).row;

        expect(
          settleDeliveryTerminal(db, intent.id, {
            kind: 'remote_failed',
            remoteStatus: 'failed',
            error: 'x',
          })
        ).toBe(false);
      });
    });
  });

  describe('end to end: 2xx envelope with status=failed never ends as submitted', () => {
    it('runs the real parser -> outbox -> settle chain and fails the cell', async () => {
      await withDb(async (db) => {
        const parsed = parseDeliveryAck(200, failedReplayEnvelope);
        const dispatcher = new StubDispatcher([async () => ({ ack: parsed })]);
        const slot = prepareDeliveryCell(db);
        const intent = insertBoundIntent(db, slot.slotId);
        const worker = new OutboxWorker(db, dispatcher as never, {
          retryBaseMs: 0,
          onDeliveryTerminal: (deliveryId, ack) => settleDeliveryTerminal(db, deliveryId, ack),
        });
        db.outbox.enqueue({
          kind: 'delivery',
          deliveryTarget: 'telepost',
          idempotencyKey: 'outbox:e2e',
          deliveryId: intent.id,
          payload: { files: [], context: { idempotencyKey: intent.idempotencyKey } },
        });

        await worker.drainOnce();

        expect(db.deliveries.getById(intent.id)!.status).toBe('failed');
        expect(db.slots.getCell(slot.slotId, SLOT_TARGET)!.status).toBe('failed');
      });
    });
  });
});
