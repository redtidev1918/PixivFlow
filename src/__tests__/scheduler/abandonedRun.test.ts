/**
 * P0 reliability: a run that outlives its own timeout must stop running AND stop
 * renewing its lease, even when the in-flight work ignores the abort.
 *
 * Encodes the production incident: `bot1-daily@2026-09-10T1800` passed its
 * 30-minute timeout, never settled because a Pixiv request never returned, and
 * the runtime kept heart-beating the slot lease every 620s — so nothing could
 * reclaim it and the occurrence stayed `running` indefinitely.
 *
 * The two guarantees pinned here:
 *  1. bounded drain: after the timeout the scheduler stops waiting, clears its
 *     concurrent-run guard, and reports the run as abandoned.
 *  2. no duplicate execution: an abandoned slot is left TERMINAL, so the recovery
 *     sweep cannot re-dispatch it while the wedged job is still alive — while a
 *     genuinely crashed worker still gets recovered.
 */

import { Database } from '../../storage/Database';
import { Scheduler, ABORT_DRAIN_MS, JobAbandoned } from '../../scheduler/Scheduler';
import { SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { OperationCancelledError } from '../../utils/errors';
import { TopicPipeline } from '../../topic/TopicPipeline';
import type { TopicResolver } from '../../topic/TopicResolver';
import type { ResolvedTag, TopicClient } from '../../topic/types';
import { SchedulerConfig, StandaloneConfig, ScheduleConfig, TargetConfig } from '../../config';
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
const AT = new Date('2026-09-08T02:00:30Z');

function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-abandoned-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  return fn(db).finally(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

function resolveTag(name: string, score: number): ResolvedTag {
  return {
    name,
    score,
    occurrences: 2,
    coverage: 1,
    specificity: score,
    suggested: false,
    seed: false,
  };
}

function pipelineWith(
  client: TopicClient,
  signal: AbortSignal,
  tags: ResolvedTag[] = [resolveTag('seed', 1), resolveTag('related', 0.5)]
): TopicPipeline {
  const resolver = {
    resolve: async () => ({
      space: {
        version: 1,
        topic: 'seed',
        contentType: 'illustration',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        sampleSize: 10,
        sampledWorks: 10,
        tags,
      },
      fromCache: true,
      degraded: false,
    }),
  } as unknown as TopicResolver;
  return new TopicPipeline(client, resolver, 0, signal);
}

describe('scheduler timeout is bounded by a drain window', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('abandons a job that ignores cancellation instead of waiting forever', async () => {
    jest.useFakeTimers();
    const database = {
      getSchedulerStats: jest.fn(() => ({ totalExecutions: 0 })),
      getConsecutiveFailures: jest.fn(() => 0),
      getNextExecutionNumber: jest.fn(() => 1),
      logSchedulerExecution: jest.fn(),
    } as unknown as Database;
    const requestCancel = jest.fn();
    const onFailure = jest.fn();
    const onAbandoned = jest.fn();
    const scheduler = new Scheduler(
      { timeout: 1_000, timezone: 'UTC' } as SchedulerConfig,
      database,
      {
        beginRun: () => 0,
        endRun: () => 0,
        requestCancel,
      },
      'bot1',
      undefined,
      onFailure,
      onAbandoned
    );

    // A job that never settles and never observes its abort — the worst case the
    // production incident produced.
    scheduler.init(async () => {
      await new Promise<void>(() => undefined);
    });
    expect(scheduler.runNow()).toBe(true);
    expect(scheduler.getStats().running).toBe(true);

    await jest.advanceTimersByTimeAsync(1_000);
    expect(requestCancel).toHaveBeenCalledWith('scheduler timeout');
    expect(onAbandoned).not.toHaveBeenCalled(); // still inside the drain window

    await jest.advanceTimersByTimeAsync(ABORT_DRAIN_MS);

    expect(onAbandoned).toHaveBeenCalledTimes(1);
    const abandoned = onAbandoned.mock.calls[0][0] as JobAbandoned;
    expect(abandoned.drainWindowMs).toBe(ABORT_DRAIN_MS);
    expect(abandoned.errorMessage).toMatch(/drain window/i);
    // The concurrent-run guard must be released even though the job never ended:
    // otherwise the schedule is blocked for the life of the process.
    expect(scheduler.getStats().running).toBe(false);
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ status: 'timeout' }));
  });

  it('does not abandon a job that settles inside the drain window', async () => {
    jest.useFakeTimers();
    const database = {
      getSchedulerStats: jest.fn(() => ({ totalExecutions: 0 })),
      getConsecutiveFailures: jest.fn(() => 0),
      getNextExecutionNumber: jest.fn(() => 1),
      logSchedulerExecution: jest.fn(),
    } as unknown as Database;
    const onAbandoned = jest.fn();
    const jobGate: { release?: () => void } = {};
    const scheduler = new Scheduler(
      { timeout: 1_000, timezone: 'UTC' } as SchedulerConfig,
      database,
      { beginRun: () => 0, endRun: () => 0, requestCancel: () => undefined },
      'bot1',
      undefined,
      undefined,
      onAbandoned
    );

    scheduler.init(
      () =>
        new Promise<void>((resolve) => {
          jobGate.release = resolve;
        })
    );
    scheduler.runNow();

    await jest.advanceTimersByTimeAsync(1_000); // timeout fires, abort requested
    jobGate.release?.(); // the abort was honoured: the job unwinds promptly
    await jest.advanceTimersByTimeAsync(50);

    expect(onAbandoned).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(ABORT_DRAIN_MS);
    expect(onAbandoned).not.toHaveBeenCalled();
    expect(scheduler.getStats().running).toBe(false);
  });
});

