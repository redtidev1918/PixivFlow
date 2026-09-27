/**
 * Liveness sweep tests (§liveness).
 *
 * Accepted work must never be able to sit non-terminal forever, and a slot that
 * is genuinely progressing must never be killed. Both halves are pinned here:
 *
 *   queued_too_long      -> admitted, never claimed, aged past the budget
 *   stalled_no_heartbeat -> claimed, then its worker stopped heartbeating
 *   live lease / fresh heartbeat -> NEVER eligible (the RC8 regression: a long
 *   healthy search that is merely slow must not be terminalised)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { Database } from '../../storage/Database';
import { MultiScheduleManager } from '../../scheduler/MultiScheduleManager';
import {
  DEFAULT_QUEUED_TIMEOUT_MS,
  DEFAULT_STALL_TIMEOUT_MS,
  STALL_SWEEP_MIN_TIMEOUT_MS,
  resolveStallTimeouts,
  sweepStalledSlots,
} from '../../scheduler/StallSweep';
import { StandaloneConfig } from '../../config';
import { logger } from '../../logger';

const REQUEST_ID = '11111111-2222-4333-8444-555555555555';

/** Poll until `predicate` is true (execute is fire-and-forget inside runNow). */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-stall-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Admitted-but-queued manual slot: exactly what the refetch endpoint creates. */
function seedPendingManualSlot(
  db: Database,
  slotId: string,
  targetId: string,
  scheduleId = 'plan-a'
): void {
  db.slots.getOrCreateSlot(slotId, {
    scheduleId,
    occurrenceAt: Date.now(),
    occurrenceDate: '2026-09-27',
    occurrenceLabel: 'manual',
    timezone: 'Asia/Shanghai',
    targetIds: [targetId],
    triggerSource: 'manual',
    slotDate: '2026-09-27',
    slotName: '审核群重抓',
    manualRequestId: REQUEST_ID,
    correlationId: 'chain-1',
  });
  db.slots.materializeCells(slotId, [targetId], () => 'illustration');
}

/** A claimed, running slot whose worker died: expired lease + stale heartbeat. */
function seedStalledRunningSlot(db: Database, slotId: string, targetId: string, staleMs: number): void {
  seedPendingManualSlot(db, slotId, targetId);
  db.slots.markSlotStatus(slotId, 'running');
  const stale = Date.now() - staleMs;
  db.slots.claimSlotLease(slotId, 'dead-worker', stale, stale);
}

describe('liveness budgets', () => {
  it('clamps a too-small or malformed budget instead of trusting it', () => {
    expect(resolveStallTimeouts()).toEqual({
      queuedTimeoutMs: DEFAULT_QUEUED_TIMEOUT_MS,
      stallTimeoutMs: DEFAULT_STALL_TIMEOUT_MS,
    });
    expect(resolveStallTimeouts({ queuedTimeoutMs: 1000, stallTimeoutMs: 'nonsense' })).toEqual({
      queuedTimeoutMs: DEFAULT_QUEUED_TIMEOUT_MS,
      stallTimeoutMs: DEFAULT_STALL_TIMEOUT_MS,
    });
    expect(resolveStallTimeouts({ queuedTimeoutMs: 2 * 60 * 1000 })).toEqual({
      queuedTimeoutMs: 2 * 60 * 1000,
      stallTimeoutMs: DEFAULT_STALL_TIMEOUT_MS,
    });
    expect(STALL_SWEEP_MIN_TIMEOUT_MS).toBe(60 * 1000);
  });
});

