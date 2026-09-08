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
      coord.begin(slot, schedule, [target('a'), target('b')]);
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
      coord.begin(slot, schedule, [target('a'), target('b'), target('c')]);

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
      coord.begin(slot, schedule, [target('a')]);
      coord.lockWork(slot.slotId, 'a', '100', 'illustration');

      // Simulate process restart: rebuild coordinator, re-open same slot.
      const coord2 = new SlotCoordinator(db);
      const again = coord2.begin(slot, schedule, [target('a')]);
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
      coord.begin(slot, schedule, [target('a'), target('b')]);
      coord.lockWork(slot.slotId, 'a', '100', 'illustration');
      coord.markCell(slot.slotId, 'a', 'submitted');
      coord.markCell(slot.slotId, 'b', 'no_candidate', 'none');
      const summary = coord.finish(slot, schedule, [target('a'), target('b')]);
      expect(summary.status).toBe('partial');
      expect(db.slots.getSlot(slot.slotId)?.status).toBe('partial');
    });
  });
});
