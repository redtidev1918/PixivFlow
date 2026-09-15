/**
 * Manual refetch is FIRST-CLASS durable business execution (§manual-resume).
 *
 * The remote replacement is a cross-service workflow: accepted request →
 * durable manual slot → durable cell → durable work binding → durable delivery
 * intent → durable outcome. This file pins the crash-resume semantics that let
 * ANY of those stages survive a restart/wake with the SAME request UUID:
 *
 *  - the same request_id always resolves to the SAME slot (no second chain);
 *  - a resumed slot never re-selects a different work (locked work survives);
 *  - a durable delivery intent is retried as-is, never re-selected;
 *  - manual slots are counted as active work and are recoverable like any
 *    scheduled slot — the idle lifecycle and recovery loop must treat them as
 *    unfinished obligations.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { SlotCoordinator, SlotContext } from '../../scheduler/SlotCoordinator';
import { TargetConfig } from '../../config';

const REQUEST = '5b8e6060-07bd-466f-87d1-251b7efcdebc';

const manualSlot: SlotContext = {
  slotId: `bot1-daily@manual-${REQUEST}`,
  scheduleId: 'bot1-daily',
  occurrenceAt: Date.now(),
  occurrenceDate: '2026-09-15',
  occurrenceLabel: 'manual',
  timezone: 'Asia/Shanghai',
  triggerSource: 'manual',
  slotName: '审核群重抓',
  slotDate: '2026-09-15',
  manualRequestId: REQUEST,
  correlationId: 'chain-83',
};

const schedule = { id: 'bot1-daily', name: 'Bot1 daily' } as any;

const illust: TargetConfig = {
  id: 'bot1-illust-botefuku',
  type: 'illustration',
  tag: 'ボテ腹',
  storageMode: 'cache',
  mode: 'topic',
  delivery: { target: 'bot1-submit' },
} as TargetConfig;

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-manual-resume-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('manual refetch idempotent identity', () => {
  it('the same request UUID always resolves to the SAME manual slot', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      const first = db.slots.getOrCreateSlot(manualSlot.slotId, {
        ...manualSlot, targetIds: [illust.id!],
      });
      expect(first.created).toBe(true);
      // A watchdog wake / duplicate trigger with the same UUID must NOT create
      // a second manual slot or a second chain.
      const second = db.slots.getOrCreateSlot(manualSlot.slotId, {
        ...manualSlot, targetIds: [illust.id!],
      });
      expect(second.created).toBe(false);
      expect(second.slot.id).toBe(manualSlot.slotId);
      expect(db.slots.findManualSlot(REQUEST, illust.id!)?.id).toBe(manualSlot.slotId);
    });
  });

  it('countActiveSlots includes the manual obligation (idle lifecycle must wait)', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      coordinator.prepare(manualSlot, schedule, [illust]);
      coordinator.markRunning(manualSlot.slotId);
      // The manual slot alone must be enough to keep the worker awake.
      expect(db.slots.countActiveSlots()).toBe(1);
      coordinator.applyOutcome(manualSlot.slotId, illust.id!, {
        kind: 'no_candidate', reason: 'all candidates duplicate',
      });
      coordinator.finish(manualSlot, schedule, [illust]);
      expect(db.slots.countActiveSlots()).toBe(0);
    });
  });

  it('a released lease leaves the manual slot recoverable for the next wake', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      coordinator.prepare(manualSlot, schedule, [illust]);
      coordinator.claimRunLease(manualSlot.slotId, 'run-1', Date.now() + 60_000);
      coordinator.releaseRunLease(manualSlot.slotId, 'run-1');
      const recoverable = db.slots.recoverableSlots();
      expect(recoverable.map((s) => s.id)).toContain(manualSlot.slotId);
    });
  });
});

describe('manual refetch crash-resume keeps business identity', () => {
  it('work locked before a crash stays locked on resume (never re-selects)', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      coordinator.prepare(manualSlot, schedule, [illust]);
      coordinator.lockWork(manualSlot.slotId, illust.id!, '149654619', 'illustration');
      const cell = db.slots.getCell(manualSlot.slotId, illust.id!)!;
      expect(cell.workId).toBe('149654619');

      // Fresh coordinator on the same durable DB (the restarted worker).
      const resumed = new SlotCoordinator(db);
      const pending = resumed.pendingTargets(manualSlot.slotId, [illust]);
      expect(pending.length).toBe(1);
      const contexts = resumed.executionContextsFor(manualSlot.slotId, pending);
      // The resumed run MUST continue the SAME work, not pick a new candidate.
      expect(contexts.get(illust.id!)?.lockedWorkId).toBe('149654619');
    });
  });

  it('a durable delivery intent is retried as-is, never re-selected', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db, {
        stateFor: () => ({ kind: 'live' as const }),
      });
      coordinator.prepare(manualSlot, schedule, [illust]);
      coordinator.applyOutcome(manualSlot.slotId, illust.id!, {
        kind: 'delivery_pending', workId: '149661816', workType: 'illustration',
        deliveryId: 'dlv-1',
      });
      // The outbox owns the retry of the SAME work; re-selection is refused.
      const pending = coordinator.pendingTargets(manualSlot.slotId, [illust]);
      expect(pending).toHaveLength(0);
    });
  });
});