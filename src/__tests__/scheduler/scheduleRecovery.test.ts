/**
 * P0-A regression contract (§schedule-recovery): a scheduled occurrence whose
 * required target produces nothing must exhaust a BOUNDED fallback before it
 * may roll up as a degraded (partial/failed) terminal result — and recovery
 * must never re-run a cell that already submitted.
 *
 * These tests pin the durable ledger mechanics that `scheduler-runtime`'s
 * fallback passes are built on. The runtime loop itself is a bounded
 * composition of exactly these primitives:
 *
 *   stage < max-1  +  no_candidate/duplicate  ->  advanceFallback (pending)
 *   stage == max-1 +  no_candidate/duplicate  ->  applyOutcome (terminal)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { SlotCoordinator, SlotContext } from '../../scheduler/SlotCoordinator';
import { fallbackScanLimit } from '../../commands/scheduler-runtime';
import { TargetConfig } from '../../config';

const slot: SlotContext = {
  slotId: 'bot1-daily@2026-09-14T2200',
  scheduleId: 'bot1',
  occurrenceAt: Date.parse('2026-09-14T14:00:00Z'),
  occurrenceDate: '2026-09-14',
  occurrenceLabel: '22:00',
  timezone: 'Asia/Shanghai',
  triggerSource: 'http',
  slotName: '22:00',
  slotDate: '2026-09-14',
};

const schedule = { id: 'bot1', name: 'Bot1' } as any;

const illust: TargetConfig = {
  id: 'bot1-illust',
  type: 'illustration',
  tag: 'ボテ腹',
  delivery: { target: 'bot1-submit' },
} as TargetConfig;
const novel: TargetConfig = {
  id: 'bot1-novel',
  type: 'novel',
  tag: 'ボテ腹',
  delivery: { target: 'bot1-submit' },
} as TargetConfig;

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-recovery-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('fallbackScanLimit stays bounded per stage', () => {
  it('multiplies the base by stage+1 and hard-caps at 100', () => {
    expect(fallbackScanLimit(5, 0)).toBe(5);
    expect(fallbackScanLimit(5, 1)).toBe(10);
    expect(fallbackScanLimit(5, 2)).toBe(15);
    expect(fallbackScanLimit(40, 3)).toBe(100);
    expect(fallbackScanLimit(3, 40)).toBe(100);
    expect(fallbackScanLimit(0, 1)).toBe(2); // floors at 1 before multiplying
  });

  it('keeps an undeclared bound undefined (handler default applies)', () => {
    expect(fallbackScanLimit(undefined, 2)).toBeUndefined();
  });
});

describe('candidate fallback ledger', () => {
  it('bumpFallbackStage advances durably, returns the cell to pending and clears completed_at', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      coordinator.prepare(slot, schedule, [illust]);
      const cell = db.slots.getCell(slot.slotId, illust.id!)!;
      expect(cell.fallback_stage).toBe(0);
      expect(cell.status).toBe('pending');

      // First selection finds nothing -> stage 1, still pending.
      expect(db.slots.bumpFallbackStage(slot.slotId, illust.id!, 'all 6 candidates duplicate')).toBe(1);
      let after = db.slots.getCell(slot.slotId, illust.id!)!;
      expect(after.fallback_stage).toBe(1);
      expect(after.status).toBe('pending');
      expect(after.lastError).toContain('duplicate');

      // Stage 2.
      expect(db.slots.bumpFallbackStage(slot.slotId, illust.id!, 'still nothing')).toBe(2);
      after = db.slots.getCell(slot.slotId, illust.id!)!;
      expect(after.fallback_stage).toBe(2);
      expect(after.completedAt).toBeNull();
    });
  });

  it('a fallback stage survives a database reopen (crash-resume re-enters the same stage)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-recovery-crash-'));
    try {
      const db = new Database(join(dir, 'test.db'));
      db.migrate();
      const coordinator = new SlotCoordinator(db);
      coordinator.prepare(slot, schedule, [illust]);
      db.slots.bumpFallbackStage(slot.slotId, illust.id!, 'transient outage, resume later');
      db.close();

      // The process died here; a fresh worker opens the same database.
      const resumed = new Database(join(dir, 'test.db'));
      resumed.migrate();
      const cell = resumed.slots.getCell(slot.slotId, illust.id!)!;
      expect(cell.fallback_stage).toBe(1);
      expect(cell.status).toBe('pending');
      // The resumed worker's pendingTargets must surface it for another pass —
      // and it MUST be the same stage, not a fresh primary selection.
      const pending = new SlotCoordinator(resumed).pendingTargets(slot.slotId, [illust]);
      expect(pending.map((p) => p.target.id)).toEqual([illust.id]);
      expect(pending[0].cell.fallback_stage).toBe(1);
      resumed.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('advanceFallback is bounded: it refuses once the budget is exhausted', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      coordinator.prepare(slot, schedule, [illust]);
      db.slots.bumpFallbackStage(slot.slotId, illust.id!, 'one');
      db.slots.bumpFallbackStage(slot.slotId, illust.id!, 'two');
      expect(db.slots.cellFallbackStage(slot.slotId, illust.id!)).toBe(2);

      // maxFallbackStages = 2 -> stage 2 is terminal; no further advance.
      expect(coordinator.advanceFallback(slot.slotId, illust.id!, 'more', 2)).toBe(2);
      expect(db.slots.cellFallbackStage(slot.slotId, illust.id!)).toBe(2);
      // Cell stays pending so the FINAL pass can still run and terminalise it.
      expect(db.slots.getCell(slot.slotId, illust.id!)?.status).toBe('pending');
    });
  });

  it('recovery never re-runs a submitted sibling cell', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      coordinator.prepare(slot, schedule, [illust, novel]);
      coordinator.applyOutcome(slot.slotId, illust.id!, { kind: 'submitted', workId: '1001', workType: 'novel' });
      db.slots.bumpFallbackStage(slot.slotId, novel.id!, 'nothing at stage 1');

      const pending = coordinator.pendingTargets(slot.slotId, [illust, novel]);
      expect(pending.map((p) => p.target.id)).toEqual([novel.id]);
    });
  });
});

describe('terminal rollup after fallback exhaustion', () => {
  it('an exhausted target reports its TRUE terminal cause, never a generic failure', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      const prepared = coordinator.prepare(slot, schedule, [illust, novel]);
      expect(prepared.alreadyCompleted).toBe(false);

      // The illustration submits on the primary pass.
      coordinator.applyOutcome(slot.slotId, illust.id!, { kind: 'submitted', workId: '29118637', workType: 'illustration' });

      // The novel's primary + every fallback pass produces nothing.
      // scheduler-runtime's hook advances stages 0..max-2 and applies the real
      // outcome at the FINAL stage (maxFallbackStages = 3 => stage 2 is final).
      const maxStages = 3;
      for (let stage = 1; stage <= maxStages - 1; stage += 1) {
        expect(coordinator.advanceFallback(slot.slotId, novel.id!, `no candidate at stage ${stage}`, maxStages)).toBe(stage);
      }
      // Final executed stage: the true no_candidate outcome is applied.
      coordinator.applyOutcome(slot.slotId, novel.id!, { kind: 'no_candidate', reason: 'all candidates duplicate after 3 passes' });

      const novelCell = db.slots.getCell(slot.slotId, novel.id!)!;
      expect(novelCell.status).toBe('no_candidate');
      expect(novelCell.fallback_stage).toBe(2);

      const summary = coordinator.finish(slot, schedule, [illust, novel]);
      expect(summary.status).toBe('partial'); // one submitted, one exhausted
      expect(summary.cells.find((c) => c.targetId === novel.id)?.status).toBe('no_candidate');
      expect(summary.cells.find((c) => c.targetId === illust.id)?.status).toBe('submitted');
      // The terminal no_candidate row must survive the rollup untouched.
      expect(db.slots.getCell(slot.slotId, novel.id!)?.status).toBe('no_candidate');
      // Recovery must treat this slot as done: it is not re-runnable.
      expect(coordinator.prepare(slot, schedule, [illust, novel]).alreadyCompleted).toBe(true);
    });
  });

  it('a slot where every target exhausted is failed, and still terminal', () => {
    withDb((db) => {
      const coordinator = new SlotCoordinator(db);
      coordinator.prepare(slot, schedule, [illust, novel]);
      coordinator.applyOutcome(slot.slotId, illust.id!, { kind: 'no_candidate', reason: 'nothing at all' });
      coordinator.applyOutcome(slot.slotId, novel.id!, { kind: 'no_candidate', reason: 'nothing at all' });
      const summary = coordinator.finish(slot, schedule, [illust, novel]);
      expect(summary.status).toBe('failed');
      // A failed slot stays recoverable by re-trigger, but every cell is
      // terminal: a re-trigger finds nothing to run and cannot duplicate work.
      expect(coordinator.pendingTargets(slot.slotId, [illust, novel])).toHaveLength(0);
    });
  });
});