/**
 * SlotCoordinator tests: durable occurrence membership + resume semantics.
 * Covers the invariants: existing-slot membership is stable across config
 * reload; a successful cell never auto-reruns; resolution is cron/tz based.
 */
import { Database } from '../../storage/Database';
import { SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { StandaloneConfig, ScheduleConfig, TargetConfig } from '../../config';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-coord-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  return fn(db).finally(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

const target = (id: string, type = 'illustration'): TargetConfig => ({ id, type }) as TargetConfig;
const schedule: ScheduleConfig = {
  id: 'schedule-a',
  name: 'Schedule A',
  cron: '0 10 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
} as ScheduleConfig;
const config = { schedulerRuntime: { trigger: { graceMinutes: 120 } } } as StandaloneConfig;

// 2026-09-08 10:00 Shanghai == 02:00 UTC.
const AT = new Date('2026-09-08T02:00:30Z');

describe('SlotCoordinator', () => {
  it('freezes target membership at creation; a later config reload does not add cells', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const r1 = coord.resolveOccurrence(schedule, config, 'http', AT);
      expect(r1.context).toBeDefined();
      const slot = r1.context!;

      // Occurrence materialized with targets [a, b].
      coord.prepare(slot, schedule, [target('a'), target('b')]);
      expect(db.slots.getSlotTargetIds(slot.slotId).sort()).toEqual(['a', 'b']);

      // Config reload adds c; a resume of the SAME occurrence must not pick up c.
      const pending = coord.pendingTargets(slot.slotId, [target('a'), target('b'), target('c')]);
      expect(pending.map((p) => p.target.id).sort()).toEqual(['a', 'b']);
    });
  });

  it('resume skips terminal cells (submitted / no_candidate) and reruns others', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a'), target('b'), target('c')]);

      coord.lockWork(slot.slotId, 'a', '100', 'illustration');
      coord.markCell(slot.slotId, 'a', 'submitted');
      coord.markCell(slot.slotId, 'b', 'no_candidate', 'no matching works');

      const pending = coord.pendingTargets(slot.slotId, [target('a'), target('b'), target('c')]);
      expect(pending.map((p) => p.target.id)).toEqual(['c']);
    });
  });

  it('a locked work id survives a resume (automatic retry never swaps it)', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a')]);
      coord.lockWork(slot.slotId, 'a', '100', 'illustration');

      // Simulate process restart: rebuild coordinator, re-open same slot.
      const coord2 = new SlotCoordinator(db);
      const again = coord2.prepare(slot, schedule, [target('a')]);
      expect(again.alreadyCompleted).toBe(false); // resumed, not a new terminal slot
      const cell = db.slots.getCell(slot.slotId, 'a')!;
      expect(cell.workId).toBe('100');
      expect(cell.status).toBe('selected');
    });
  });

  it('aggregate finish marks the slot partial when some cells are no_candidate', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a'), target('b')]);
      coord.lockWork(slot.slotId, 'a', '100', 'illustration');
      coord.markCell(slot.slotId, 'a', 'submitted');
      coord.markCell(slot.slotId, 'b', 'no_candidate', 'none');
      const summary = coord.finish(slot, schedule, [target('a'), target('b')]);
      expect(summary.status).toBe('partial');
      expect(db.slots.getSlot(slot.slotId)?.status).toBe('partial');
    });
  });
});


describe('SlotCoordinator failure injection', () => {
  it('duplicate triggers converge: a live run lease rejects a parallel second trigger', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a')]);

      expect(coord.claimRunLease(slot.slotId, 'trigger-1', 60_000)).toBe(true);
      // A duplicate HTTP trigger arriving while trigger-1 is live must NOT
      // acquire a parallel lease (which would double-post).
      expect(coord.claimRunLease(slot.slotId, 'trigger-2', 60_000)).toBe(false);
      // Same owner may heartbeat/renew.
      coord.heartbeatLease(slot.slotId, 'trigger-1', 60_000);
      // After a crash the stored lease expiry passes and a restart reclaims it
      // (simulated by a lease that expired 1s ago relative to a later clock).
      expect(db.slots.claimSlotLease(slot.slotId, 'restart', 60_000, Date.now() + 61_000)).toBe(true);
    });
  });

  it('a confirmed submitted cell can never be downgraded by a late duplicate/failure', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a')]);

      coord.lockWork(slot.slotId, 'a', '100', 'illustration');
      coord.applyOutcome(slot.slotId, 'a', { kind: 'submitted', workId: '100', workType: 'illustration' });
      expect(db.slots.getCell(slot.slotId, 'a')!.status).toBe('submitted');

      // ACK lost -> a retry reports the historical duplicate of the SAME work.
      // It must stay submitted, not move to the 'duplicate' drift state.
      coord.applyOutcome(slot.slotId, 'a', {
        kind: 'duplicate', workId: '100', reason: 'already posted',
      });
      expect(db.slots.getCell(slot.slotId, 'a')!.status).toBe('submitted');

      // A spurious retryable failure also cannot un-confirm it.
      coord.applyOutcome(slot.slotId, 'a', { kind: 'failed', retryable: true, error: 'late timeout' });
      expect(db.slots.getCell(slot.slotId, 'a')!.status).toBe('submitted');
    });
  });

  it('retryable failure before ACK keeps the locked work so a resume posts the SAME work', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a')]);

      coord.lockWork(slot.slotId, 'a', '100', 'illustration');
      coord.applyOutcome(slot.slotId, 'a', { kind: 'failed', retryable: true, error: 'connection reset' });

      const cell = db.slots.getCell(slot.slotId, 'a')!;
      expect(cell.status).toBe('selected'); // still non-terminal
      expect(cell.workId).toBe('100'); // resume must not swap to another work

      // Resume path immediately re-runs this cell.
      expect(coord.pendingTargets(slot.slotId, [target('a')]).map((p) => p.target.id)).toEqual(['a']);

      // The eventual ACK promotes it exactly once.
      coord.markDelivered(slot.slotId, 'a', '100', 'illustration');
      expect(db.slots.getCell(slot.slotId, 'a')!.status).toBe('submitted');
      expect(coord.pendingTargets(slot.slotId, [target('a')])).toEqual([]);
    });
  });

  it('delivery_pending survives a crash and resumes toward submitted on the ACK', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a')]);

      coord.applyOutcome(slot.slotId, 'a', {
        kind: 'delivery_pending', workId: '100', workType: 'illustration', deliveryId: 'd-1',
      });
      expect(db.slots.getCell(slot.slotId, 'a')!.status).toBe('delivery_pending');
      // Not terminal: a restart still owes this cell an ACK.
      expect(coord.pendingTargets(slot.slotId, [target('a')])).toHaveLength(1);

      coord.markDelivered(slot.slotId, 'a', '100', 'illustration');
      expect(db.slots.getCell(slot.slotId, 'a')!.status).toBe('submitted');
    });
  });
});