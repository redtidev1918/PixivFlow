/**
 * WORK-IDENTITY INVARIANT
 *
 *   (slotId, targetId) -> ONE stable workId
 *
 * A crash / shutdown / lease recovery is NOT an intentional second run. It must
 * continue the work the cell already owns; re-running selection on resume would
 * silently re-point the logical item at a different work (A -> B), leaving A
 * downloaded-but-never-delivered while the item reports success.
 *
 * These tests pin the coordinator half of that contract: the CAS binding, the
 * provisional release, what a resume hands to the handler, and the hand-off of
 * `delivery_pending` cells to the outbox (C).
 */
import { Database } from '../../storage/Database';
import { CellDeliveryState, SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { StandaloneConfig, ScheduleConfig, TargetConfig } from '../../config';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function withDb<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-workid-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  return Promise.resolve()
    .then(() => fn(db))
    .finally(() => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    });
}

/** One work per run: the shape the work-identity invariant is defined for. */
const singleWorkTarget = (id: string): TargetConfig =>
  ({
    id,
    type: 'illustration',
    mode: 'topic',
    topic: 'landscape',
    date: 'YESTERDAY',
    limit: 1,
    storageMode: 'cache',
    delivery: { target: 'telepost' },
  }) as TargetConfig;

/** Ten works per run: one cell legitimately owns N works, so no single identity. */
const multiWorkTarget = (id: string): TargetConfig =>
  ({
    id,
    type: 'illustration',
    mode: 'search',
    tag: 'landscape',
    limit: 10,
    storageMode: 'cache',
    delivery: { target: 'telepost' },
  }) as TargetConfig;

const schedule = {
  id: 'schedule-a',
  name: 'Schedule A',
  cron: '0 10 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
} as ScheduleConfig;
const config = { schedulerRuntime: { trigger: { graceMinutes: 120 } } } as StandaloneConfig;
// 2026-09-08 10:00 Shanghai == 02:00 UTC.
const AT = new Date('2026-09-08T02:00:30Z');

const fixedPort = (state: CellDeliveryState) => ({ stateFor: () => state });

