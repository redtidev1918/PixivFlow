/**
 * Regression tests for the 2026-09-12 production recovery loop.
 *
 * A scheduled run that OBEYED the scheduler timeout unwound through the
 * abnormal-abort path, which released the lease but left the Slot `running`.
 * `recoverableSlots()` matches a NULL lease on purpose — that is its "recorded
 * but never claimed" case for a crash between accept and claim — so the sweep
 * re-dispatched the SAME occurrence on every tick: three identical ~1800s
 * timeouts ~30 minutes apart, and a real Pixiv 429 penalty caused purely by the
 * repeated work.
 *
 * The invariant pinned here is the CRASH / ABANDONMENT split:
 *
 *   ABANDONED / TIMEOUT -> terminal Slot, NOT recoverable
 *   SHUTDOWN            -> non-terminal Slot, recoverable (resumes after restart)
 *   CRASH               -> non-terminal Slot, recoverable
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from '../../storage/Database';
import { SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { ScheduleConfig, TargetConfig } from '../../config';
import { shouldTerminaliseAbortedSlot } from '../../commands/scheduler-runtime';

type SlotCtx = Parameters<SlotCoordinator['finish']>[0];

const OCCURRENCE_AT = Date.parse('2026-09-12T10:00:00Z');
const SLOT_ID = 'bot1-daily@2026-09-12T1800';
const OWNER = 'run-642-7a0b3c61';
/** Exactly what the aborted run left on the illustration cell in production. */
const ABORT_ERROR = 'aborted before rate-limit slot';

const schedule: ScheduleConfig = {
  id: 'bot1',
  name: 'Bot1',
  cron: '0 10,18 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
} as ScheduleConfig;

const targets: TargetConfig[] = [
  { id: 'bot1-illust-botefuku', type: 'illustration' },
  { id: 'bot1-novel-botefuku', type: 'novel' },
] as TargetConfig[];

const slotCtx: SlotCtx = {
  slotId: SLOT_ID,
  scheduleId: 'bot1',
  occurrenceAt: OCCURRENCE_AT,
  occurrenceDate: '2026-09-12',
  occurrenceLabel: '18:00',
  timezone: 'Asia/Shanghai',
  triggerSource: 'http',
  slotName: '18:00',
  slotDate: '2026-09-12',
};

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-abandoned-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Reach the exact ledger state the production abort left behind: a claimed,
 * heartbeating Slot with the illustration cell already failed by the cancelled
 * download and the novel cell untouched.
 */
function seedAbortedRun(db: Database, coordinator: SlotCoordinator): void {
  db.slots.getOrCreateSlot(SLOT_ID, {
    scheduleId: 'bot1',
    occurrenceAt: OCCURRENCE_AT,
    occurrenceDate: '2026-09-12',
    occurrenceLabel: '18:00',
    timezone: 'Asia/Shanghai',
    targetIds: targets.map((t) => t.id) as string[],
    triggerSource: 'http',
    slotDate: '2026-09-12',
    slotName: '18:00',
  });
  db.slots.materializeCells(
    SLOT_ID,
    targets.map((t) => t.id) as string[],
    (id) => (id === 'bot1-illust-botefuku' ? 'illustration' : 'novel')
  );
  expect(coordinator.claimRunLease(SLOT_ID, OWNER, 180_000)).toBe(true);
  coordinator.markRunning(SLOT_ID);
  coordinator.markCell(SLOT_ID, 'bot1-illust-botefuku', 'failed', ABORT_ERROR);
}

describe('shouldTerminaliseAbortedSlot', () => {
  it('terminalises a live process that cancelled itself (scheduler timeout)', () => {
    expect(shouldTerminaliseAbortedSlot('timeout', false)).toBe(true);
  });

  it('terminalises an unexpected in-process abort that was never a cancellation', () => {
    // No cancellation was ever requested and the process is still up: nobody
    // else will finish this Slot, so it must not be left recoverable.
    expect(shouldTerminaliseAbortedSlot(null, false)).toBe(true);
  });

  it('leaves the Slot recoverable when the process is shutting down', () => {
    expect(shouldTerminaliseAbortedSlot('shutdown', false)).toBe(false);
  });

  it('does not roll up twice once the abandon path already terminalised it', () => {
    expect(shouldTerminaliseAbortedSlot('timeout', true)).toBe(false);
    expect(shouldTerminaliseAbortedSlot('shutdown', true)).toBe(false);
  });
});

describe('an abandoned scheduled run must not stay recoverable', () => {
  it('takes the Slot terminal, so the recovery sweep cannot re-dispatch it', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      seedAbortedRun(db, coordinator);

      // What the fixed abnormal-abort path does before handing the lease back.
      expect(shouldTerminaliseAbortedSlot('timeout', false)).toBe(true);
      coordinator.finish(slotCtx, schedule, targets);
      coordinator.releaseRunLease(SLOT_ID, OWNER);

      // Both cells end terminal: the untouched novel cell is rolled up rather
      // than left `pending`, which is what kept the Slot `running` forever.
      expect(db.slots.getCell(SLOT_ID, 'bot1-illust-botefuku')!.status).toBe('failed');
      expect(db.slots.getCell(SLOT_ID, 'bot1-novel-botefuku')!.status).toBe('failed');

      expect(db.slots.getSlot(SLOT_ID)!.status).toBe('failed');
      expect(db.slots.getSlot(SLOT_ID)!.leaseOwner).toBeNull();

      // The loop is broken: a released lease is not enough on its own.
      expect(db.slots.recoverableSlots().map((s) => s.id)).not.toContain(SLOT_ID);
    });
  });

  it('would loop forever without the terminal rollup (pre-fix behaviour)', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      seedAbortedRun(db, coordinator);

      // Pre-fix: release the lease, leave the status alone.
      coordinator.releaseRunLease(SLOT_ID, OWNER);

      expect(db.slots.getSlot(SLOT_ID)!.status).toBe('running');
      expect(db.slots.getSlot(SLOT_ID)!.leaseOwner).toBeNull();
      // A NULL lease is `recoverableSlots()`'s crash case, so the live worker's
      // abandoned Slot is indistinguishable from a crash and gets re-dispatched.
      expect(db.slots.recoverableSlots().map((s) => s.id)).toContain(SLOT_ID);
    });
  });

  it('still resumes the same occurrence when the process is shutting down', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      seedAbortedRun(db, coordinator);

      expect(shouldTerminaliseAbortedSlot('shutdown', false)).toBe(false);
      coordinator.releaseRunLease(SLOT_ID, OWNER);

      // Deliberately non-terminal: recovery after the restart resumes this Slot.
      expect(db.slots.getSlot(SLOT_ID)!.status).toBe('running');
      expect(db.slots.recoverableSlots().map((s) => s.id)).toContain(SLOT_ID);
    });
  });

  it('keeps a genuinely crashed worker recoverable', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      seedAbortedRun(db, coordinator);

      // A crash runs no code at all: the lease simply expires with the owner
      // still recorded, which is how recovery tells it apart from an abort.
      db.slots.claimSlotLease(SLOT_ID, OWNER, Date.now() - 1);

      expect(db.slots.getSlot(SLOT_ID)!.status).toBe('running');
      expect(db.slots.getSlot(SLOT_ID)!.leaseOwner).toBe(OWNER);
      expect(db.slots.recoverableSlots().map((s) => s.id)).toContain(SLOT_ID);
    });
  });
});
