/**
 * SlotCoordinator tests: durable occurrence membership + resume semantics.
 * Covers the invariants: existing-slot membership is stable across config
 * reload; a successful cell never auto-reruns; resolution is cron/tz based.
 */
import { Database } from '../../storage/Database';
import { SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { logger } from '../../logger';
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

  it('a locked work id survives a resume AND is handed to the handler', async () => {
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

      // The column alone proves nothing — this was the original false comfort.
      // The resume path must actually carry the identity to the handler; if it
      // drops the cell, the handler re-ranks and selects a DIFFERENT work.
      // (The end-to-end assertion lives in
      //  __tests__/download/handlers/workIdentityRecovery.test.ts.)
      const pending = coord2.pendingTargets(slot.slotId, [target('a')]);
      expect(pending).toHaveLength(1);
      expect(pending[0].cell.workId).toBe('100');

      const contexts = coord2.executionContextsFor(slot.slotId, pending);
      expect(contexts.get('a')?.lockedWorkId).toBe('100');
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

/**
 * Terminal occurrence outcome: the ONE `schedule.outcome` record that says how an
 * occurrence actually ended. It is deduped by the existing durable
 * `execution.summary` row, so recovery that re-rolls the same terminal slot must
 * produce neither a second line nor a second row.
 */
describe('SlotCoordinator terminal schedule outcome', () => {
  let info: jest.SpyInstance;

  const outcomeCalls = (): unknown[][] =>
    info.mock.calls.filter((call) => (call[1] as { event?: string } | undefined)?.event === 'schedule.outcome');
  const lastOutcome = (): Record<string, any> => outcomeCalls().slice(-1)[0]?.[1] as Record<string, any>;

  beforeEach(() => {
    info = jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Requirement 5: exactly one line per terminal occurrence, even across a re-roll.
  it('emits schedule.outcome exactly once for a terminal slot, and not again on a re-roll', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a')]);
      coord.markRunning(slot.slotId); // gives the slot row its started_at
      coord.lockWork(slot.slotId, 'a', '100', 'illustration');
      coord.markCell(slot.slotId, 'a', 'submitted');

      coord.finish(slot, schedule, [target('a')]);
      expect(outcomeCalls()).toHaveLength(1);

      const rec = lastOutcome();
      expect(rec.slot_id).toBe(slot.slotId);
      expect(rec.schedule_id).toBe('schedule-a');
      expect(rec.status).toBe('success');
      expect(rec.occurrence_at).toBe('2026-09-08T02:00:00.000Z');
      expect(rec.occurrence_date).toBe('2026-09-08');
      expect(typeof rec.duration_ms).toBe('number');
      expect(rec.duration_ms).toBeGreaterThanOrEqual(0);
      expect(rec.cells).toMatchObject({
        total: 1,
        submitted: 1,
        no_match: 0,
        duplicate: 0,
        all_duplicates: false,
        executor_failed: 0,
        delivery_failed: 0,
      });

      // Recovery/restart re-rolls the SAME terminal occurrence: its durable
      // identity already exists, so no second row and no second line may appear.
      coord.finish(slot, schedule, [target('a')]);
      expect(outcomeCalls()).toHaveLength(1);

      // The durable row carries the IDENTICAL object, so the two cannot disagree.
      const rows = db.outbox
        .listEvents({ executionId: slot.slotId })
        .filter((e) => e.event === 'execution.summary');
      expect(rows).toHaveLength(1);
      const persisted = JSON.parse(String(rows[0].detail)) as { outcome: Record<string, unknown> };
      expect(persisted.outcome).toEqual(rec);
    });
  });

  // Requirement 6a: no_candidate is its own business category — not a failure,
  // not a duplicate — even though the aggregate slot status is `partial`.
  it('counts a no_candidate cell as no_match and never as a duplicate or failure', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a'), target('b')]);
      coord.lockWork(slot.slotId, 'a', '100', 'illustration');
      coord.markCell(slot.slotId, 'a', 'submitted');
      coord.markCell(slot.slotId, 'b', 'no_candidate', 'no matching works');

      const summary = coord.finish(slot, schedule, [target('a'), target('b')]);
      expect(summary.status).toBe('partial');

      const rec = lastOutcome();
      expect(rec.status).toBe('partial');
      expect(rec.cells).toMatchObject({
        total: 2,
        submitted: 1,
        no_match: 1,
        duplicate: 0,
        all_duplicates: false,
        executor_failed: 0,
        delivery_failed: 0,
      });
      expect(rec.cells.targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ target_id: 'a', status: 'submitted', work_id: '100' }),
          expect.objectContaining({ target_id: 'b', status: 'no_candidate', error: 'no matching works' }),
        ])
      );
    });
  });

  // Requirement 6b: "there was nothing new to post" is reported as such.
  it('reports all_duplicates when every non-submitted cell is a duplicate', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a'), target('b'), target('c')]);
      coord.lockWork(slot.slotId, 'a', '100', 'illustration');
      coord.markCell(slot.slotId, 'a', 'submitted');
      coord.lockWork(slot.slotId, 'b', '101', 'illustration');
      coord.markCell(slot.slotId, 'b', 'duplicate', 'already posted');
      coord.lockWork(slot.slotId, 'c', '102', 'illustration');
      coord.markCell(slot.slotId, 'c', 'duplicate', 'already posted');

      coord.finish(slot, schedule, [target('a'), target('b'), target('c')]);

      const rec = lastOutcome();
      expect(rec.cells).toMatchObject({
        total: 3,
        submitted: 1,
        duplicate: 2,
        all_duplicates: true,
        executor_failed: 0,
        delivery_failed: 0,
      });
    });
  });

  // A terminally lost delivery is a DISTINCT business failure, read from the
  // durable delivery ledger — never guessed from an error string.
  it('classifies a terminally lost delivery as delivery_failed, not executor_failed', async () => {
    await withDb(async (db) => {
      const cacheTarget = (id: string): TargetConfig =>
        ({ id, type: 'illustration', storageMode: 'cache', delivery: { target: 'telepost' } }) as unknown as TargetConfig;
      const delivery = {
        stateFor: ({ targetId }: { targetId: string }) =>
          targetId === 'lost'
            ? { kind: 'lost' as const, reason: 'permanent upstream 400' }
            : { kind: 'unknown' as const },
      };
      const coord = new SlotCoordinator(db, delivery);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      const targets = [cacheTarget('lost'), cacheTarget('broke')];
      coord.prepare(slot, schedule, targets);
      coord.markCell(slot.slotId, 'lost', 'failed', 'delivery intent dead');
      coord.markCell(slot.slotId, 'broke', 'failed', 'handler threw');

      coord.finish(slot, schedule, targets);

      const rec = lastOutcome();
      expect(rec.cells).toMatchObject({
        total: 2,
        submitted: 0,
        delivery_failed: 1,
        executor_failed: 1,
      });
      // Both cells are status `failed`; the durable ledger is what separated them.
      expect(db.slots.getCell(slot.slotId, 'lost')!.status).toBe('failed');
      expect(db.slots.getCell(slot.slotId, 'broke')!.status).toBe('failed');
    });
  });

  // A non-terminal occurrence has no terminal outcome to report at all.
  it('writes no schedule.outcome while a cell is still delivery_pending', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a'), target('b')]);
      coord.lockWork(slot.slotId, 'a', '100', 'illustration');
      coord.markCell(slot.slotId, 'a', 'submitted');
      coord.applyOutcome(slot.slotId, 'b', {
        kind: 'delivery_pending', workId: '101', workType: 'illustration', deliveryId: 'd-1',
      });

      const summary = coord.finish(slot, schedule, [target('a'), target('b')]);
      expect(summary.status).toBe('running');
      expect(outcomeCalls()).toHaveLength(0);
    });
  });
});