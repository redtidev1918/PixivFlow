/**
 * Schedule Slot ledger tests: durable occurrence identity + business-level
 * idempotency (one slot per occurrence, one cell per target, stable work lock).
 */
import { Database } from '../../storage/Database';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-slot-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  return fn(db).finally(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

// New-style occurrence metadata (schedule-scoped id, frozen membership).
const meta = (scheduleId: string, targetIds: string[]) => ({
  scheduleId,
  occurrenceAt: Date.parse('2026-09-08T02:00:00Z'),
  occurrenceDate: '2026-09-08',
  occurrenceLabel: '10:00',
  timezone: 'Asia/Shanghai',
  targetIds,
});

describe('Schedule Slot ledger', () => {
  it('creates a slot once and reports resume on duplicate', async () => {
    await withDb(async (db) => {
      const id = 'schedule-a@2026-09-08T1000';
      const first = db.slots.getOrCreateSlot(id, meta('schedule-a', ['t1']));
      expect(first.created).toBe(true);
      const second = db.slots.getOrCreateSlot(id, meta('schedule-a', ['t1']));
      expect(second.created).toBe(false);
      expect(second.slot.id).toBe(first.slot.id);
    });
  });

  it('different schedules / occurrences are independent slots', async () => {
    await withDb(async (db) => {
      db.slots.getOrCreateSlot('schedule-a@2026-09-08T1000', meta('schedule-a', ['t1']));
      db.slots.getOrCreateSlot('schedule-a@2026-09-08T1800', meta('schedule-a', ['t1']));
      db.slots.getOrCreateSlot('schedule-b@2026-09-08T1000', meta('schedule-b', ['t1']));
      expect(db.slots.getRecentSlots(10)).toHaveLength(3);
    });
  });

  it('snapshots target membership at creation and ignores later config reload', async () => {
    await withDb(async (db) => {
      const id = 'schedule-a@2026-09-08T1000';
      db.slots.getOrCreateSlot(id, meta('schedule-a', ['a', 'b']));
      db.slots.materializeCells(id, ['a', 'b'], () => 'illustration');
      // A later config with targets [a,b,c] must NOT add c to this occurrence.
      const again = db.slots.getOrCreateSlot(id, meta('schedule-a', ['a', 'b', 'c']));
      expect(again.created).toBe(false);
      expect(db.slots.getSlotTargetIds(id).sort()).toEqual(['a', 'b']);
      // Re-materializing is idempotent (ON CONFLICT DO NOTHING).
      db.slots.materializeCells(id, ['a', 'b', 'c'], () => 'illustration');
      expect(db.slots.getCells(id).map((c) => c.targetId).sort()).toEqual(['a', 'b']);
    });
  });

  it('UNIQUE(slot,target): one cell per target, materialized idempotently', async () => {
    await withDb(async (db) => {
      const slot = 'schedule-a@2026-09-08T1000';
      db.slots.getOrCreateSlot(slot, meta('schedule-a', ['bot1-novel']));
      db.slots.materializeCells(slot, ['bot1-novel'], () => 'novel');
      db.slots.ensureCell(slot, 'bot1-novel', 'novel'); // duplicate guard
      expect(db.slots.getCells(slot).filter((c) => c.targetId === 'bot1-novel')).toHaveLength(1);
    });
  });

  it('locks a selected work and never overwrites it on re-lock', async () => {
    await withDb(async (db) => {
      const slot = 'schedule-a@2026-09-08T1000';
      db.slots.getOrCreateSlot(slot, meta('schedule-a', ['bot1-novel']));
      db.slots.ensureCell(slot, 'bot1-novel', 'novel');
      db.slots.lockCellWork(slot, 'bot1-novel', '123', 'novel');
      // A retry must keep the same work id.
      db.slots.lockCellWork(slot, 'bot1-novel', '456', 'novel');
      const cell = db.slots.getCell(slot, 'bot1-novel')!;
      expect(cell.workId).toBe('123');
      expect(cell.status).toBe('selected');
    });
  });

  it('clearCellWork is the explicit replace path (allows a new candidate)', async () => {
    await withDb(async (db) => {
      const slot = 'schedule-a@2026-09-08T1000';
      db.slots.getOrCreateSlot(slot, meta('schedule-a', ['bot1-novel']));
      db.slots.ensureCell(slot, 'bot1-novel', 'novel');
      db.slots.lockCellWork(slot, 'bot1-novel', '123', 'novel');
      db.slots.clearCellWork(slot, 'bot1-novel');
      db.slots.lockCellWork(slot, 'bot1-novel', '456', 'novel');
      expect(db.slots.getCell(slot, 'bot1-novel')!.workId).toBe('456');
    });
  });

  it('deriveSlotStatus: all submitted=success, some=partial, none=failed', async () => {
    await withDb(async (db) => {
      const slot = 'schedule-a@2026-09-08T1000';
      db.slots.getOrCreateSlot(slot, meta('schedule-a', ['bot1-illust', 'bot1-novel', 'bot2-illust', 'bot2-novel']));
      const targets = [
        ['bot1-illust', 'illustration'],
        ['bot1-novel', 'novel'],
        ['bot2-illust', 'illustration'],
        ['bot2-novel', 'novel'],
      ] as const;
      for (const [id, type] of targets) db.slots.ensureCell(slot, id, type);

      db.slots.setCellStatus(slot, 'bot1-illust', 'submitted');
      db.slots.setCellStatus(slot, 'bot1-novel', 'submitted');
      db.slots.setCellStatus(slot, 'bot2-illust', 'submitted');
      db.slots.setCellStatus(slot, 'bot2-novel', 'no_candidate');
      expect(db.slots.deriveSlotStatus(slot)).toBe('partial');

      db.slots.setCellStatus(slot, 'bot2-novel', 'submitted');
      expect(db.slots.deriveSlotStatus(slot)).toBe('success');
    });
  });
});
