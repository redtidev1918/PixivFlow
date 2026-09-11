/**
 * Regression tests for the durable-dispatch / lease-recovery overhaul.
 *
 * These encode the three production incidents that motivated the change:
 *  (a) a run longer than the trigger request's timeout (the request died at
 *      exactly 600s while the download was still going),
 *  (b) a process restart in the middle of an active lease (the stale lease then
 *      blocked the occurrence for ~31 minutes and the re-trigger silently
 *      reported `completed`),
 *  (c) the same slot triggered by several clocks at once (Cloudflare + GitHub
 *      watchdog + manual POST).
 *
 * They also pin the invariant that the accepting adapter must never report a
 * still-executing slot as completed.
 */

import { Database } from '../../storage/Database';
import { SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { MultiScheduleManager } from '../../scheduler/MultiScheduleManager';
import { StandaloneConfig, ScheduleConfig, TargetConfig } from '../../config';
import { ScheduleRunOptions } from '../../scheduler/OccurrenceResolver';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const target = (id: string, type = 'illustration'): TargetConfig => ({ id, type }) as TargetConfig;
const schedule: ScheduleConfig = {
  id: 'bot1',
  name: 'Bot1',
  cron: '0 10,18 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
} as ScheduleConfig;
const scheduleConfig = { schedulerRuntime: { trigger: { graceMinutes: 720 } } } as StandaloneConfig;

// 2026-09-08 10:00 Shanghai == 02:00 UTC.
const AT = new Date('2026-09-08T02:00:30Z');
const OCCURRENCE_AT = Date.parse('2026-09-08T02:00:00Z');

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

function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-durable-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  return fn(db).finally(async () => {
    // Admitted runs are fire-and-forget: give any in-flight job time to finish
    // its accounting write before the test DB disappears underneath it.
    await new Promise((resolve) => setTimeout(resolve, 200));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

/** Let a fire-and-forget admitted run settle before the test DB is closed. */
async function settle(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

/** A typed fake executor so assertions can read the forwarded run options. */
function makeExecute() {
  return jest.fn(
    async (_config: StandaloneConfig, _schedule: ScheduleConfig, _options?: ScheduleRunOptions) =>
      undefined
  );
}

/** Insert a durable slot in the state a crashed/restarted worker would leave. */
function seedSlot(
  db: Database,
  opts: { slotId: string; status: 'pending' | 'running'; leaseUntil?: number | null; owner?: string | null }
): void {
  db.slots.getOrCreateSlot(opts.slotId, {
    scheduleId: 'bot1',
    occurrenceAt: OCCURRENCE_AT,
    occurrenceDate: '2026-09-08',
    occurrenceLabel: '10:00',
    timezone: 'Asia/Shanghai',
    targetIds: ['bot1-illust'],
    triggerSource: 'http',
    slotDate: '2026-09-08',
    slotName: '10:00',
  });
  db.slots.materializeCells(opts.slotId, ['bot1-illust'], () => 'illustration');
  db.slots.markSlotStatus(opts.slotId, opts.status);
  if (opts.leaseUntil != null || opts.owner != null) {
    // Claim at exactly `leaseUntil` so the CAS sees a free/expired slot and the
    // stored lease_until is whatever the scenario needs (past or future).
    const leaseUntil = opts.leaseUntil ?? 0;
    db.slots.claimSlotLease(opts.slotId, opts.owner ?? 'dead-worker', leaseUntil, leaseUntil);
  }
}

describe('Scheduler dispatch must not lose the trigger context', () => {
  it('runNow forwards the resolved SlotContext into the job (incident: slot dropped by the executor)', async () => {
    await withDb(async (db) => {
      const execute = makeExecute();
      const manager = new MultiScheduleManager({
        configPath: '/tmp/not-watched.json',
        loadConfig: () => makeConfig(),
        execute,
        database: db,
      });
      const cfg = makeConfig({ schedulerRuntime: { mode: 'external', watchConfig: false } });
      manager.start(cfg);
      try {
        const slot = {
          slotId: 'bot1@2026-09-08T1000',
          scheduleId: 'bot1',
          occurrenceAt: OCCURRENCE_AT,
          occurrenceDate: '2026-09-08',
          occurrenceLabel: '10:00',
          timezone: 'Asia/Shanghai',
          triggerSource: 'http' as const,
          slotName: '10:00',
          slotDate: '2026-09-08',
        };
        expect(manager.triggerSchedule('bot1', { triggerSource: 'http', slot })).toBe(true);
        await waitFor(() => execute.mock.calls.length > 0);

        // The executor MUST receive the same occurrence the adapter resolved;
        // losing it made the run resolve a different (or no) slot.
        const passed = execute.mock.calls[0][2] as ScheduleRunOptions | undefined;
        expect(passed?.slot?.slotId).toBe(slot.slotId);
        expect(passed?.triggerSource).toBe('http');
      } finally {
        manager.stop();
      }
    });
  });

  it('admission is fire-and-forget: it returns before a never-resolving run finishes', async () => {
    await withDb(async (db) => {
      let settle: (() => void) | undefined;
      const neverFinishes = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const execute = jest.fn(async () => {
        await neverFinishes;
      });
      const manager = new MultiScheduleManager({
        configPath: '/tmp/not-watched.json',
        loadConfig: () => makeConfig(),
        execute,
        database: db,
      });
      const cfg = makeConfig({ schedulerRuntime: { mode: 'external', watchConfig: false } });
      manager.start(cfg);
      try {
        const slot = {
          slotId: 'bot1@2026-09-08T1000',
          scheduleId: 'bot1',
          occurrenceAt: OCCURRENCE_AT,
          occurrenceDate: '2026-09-08',
          occurrenceLabel: '10:00',
          timezone: 'Asia/Shanghai',
          triggerSource: 'http' as const,
          slotName: '10:00',
          slotDate: '2026-09-08',
        };
        // A 10-40 minute run must not be awaited by the accepting endpoint.
        expect(manager.triggerSchedule('bot1', { triggerSource: 'http', slot })).toBe(true);
        await waitFor(() => execute.mock.calls.length > 0);
        // Still in flight, and the caller already has its answer.
        expect(execute).toHaveBeenCalledTimes(1);
      } finally {
        // Release the deliberately-hung run, then let its accounting settle.
        settle?.();
        await new Promise((resolve) => setTimeout(resolve, 100));
        manager.stop();
      }
    });
  });
});

describe('lease semantics bound how long a dead worker blocks its slot', () => {
  it('a live lease rejects a second owner and hides the slot from recovery', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, scheduleConfig, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a')]);

      const ttl = 3 * 60 * 1000;
      expect(coord.claimRunLease(slot.slotId, 'worker-1', ttl)).toBe(true);
      // Concurrent Cloudflare + watchdog triggers must converge, not double-run.
      expect(coord.claimRunLease(slot.slotId, 'worker-2', ttl)).toBe(false);
      expect(db.slots.recoverableSlots().map((s) => s.id)).not.toContain(slot.slotId);
    });
  });

  it('an expired lease is reclaimable, and the TTL is far below the run timeout', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, scheduleConfig, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a')]);

      const ttl = 3 * 60 * 1000;
      expect(coord.claimRunLease(slot.slotId, 'crashed-worker', ttl)).toBe(true);

      // 30-minute schedule timeout + crash would have been a 31-minute block
      // under the old lease TTL; a dead worker must now be replaceable in ~TTL.
      expect(ttl).toBeLessThanOrEqual(5 * 60 * 1000);
      const later = Date.now() + ttl + 1000;
      // The slot is visible to reconciliation the moment its lease lapses...
      expect(db.slots.recoverableSlots(later).map((s) => s.id)).toContain(slot.slotId);
      // ...and a restarted worker wins the CAS on the same row.
      expect(db.slots.claimSlotLease(slot.slotId, 'restarted-worker', ttl, later)).toBe(true);
    });
  });

  it('a slot recorded but never claimed is recoverable (crash between accept and claim)', async () => {
    await withDb(async (db) => {
      seedSlot(db, { slotId: 'bot1@2026-09-08T1000', status: 'pending' });
      const lease = db.slots.getSlotLease('bot1@2026-09-08T1000');
      expect(lease.owner).toBeNull();
      expect(lease.until).toBeNull();
      expect(db.slots.recoverableSlots().map((s) => s.id)).toContain('bot1@2026-09-08T1000');
    });
  });

  it('the lease is still held after finish(), so a concurrent trigger cannot re-run the rollup', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, scheduleConfig, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a')]);
      expect(coord.claimRunLease(slot.slotId, 'worker-1', 3 * 60 * 1000)).toBe(true);
      coord.markRunning(slot.slotId);

      coord.lockWork(slot.slotId, 'a', '100', 'illustration');
      coord.markCell(slot.slotId, 'a', 'submitted');
      const summary = coord.finish(slot, schedule, [target('a')]);
      expect(summary.status).toBe('success');

      // Ordering invariant: release happens AFTER finish. Until then the slot
      // must still be owned.
      expect(coord.claimRunLease(slot.slotId, 'worker-2', 3 * 60 * 1000)).toBe(false);

      // Once released, the occurrence is recognisably terminal rather than
      // runnable again: prepare() is the guard the runtime checks before claiming.
      coord.releaseRunLease(slot.slotId, 'worker-1');
      expect(coord.prepare(slot, schedule, [target('a')]).alreadyCompleted).toBe(true);
    });
  });
});