describe('sweepStalledSlots', () => {
  it('terminalises an aged pending manual slot as queued_too_long and stops counting it active', () => {
    withDb((db) => {
      const slotId = `plan-a@manual-${REQUEST_ID}`;
      seedPendingManualSlot(db, slotId, 'target-a');
      expect(db.slots.countActiveSlots()).toBe(1);

      // Nothing else ages the row: the sweep's own clock is the budget.
      const result = sweepStalledSlots(db, { now: Date.now() + DEFAULT_QUEUED_TIMEOUT_MS + 60_000 });

      expect(result.queuedTooLong).toBe(1);
      expect(result.stalledNoHeartbeat).toBe(0);
      const slot = db.slots.getSlot(slotId)!;
      const cell = db.slots.getCell(slotId, 'target-a')!;
      expect(slot.status).toBe('failed');
      expect(slot.completedAt).not.toBeNull();
      expect(slot.lastError).toContain('排队超时');
      expect(cell.status).toBe('failed');
      expect(cell.terminalReasonCode).toBe('queued_too_long');
      expect(cell.terminalReasonMessage).toBe('排队超时，未能开始执行');
      // The ledger no longer owes this work.
      expect(db.slots.countActiveSlots()).toBe(0);
    });
  });

  it('never touches a pending slot that is inside its queue budget', () => {
    withDb((db) => {
      const slotId = `plan-a@manual-${REQUEST_ID}`;
      seedPendingManualSlot(db, slotId, 'target-a');

      const result = sweepStalledSlots(db);

      expect(result).toEqual({ scanned: 0, queuedTooLong: 0, stalledNoHeartbeat: 0 });
      expect(db.slots.getSlot(slotId)!.status).toBe('pending');
      expect(db.slots.getCell(slotId, 'target-a')!.status).toBe('pending');
    });
  });

  it('never touches a pending slot whose lease is live', () => {
    withDb((db) => {
      const slotId = `plan-a@manual-${REQUEST_ID}`;
      seedPendingManualSlot(db, slotId, 'target-a');
      const now = Date.now();
      // A live lease far beyond the shifted sweep clock.
      db.slots.claimSlotLease(slotId, 'busy-worker', now + 4 * 60 * 60 * 1000, now);

      const result = sweepStalledSlots(db, { now: now + DEFAULT_QUEUED_TIMEOUT_MS + 60_000 });

      expect(result.queuedTooLong).toBe(0);
      expect(db.slots.getSlot(slotId)!.status).toBe('pending');
      expect(db.slots.getCell(slotId, 'target-a')!.status).toBe('pending');
    });
  });

  it('terminalises a running slot whose lease expired and heartbeat went stale', () => {
    withDb((db) => {
      const slotId = `plan-a@manual-${REQUEST_ID}`;
      const staleMs = DEFAULT_STALL_TIMEOUT_MS + 5 * 60 * 1000;
      seedStalledRunningSlot(db, slotId, 'target-a', staleMs);

      const result = sweepStalledSlots(db);

      expect(result.stalledNoHeartbeat).toBe(1);
      const slot = db.slots.getSlot(slotId)!;
      const cell = db.slots.getCell(slotId, 'target-a')!;
      expect(slot.status).toBe('failed');
      expect(cell.status).toBe('failed');
      expect(cell.terminalReasonCode).toBe('stalled_no_heartbeat');
      expect(db.slots.countActiveSlots()).toBe(0);
    });
  });

  it('NEVER terminalises a running slot with a live lease (RC8: a long healthy search)', () => {
    withDb((db) => {
      const slotId = `plan-a@manual-${REQUEST_ID}`;
      seedPendingManualSlot(db, slotId, 'target-a');
      const now = Date.now();
      const sweepAt = now + 6 * 60 * 60 * 1000;
      db.slots.markSlotStatus(slotId, 'running');
      // Long-running but perfectly healthy: its lease is renewed and its
      // heartbeat is fresh AT THE INSTANT the sweep runs, hours after it began.
      db.slots.claimSlotLease(slotId, 'healthy-worker', sweepAt + 3 * 60 * 1000, sweepAt);

      const result = sweepStalledSlots(db, { now: sweepAt });

      expect(result).toEqual({ scanned: 0, queuedTooLong: 0, stalledNoHeartbeat: 0 });
      expect(db.slots.getSlot(slotId)!.status).toBe('running');
      expect(db.slots.getCell(slotId, 'target-a')!.status).toBe('pending');
    });
  });

  it('NEVER terminalises a running slot with a fresh heartbeat, even when its lease lapsed', () => {
    withDb((db) => {
      const slotId = `plan-a@manual-${REQUEST_ID}`;
      seedPendingManualSlot(db, slotId, 'target-a');
      const now = Date.now();
      db.slots.markSlotStatus(slotId, 'running');
      db.slots.claimSlotLease(slotId, 'scanning-worker', now + 60 * 1000, now);
      // Lease expired a millisecond ago, heartbeat written just now: the run is
      // alive and mid-scan, so the stall verdict must not fire on the lease alone.
      db.slots.heartbeatSlotLease(slotId, 'scanning-worker', now - 1, now);

      const result = sweepStalledSlots(db, { now });

      expect(result.stalledNoHeartbeat).toBe(0);
      expect(db.slots.getSlot(slotId)!.status).toBe('running');
    });
  });

  it('skips the slots recovery just re-dispatched them (crash-resume wins)', () => {
    withDb((db) => {
      const rescuedId = `plan-a@manual-${REQUEST_ID}`;
      const orphanId = 'plan-a@manual-21111111-2222-4333-8444-555555555555';
      const staleMs = DEFAULT_STALL_TIMEOUT_MS + 5 * 60 * 1000;
      seedStalledRunningSlot(db, rescuedId, 'target-a', staleMs);
      seedStalledRunningSlot(db, orphanId, 'target-b', staleMs);

      const result = sweepStalledSlots(db, { skipSlotIds: new Set([rescuedId]) });

      expect(result.stalledNoHeartbeat).toBe(1);
      expect(db.slots.getSlot(rescuedId)!.status).toBe('running');
      expect(db.slots.getSlot(orphanId)!.status).toBe('failed');
    });
  });

  it('sweeps in a bounded batch so a large ledger cannot make one tick unbounded', () => {
    withDb((db) => {
      const ids = [1, 2, 3].map((n) => `plan-a@manual-${REQUEST_ID.replace(/^./, String(n))}`);
      ids.forEach((slotId, index) => seedPendingManualSlot(db, slotId, `target-${index}`));

      const result = sweepStalledSlots(db, {
        now: Date.now() + DEFAULT_QUEUED_TIMEOUT_MS + 60_000,
        limit: 2,
      });

      expect(result.scanned).toBe(2);
      expect(result.queuedTooLong).toBe(2);
      expect(db.slots.countActiveSlots()).toBe(1);
    });
  });
});

