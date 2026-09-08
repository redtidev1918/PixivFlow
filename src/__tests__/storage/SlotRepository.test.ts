/**
 * Schedule Slot ledger tests: business-level idempotency for scheduled batches.
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

describe('Schedule Slot ledger', () => {
  it('creates a slot once and reports resume on duplicate', async () => {
    await withDb(async (db) => {
      const meta = { slotDate: '2026-09-08', slotName: 'morning', scheduleId: 'bot1-daily' };
      const first = db.slots.getOrCreateSlot('2026-09-08:morning', meta);
      expect(first.created).toBe(true);
      const second = db.slots.getOrCreateSlot('2026-09-08:morning', meta);
      expect(second.created).toBe(false);
      expect(second.slot.id).toBe(first.slot.id);
    });
  });

  it('morning/evening and different dates are independent slots', async () => {
    await withDb(async (db) => {
      db.slots.getOrCreateSlot('2026-09-08:morning', { slotDate: '2026-09-08', slotName: 'morning', scheduleId: 's' });
      db.slots.getOrCreateSlot('2026-09-08:evening', { slotDate: '2026-09-08', slotName: 'evening', scheduleId: 's' });
      db.slots.getOrCreateSlot('2026-09-09:morning', { slotDate: '2026-09-09', slotName: 'morning', scheduleId: 's' });
      expect(db.slots.getRecentSlots(10)).toHaveLength(3);
    });
  });

  it('UNIQUE(slot,target): one cell per target, ensured idempotently', async () => {
    await withDb(async (db) => {
      const slot = '2026-09-08:morning';
      db.slots.getOrCreateSlot(slot, { slotDate: '2026-09-08', slotName: 'morning', scheduleId: 's' });
      db.slots.ensureCell(slot, 'bot1-novel', 'novel');
      db.slots.ensureCell(slot, 'bot1-novel', 'novel'); // duplicate guard
      expect(db.slots.getCells(slot).filter((c) => c.targetId === 'bot1-novel')).toHaveLength(1);
    });
  });

  it('locks a selected work and never overwrites it on re-lock', async () => {
    await withDb(async (db) => {
      const slot = '2026-09-08:morning';
      db.slots.getOrCreateSlot(slot, { slotDate: '2026-09-08', slotName: 'morning', scheduleId: 's' });
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
      const slot = '2026-09-08:morning';
      db.slots.getOrCreateSlot(slot, { slotDate: '2026-09-08', slotName: 'morning', scheduleId: 's' });
      db.slots.ensureCell(slot, 'bot1-novel', 'novel');
      db.slots.lockCellWork(slot, 'bot1-novel', '123', 'novel');
      db.slots.clearCellWork(slot, 'bot1-novel');
      db.slots.lockCellWork(slot, 'bot1-novel', '456', 'novel');
      expect(db.slots.getCell(slot, 'bot1-novel')!.workId).toBe('456');
    });
  });

  it('deriveSlotStatus: all submitted=success, some=partial, none=failed', async () => {
    await withDb(async (db) => {
      const slot = '2026-09-08:morning';
      db.slots.getOrCreateSlot(slot, { slotDate: '2026-09-08', slotName: 'morning', scheduleId: 's' });
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