describe('cancellation reaches candidate acquisition and is never swallowed', () => {
  it('surfaces the cancellation instead of degrading it to "no results"', async () => {
    const controller = new AbortController();
    const searched: string[] = [];
    const client: TopicClient = {
      getTagAutocomplete: async () => [],
      searchIllustrationsForTags: async (tag) => {
        searched.push(tag);
        // The transport failed *because* of the abort, which the collector's
        // catch-all used to convert into an empty result.
        controller.abort();
        throw new Error('socket hang up');
      },
      searchNovelsForTags: async () => [],
    };
    const pipeline = pipelineWith(client, controller.signal);

    await expect(
      pipeline.selectWorks(target('a'), 'illustration', '2026-09-10', 1, {}, {})
    ).rejects.toBeInstanceOf(OperationCancelledError);
    expect(searched).toEqual(['seed']);
  });

  it('stops before the next tag even when the aborted request returned normally', async () => {
    const controller = new AbortController();
    const searched: string[] = [];
    const client: TopicClient = {
      getTagAutocomplete: async () => [],
      searchIllustrationsForTags: async (tag) => {
        searched.push(tag);
        controller.abort(); // abort observed by the loop, not by the transport
        return [];
      },
      searchNovelsForTags: async () => [],
    };
    const pipeline = pipelineWith(client, controller.signal);

    await expect(
      pipeline.selectWorks(target('a'), 'illustration', '2026-09-10', 1, {}, {})
    ).rejects.toBeInstanceOf(OperationCancelledError);
    expect(searched).toEqual(['seed']);
  });

  it('still collects normally while the run is not cancelled', async () => {
    const client: TopicClient = {
      getTagAutocomplete: async () => [],
      searchIllustrationsForTags: async (tag) => [
        {
          id: tag === 'seed' ? 1 : 2,
          title: 'seed work',
          caption: '',
          create_date: '2026-09-10T00:00:00+09:00',
          tags: [{ name: 'seed' }],
        },
      ],
      searchNovelsForTags: async () => [],
    };
    const pipeline = pipelineWith(client, new AbortController().signal);
    const { works } = await pipeline.selectWorks(
      target('a'),
      'illustration',
      '2026-09-10',
      2,
      {},
      {}
    );
    expect(works.length).toBeGreaterThan(0);
  });
});

describe('an abandoned run cannot coexist with its recovery', () => {
  it('leaves the slot terminal so the recovery sweep skips it, unlike a crash', async () => {
    await withDb(async (db) => {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, scheduleConfig, 'http', AT).context!;
      coord.prepare(slot, schedule, [target('a')]);
      coord.markRunning(slot.slotId);
      expect(coord.claimRunLease(slot.slotId, 'wedged-run', 3 * 60 * 1000)).toBe(true);

      // The abandon path taken by runtime.abandonActiveRun(): stop owning the
      // lease AND make the ledger terminal in the same step.
      db.slots.markSlotStatus(
        slot.slotId,
        'failed',
        'abandoned after scheduler timeout; no delivery (drain window expired)'
      );
      coord.releaseRunLease(slot.slotId, 'wedged-run');

      // Recovery only re-dispatches non-terminal slots, so the still-running job
      // is never joined by a second execution of the same occurrence.
      expect(db.slots.recoverableSlots().map((s) => s.id)).not.toContain(slot.slotId);

      // Contrast: a worker that crashed (still `running`, lease lapsed) MUST be
      // recovered, or the occurrence is stranded forever.
      db.slots.markSlotStatus(slot.slotId, 'running');
      expect(db.slots.recoverableSlots().map((s) => s.id)).toContain(slot.slotId);
    });
  });
});