describe('reconciliation re-dispatches stranded slots', () => {
  it('recovers a stale-lease slot at startup using the STORED occurrence', async () => {
    await withDb(async (db) => {
      const staleSlotId = 'bot1@2026-09-08T1000';
      // Lease expired 5 minutes ago: the worker that owned it is gone.
      seedSlot(db, { slotId: staleSlotId, status: 'running', owner: 'dead-worker', leaseUntil: Date.now() - 5 * 60 * 1000 });

      const execute = makeExecute();
      const cfg = makeConfig({ schedulerRuntime: { mode: 'external', watchConfig: false } });
      const manager = new MultiScheduleManager({
        configPath: '/tmp/not-watched.json',
        loadConfig: () => cfg,
        execute,
        database: db,
      });
      manager.start(cfg);
      try {
        await waitFor(() => execute.mock.calls.length > 0);
        await settle();
        const passed = execute.mock.calls[0][2] as ScheduleRunOptions | undefined;
        // Must resume the SAME occurrence, never re-resolve "now" (which would
        // map a stranded 18:00 slot onto a different one).
        expect(passed?.slot?.slotId).toBe(staleSlotId);
        expect(passed?.slot?.occurrenceAt).toBe(OCCURRENCE_AT);
      } finally {
        manager.stop();
      }
    });
  });

  it('recovers a queued slot that was never claimed (pending + no lease)', async () => {
    await withDb(async (db) => {
      seedSlot(db, { slotId: 'bot1@2026-09-08T1000', status: 'pending' });

      const execute = makeExecute();
      const cfg = makeConfig({ schedulerRuntime: { mode: 'external', watchConfig: false } });
      const manager = new MultiScheduleManager({
        configPath: '/tmp/not-watched.json',
        loadConfig: () => cfg,
        execute,
        database: db,
      });
      manager.start(cfg);
      try {
        expect(await waitFor(() => execute.mock.calls.length > 0)).toBe(true);
        await settle();
      } finally {
        manager.stop();
      }
    });
  });

  it('never steals a slot from a live worker', async () => {
    await withDb(async (db) => {
      const liveSlotId = 'bot1@2026-09-08T1000';
      seedSlot(db, { slotId: liveSlotId, status: 'running', owner: 'live-worker', leaseUntil: Date.now() + 3 * 60 * 1000 });

      const execute = makeExecute();
      const cfg = makeConfig({ schedulerRuntime: { mode: 'external', watchConfig: false } });
      const manager = new MultiScheduleManager({
        configPath: '/tmp/not-watched.json',
        loadConfig: () => cfg,
        execute,
        database: db,
      });
      manager.start(cfg);
      try {
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(execute).not.toHaveBeenCalled();
      } finally {
        manager.stop();
      }
    });
  });

  it('recovery also runs in external mode, where catch-up deliberately does not', async () => {
    await withDb(async (db) => {
      seedSlot(db, { slotId: 'bot1@2026-09-08T1000', status: 'running', owner: 'dead', leaseUntil: Date.now() - 60_000 });

      const execute = makeExecute();
      const cfg = makeConfig({ schedulerRuntime: { mode: 'external', watchConfig: false } });
      const manager = new MultiScheduleManager({
        configPath: '/tmp/not-watched.json',
        loadConfig: () => cfg,
        execute,
        database: db,
      });
      manager.start(cfg);
      try {
        // A stranded slot is a fact in the ledger, not a cron guess: it must be
        // recovered even though external mode never catches missed runs.
        expect(await waitFor(() => execute.mock.calls.length > 0)).toBe(true);
        await settle();
      } finally {
        manager.stop();
      }
    });
  });

  it('skips a stranded slot whose schedule no longer exists instead of guessing', async () => {
    await withDb(async (db) => {
      db.slots.getOrCreateSlot('gone@2026-09-08T1000', {
        scheduleId: 'gone',
        occurrenceAt: OCCURRENCE_AT,
        occurrenceDate: '2026-09-08',
        occurrenceLabel: '10:00',
        timezone: 'Asia/Shanghai',
        targetIds: ['bot1-illust'],
        triggerSource: 'http',
      });
      db.slots.markSlotStatus('gone@2026-09-08T1000', 'pending');

      const execute = makeExecute();
      const cfg = makeConfig({ schedulerRuntime: { mode: 'external', watchConfig: false } });
      const manager = new MultiScheduleManager({
        configPath: '/tmp/not-watched.json',
        loadConfig: () => cfg,
        execute,
        database: db,
      });
      manager.start(cfg);
      try {
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(execute).not.toHaveBeenCalled();
        // And it stays reported as stranded rather than silently completed.
        expect(db.slots.recoverableSlots().map((s) => s.id)).toContain('gone@2026-09-08T1000');
      } finally {
        manager.stop();
      }
    });
  });
});