function makeConfig(overrides: Partial<StandaloneConfig> = {}): StandaloneConfig {
  return {
    pixiv: {
      clientId: 'client',
      clientSecret: 'secret',
      deviceToken: 'device',
      refreshToken: 'refresh-token',
      userAgent: 'agent',
    },
    targets: [{ id: 'bot1-illust', type: 'illustration', mode: 'ranking' }],
    scheduler: { enabled: false, cron: '0 3 * * *' },
    schedules: [{ id: 'bot1', enabled: true, cron: '0 10,18 * * *', targetIds: ['bot1-illust'] }],
    schedulerRuntime: { watchConfig: false, queueLimit: 2 },
    ...overrides,
  } as StandaloneConfig;
}

describe('liveness sweep wiring in MultiScheduleManager', () => {
  it('runs at process start and terminalises a stalled running slot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-stall-mgr-'));
    const database = new Database(join(dir, 'test.db'));
    database.migrate();
    const execute = jest.fn(async () => undefined);
    const manager = new MultiScheduleManager({
      configPath: '/tmp/not-watched.json',
      loadConfig: () => makeConfig(),
      execute,
      database,
    });
    // The plan is gone (disabled/renamed): recovery warns and cannot rescue it,
    // so the liveness sweep is the only thing that can stop the row leaking.
    const slotId = 'disabled-plan@2026-09-27T1800';
    database.slots.getOrCreateSlot(slotId, {
      scheduleId: 'disabled-plan',
      occurrenceAt: Date.parse('2026-09-27T10:00:00Z'),
      occurrenceDate: '2026-09-27',
      occurrenceLabel: '18:00',
      timezone: 'Asia/Shanghai',
      targetIds: ['bot1-illust'],
      triggerSource: 'http',
      slotDate: '2026-09-27',
      slotName: '18:00',
    });
    database.slots.materializeCells(slotId, ['bot1-illust'], () => 'illustration');
    database.slots.markSlotStatus(slotId, 'running');
    const stale = Date.now() - DEFAULT_STALL_TIMEOUT_MS - 5 * 60 * 1000;
    database.slots.claimSlotLease(slotId, 'dead-worker', stale, stale);
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    manager.start(makeConfig());
    try {
      const slot = database.slots.getSlot(slotId)!;
      expect(slot.status).toBe('failed');
      expect(database.slots.getCell(slotId, 'bot1-illust')!.terminalReasonCode).toBe(
        'stalled_no_heartbeat'
      );
      // The reason it could not be rescued is on the record, not silent.
      expect(
        warn.mock.calls.some(([message]) => String(message).includes('no enabled schedule'))
      ).toBe(true);
    } finally {
      warn.mockRestore();
      manager.stop();
      database.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT terminalise a stalled slot that recovery can still resume (crash-resume is preserved)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-stall-resume-'));
    const database = new Database(join(dir, 'test.db'));
    database.migrate();
    const execute = jest.fn(async () => undefined);
    const manager = new MultiScheduleManager({
      configPath: '/tmp/not-watched.json',
      loadConfig: () => makeConfig(),
      execute,
      database,
    });
    const slotId = 'bot1@2026-09-27T1800';
    database.slots.getOrCreateSlot(slotId, {
      scheduleId: 'bot1',
      occurrenceAt: Date.parse('2026-09-27T10:00:00Z'),
      occurrenceDate: '2026-09-27',
      occurrenceLabel: '18:00',
      timezone: 'Asia/Shanghai',
      targetIds: ['bot1-illust'],
      triggerSource: 'http',
      slotDate: '2026-09-27',
      slotName: '18:00',
    });
    database.slots.materializeCells(slotId, ['bot1-illust'], () => 'illustration');
    database.slots.markSlotStatus(slotId, 'running');
    // Crashed hours ago: stale heartbeat + expired lease, but the plan is alive.
    const stale = Date.now() - DEFAULT_STALL_TIMEOUT_MS - 5 * 60 * 60 * 1000;
    database.slots.claimSlotLease(slotId, 'crashed-worker', stale, stale);

    manager.start(makeConfig());
    try {
      // Recovery re-dispatched it, so the same tick's sweep must keep its hands
      // off: the occurrence is durable and resumes rather than failing.
      expect(await waitFor(() => execute.mock.calls.length > 0)).toBe(true);
      expect(database.slots.getSlot(slotId)!.status).toBe('running');
      expect(database.slots.getCell(slotId, 'bot1-illust')!.status).toBe('pending');
    } finally {
      manager.stop();
      database.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns with the manual request id when a recoverable slot cannot be admitted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-stall-warn-'));
    const database = new Database(join(dir, 'test.db'));
    database.migrate();
    const manager = new MultiScheduleManager({
      configPath: '/tmp/not-watched.json',
      loadConfig: () => makeConfig(),
      execute: jest.fn(async () => undefined),
      database,
    });
    manager.start(makeConfig());
    // Stopping clears the per-plan Schedulers, which is exactly the production
    // case where a durable slot keeps being "recovered" but never runs.
    manager.stop();
    const slotId = `bot1@manual-${REQUEST_ID}`;
    seedPendingManualSlot(database, slotId, 'bot1-illust', 'bot1');
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      (manager as unknown as { recoverInterruptedSlots(): void }).recoverInterruptedSlots();

      const call = warn.mock.calls.find(([message]) =>
        String(message).includes('could not be admitted')
      );
      expect(call).toBeDefined();
      expect(call![1]).toMatchObject({
        slot: slotId,
        reason: 'scheduler_not_instantiated',
        manual_request_id: REQUEST_ID,
      });
      // The fresh slot itself is untouched: a warning is not a verdict.
      expect(database.slots.getSlot(slotId)!.status).toBe('pending');
    } finally {
      warn.mockRestore();
      database.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns with the manual request id when no enabled schedule owns the slot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-stall-ghost-'));
    const database = new Database(join(dir, 'test.db'));
    database.migrate();
    const manager = new MultiScheduleManager({
      configPath: '/tmp/not-watched.json',
      loadConfig: () => makeConfig(),
      execute: jest.fn(async () => undefined),
      database,
    });
    manager.start(makeConfig());
    manager.stop();
    const slotId = `ghost-plan@manual-${REQUEST_ID}`;
    seedPendingManualSlot(database, slotId, 'bot1-illust', 'ghost-plan');
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      (manager as unknown as { recoverInterruptedSlots(): void }).recoverInterruptedSlots();

      const call = warn.mock.calls.find(([message]) =>
        String(message).includes('no enabled schedule')
      );
      expect(call).toBeDefined();
      expect(call![1]).toMatchObject({ slot: slotId, manual_request_id: REQUEST_ID });
    } finally {
      warn.mockRestore();
      database.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