describe('work identity (slotId, targetId) -> workId', () => {
  it('a resume hands the locked work back to the handler instead of re-selecting', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [singleWorkTarget('daily')]);
      coord.lockWorkCas(slot.slotId, 'daily', '100', 'illustration');

      // Process restart: the resumed cell must carry the identity to the handler.
      const coord2 = new SlotCoordinator(db);
      const pending = coord2.pendingTargets(slot.slotId, [singleWorkTarget('daily')]);

      expect(pending).toHaveLength(1);
      expect(pending[0].cell.workId).toBe('100');
      expect(pending[0].cell.status).toBe('selected');
    });
  });

  it('first selection wins: two racing workers elect exactly one work', async () => {
    await withDb((db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [singleWorkTarget('daily')]);

      const worker1 = coord.lockWorkCas(slot.slotId, 'daily', '100', 'illustration');
      const worker2 = coord.lockWorkCas(slot.slotId, 'daily', '200', 'illustration');

      expect(worker1).toEqual({ workId: '100', won: true });
      // The loser must continue with the winner, never with its own candidate.
      expect(worker2).toEqual({ workId: '100', won: false });
      expect(db.slots.getCell(slot.slotId, 'daily')!.workId).toBe('100');
      expect(db.slots.getCell(slot.slotId, 'daily')!.status).toBe('selected');
    });
  });

  it('re-binding the same work is idempotent, so retries keep the identity', async () => {
    await withDb((db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [singleWorkTarget('daily')]);

      expect(coord.lockWorkCas(slot.slotId, 'daily', '100', 'illustration').won).toBe(true);
      expect(coord.lockWorkCas(slot.slotId, 'daily', '100', 'illustration').won).toBe(true);
      expect(db.slots.getCell(slot.slotId, 'daily')!.workId).toBe('100');
    });
  });

  it('releases a provisional binding so an unbound cell can try the next candidate', async () => {
    await withDb((db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [singleWorkTarget('daily')]);

      coord.lockWorkCas(slot.slotId, 'daily', '100', 'illustration');
      coord.releaseWorkCas(slot.slotId, 'daily', '100');

      const cell = db.slots.getCell(slot.slotId, 'daily')!;
      expect(cell.workId).toBeNull();
      expect(cell.status).toBe('pending');
      // The freed cell may bind a different work.
      expect(coord.lockWorkCas(slot.slotId, 'daily', '200', 'illustration')).toEqual({
        workId: '200',
        won: true,
      });
    });
  });

  it('never releases a released-after-commit binding: a delivery_pending cell keeps its work', async () => {
    await withDb((db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [singleWorkTarget('daily')]);

      coord.lockWorkCas(slot.slotId, 'daily', '100', 'illustration');
      coord.applyOutcome(slot.slotId, 'daily', {
        kind: 'delivery_pending',
        workId: '100',
        workType: 'illustration',
        deliveryId: 'delivery-1',
      });

      // A late release (e.g. the enqueue threw after the artifact was persisted)
      // must not erase an identity that already has side effects behind it.
      coord.releaseWorkCas(slot.slotId, 'daily', '100');

      const cell = db.slots.getCell(slot.slotId, 'daily')!;
      expect(cell.workId).toBe('100');
      expect(cell.status).toBe('delivery_pending');
    });
  });

  it('a release can never clear ANOTHER work\'s binding', async () => {
    await withDb((db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [singleWorkTarget('daily')]);
      coord.lockWorkCas(slot.slotId, 'daily', '100', 'illustration');

      coord.releaseWorkCas(slot.slotId, 'daily', '999');

      expect(db.slots.getCell(slot.slotId, 'daily')!.workId).toBe('100');
    });
  });

  describe('delivery_pending ownership (C)', () => {
    const withPendingDelivery = async (
      db: Database,
      coord: SlotCoordinator,
      target: TargetConfig,
      workId = '100'
    ) => {
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      coord.prepare(slot, schedule, [target]);
      coord.lockWorkCas(slot.slotId, target.id!, workId, 'illustration');
      coord.applyOutcome(slot.slotId, target.id!, {
        kind: 'delivery_pending',
        workId,
        workType: 'illustration',
        deliveryId: `delivery-${workId}`,
      });
      return slot;
    };

    it('delegates the cell to the outbox while the intent is still actionable', async () => {
      await withDb((db) => {
        const coord = new SlotCoordinator(db, fixedPort({ kind: 'live' }));
        return withPendingDelivery(db, coord, singleWorkTarget('daily')).then((slot) => {
          // Handler must NOT run: the outbox owns A and will ACK it to submitted.
          expect(coord.pendingTargets(slot.slotId, [singleWorkTarget('daily')])).toEqual([]);
          expect(db.slots.getCell(slot.slotId, 'daily')!.status).toBe('delivery_pending');
        });
      });
    });

    it('fails the cell on a terminal delivery failure instead of selecting another work', async () => {
      await withDb((db) => {
        const coord = new SlotCoordinator(
          db,
          fixedPort({ kind: 'lost', reason: 'outbox exhausted retries for work 100' })
        );
        return withPendingDelivery(db, coord, singleWorkTarget('daily')).then((slot) => {
          expect(coord.pendingTargets(slot.slotId, [singleWorkTarget('daily')])).toEqual([]);

          const cell = db.slots.getCell(slot.slotId, 'daily')!;
          expect(cell.status).toBe('failed');
          // The identity is preserved: the item FAILS as A, it never becomes B.
          expect(cell.workId).toBe('100');
        });
      });
    });

    it('heals a cell whose ACK landed but whose promotion was lost', async () => {
      await withDb((db) => {
        const coord = new SlotCoordinator(
          db,
          fixedPort({ kind: 'confirmed', workId: '100', workType: 'illustration' })
        );
        return withPendingDelivery(db, coord, singleWorkTarget('daily')).then((slot) => {
          expect(coord.pendingTargets(slot.slotId, [singleWorkTarget('daily')])).toEqual([]);
          // Promoted from the ledger instead of re-posting a second work.
          expect(db.slots.getCell(slot.slotId, 'daily')!.status).toBe('submitted');
        });
      });
    });

    it('keeps re-running cells that intentionally own N works per run', async () => {
      await withDb((db) => {
        const coord = new SlotCoordinator(db, fixedPort({ kind: 'live' }));
        return withPendingDelivery(db, coord, multiWorkTarget('feed')).then((slot) => {
          // One cell = N works here, so there is no single identity to pin: the
          // target must still run to fetch the remaining works of its feed.
          const pending = coord.pendingTargets(slot.slotId, [multiWorkTarget('feed')]);
          expect(pending.map((p) => p.target.id)).toEqual(['feed']);
        });
      });
    });
  });
});
