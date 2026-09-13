/**
 * Bounded candidate scan: a duplicate candidate must ADVANCE the scan, never
 * end the run.
 *
 * Production defect these tests pin down: the scheduler fetched/ranked ONE
 * candidate, found it was already submitted, and the job ended as "success"
 * with nothing submitted — burning the whole scheduled slot. The wrong model
 * was `duplicate -> job completed`; the right one is
 * `duplicate -> candidate rejected -> try the next candidate`.
 *
 * Every test drives the REAL chain (DownloadPlanner + DownloadPipeline +
 * IllustrationTargetHandler + DeliveryService over a real SQLite database) and
 * only fakes the two boundaries that would need the network: the Pixiv client
 * and the artifact downloader.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from '../../storage/Database';
import { DeliveryService } from '../../delivery/DeliveryService';
import { DownloadManager } from '../../download/DownloadManager';
import {
  DownloadPlanner,
  DEFAULT_CANDIDATE_SCAN_LIMIT,
  resolveCandidateScanLimit,
} from '../../download/plan/DownloadPlanner';
import { applyEnvironmentOverrides } from '../../config/environment';
import { DownloadPipeline } from '../../download/pipeline/DownloadPipeline';
import { DownloadExecutor } from '../../download/exec/DownloadExecutor';
import { DefaultErrorRecovery } from '../../download/recovery/ErrorRecovery';
import { ProgressReporter } from '../../download/report/ProgressReporter';
import { IllustrationTargetHandler } from '../../download/handlers/IllustrationTargetHandler';
import { RankingService } from '../../download/RankingService';
import { IllustrationDownloader } from '../../download/IllustrationDownloader';
import {
  mergeScanSummaries,
  noEligibleCandidateText,
  outcomeSummary,
  type TargetOutcome,
} from '../../scheduler/TargetOutcome';
import { SlotCoordinator, type SlotContext } from '../../scheduler/SlotCoordinator';
import { createDeliveryLedgerPort } from '../../delivery/DeliveryLedgerPort';
import type { ScheduleConfig, StandaloneConfig, TargetConfig } from '../../config';
import type { IPixivClient } from '../../interfaces/IPixivClient';
import type { DownloadedArtifact } from '../../delivery/types';
import type { PixivIllust } from '@redtidev/pixiv-client';
import { AuthenticationError, DatabaseError, NetworkError } from '../../utils/errors';

jest.mock('../../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

const DELIVERY_TARGET = 'review';

function illust(id: number): PixivIllust {
  return {
    id,
    title: `Illust ${id}`,
    page_count: 1,
    user: { id: 'u1', name: 'User' },
    image_urls: {
      square_medium: `https://example.com/${id}/square`,
      medium: `https://example.com/${id}/medium`,
      large: `https://example.com/${id}/large`,
    },
    create_date: '2024-01-01T00:00:00+09:00',
    total_bookmarks: 100,
    total_view: 1000,
  };
}

interface Harness {
  db: Database;
  handler: IllustrationTargetHandler;
  target: TargetConfig;
  downloader: { downloadIllustration: jest.Mock };
  searchIllustrations: jest.Mock;
  /** Make a work look already SUBMITTED to this target (delivered or pending). */
  markSubmitted(pixivId: string, status: 'delivered' | 'pending' | 'duplicate'): void;
  /** Ledger rows for one work: exactly one means exactly one submission. */
  ledgerRowsFor(pixivId: string): Array<{ id: string; status: string; idempotencyKey: string }>;
  /** Total delivery-ledger rows, whatever their work. */
  ledgerRowCount(): number;
  outboxDeliveryRows(): number;
  /** The work the slot cell is bound to, or null when unbound. */
  cellWorkId(): string | null;
  cellStatus(): string | null;
  /** Run one target through the handler, with the slot cell claim when enabled. */
  handle(): Promise<TargetOutcome>;
  /** Record an outcome on the slot ledger exactly as runJob's hook does. */
  applyOutcomeToSlot(outcome: TargetOutcome): void;
  /** Roll the slot up exactly as runJob does at the end of a run. */
  finishSlot(): { status: string; cells: Array<{ targetId: string; status: string; workId?: string | null; error?: string | null }> };
  close(): void;
}

function buildHarness(options: {
  candidates: number[];
  /** Per-candidate failure injected at the downloader boundary. */
  failWith?: (pixivId: string) => Error | null;
  /** Smallest config: no real delays, serial scan. */
  config?: Partial<StandaloneConfig>;
  /** Simulate a caller with no ledger visibility, forcing the post-download path. */
  blindPlanner?: boolean;
  /** Drive the real slot ledger + work-identity cell claim, as a scheduled run does. */
  withSlot?: boolean;
  target?: Partial<TargetConfig>;
}): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-scan-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();

  const artifactDir = join(dir, 'artifacts');
  require('node:fs').mkdirSync(artifactDir, { recursive: true });
  const artifactFiles = new Map<string, string>();
  for (const id of options.candidates) {
    const file = join(artifactDir, `${id}.jpg`);
    writeFileSync(file, 'image');
    artifactFiles.set(String(id), file);
  }

  const downloader = {
    downloadIllustration: jest.fn(
      async (item: PixivIllust): Promise<DownloadedArtifact | null> => {
        const failure = options.failWith?.(String(item.id));
        if (failure) throw failure;
        const file = artifactFiles.get(String(item.id));
        if (!file) return null;
        return {
          pixivId: String(item.id),
          type: 'illustration',
          title: item.title,
          files: [file],
          previewFiles: [],
        };
      }
    ),
  };

  const searchIllustrations = jest.fn().mockResolvedValue(options.candidates.map(illust));
  const client = { searchIllustrations } as unknown as IPixivClient;
  const rankingService = {} as RankingService;

  const config = {
    download: { concurrency: 1, maxRetries: 1, retryDelay: 0 },
    storage: {},
    targets: [],
    ...(options.config ?? {}),
  } as unknown as StandaloneConfig;

  const deliveryService = new DeliveryService(db);
  const planner = new DownloadPlanner(
    db,
    options.blindPlanner
      ? undefined
      : {
          deliveredIds: (target, type, ids) => deliveryService.deliveredIds(target, type, ids),
          submittedIds: (target, type, ids) => deliveryService.submittedIds(target, type, ids),
        },
    config.download?.candidateScanLimit
  );
  const pipeline = new DownloadPipeline({
    config,
    planner,
    executor: new DownloadExecutor(),
    progressReporter: new ProgressReporter(),
    recovery: new DefaultErrorRecovery({ maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }),
  });

  const target: TargetConfig = {
    id: 'target-a',
    type: 'illustration',
    mode: 'search',
    tag: 'scan-tag',
    limit: 1,
    storageMode: 'cache',
    delivery: { target: DELIVERY_TARGET },
    ...(options.target ?? {}),
  };

  const handler = new IllustrationTargetHandler(
    client,
    db,
    rankingService,
    downloader as unknown as IllustrationDownloader,
    pipeline,
    undefined,
    deliveryService
  );

  /**
   * A real scheduled slot: cell membership + the (slotId,targetId) -> workId
   * claim that must NOT stop the scan when a candidate is rejected.
   */
  let execution: ReturnType<SlotCoordinator['executionContextsFor']> extends Map<string, infer C>
    ? C | undefined
    : never;
  let slotId: string | undefined;
  let coordinator: SlotCoordinator | undefined;
  let resolvedSlot: SlotContext | undefined;
  const schedule = {
    id: 'schedule-a',
    name: 'Schedule A',
    cron: '0 10 * * *',
    timezone: 'Asia/Shanghai',
    enabled: true,
  } as ScheduleConfig;
  if (options.withSlot) {
    coordinator = new SlotCoordinator(db, createDeliveryLedgerPort(db));
    const slotConfig = { schedulerRuntime: { trigger: { graceMinutes: 120 } } } as StandaloneConfig;
    const resolved = coordinator.resolveOccurrence(
      schedule,
      slotConfig,
      'http',
      new Date('2026-09-08T02:00:30Z')
    ).context;
    if (!resolved) throw new Error('slot harness: occurrence not resolvable');
    resolvedSlot = resolved;
    slotId = resolved.slotId;
    coordinator.prepare(resolved, schedule, [target]);
    coordinator.markRunning(resolved.slotId);
    // The delivery target must carry the slot id, exactly as runJob wires it.
    target.delivery = { ...target.delivery, target: DELIVERY_TARGET, slotContext: resolved };
    execution = coordinator
      .executionContextsFor(resolved.slotId, coordinator.pendingTargets(resolved.slotId, [target]))
      .get('target-a');
  }

  const markSubmitted: Harness['markSubmitted'] = (pixivId, status) => {
    const id = `seed-${status}-${pixivId}-${Math.random().toString(16).slice(2)}`;
    db.deliveries.insertIntent({
      id,
      deliveryTarget: DELIVERY_TARGET,
      workType: 'illustration',
      pixivId: String(pixivId),
      slotId: null,
      targetId: 'target-a',
      idempotencyKey: `seed:${status}:${pixivId}:${id}`,
    });
    if (status !== 'pending') {
      db.deliveries.recordAck(id, { status });
    }
  };

  return {
    db,
    handler,
    target,
    downloader,
    cellWorkId: () =>
      slotId ? db.slots.getCell(slotId, 'target-a')?.workId ?? null : null,
    cellStatus: () =>
      slotId ? db.slots.getCell(slotId, 'target-a')?.status ?? null : null,
    handle: () => handler.handle(target, execution),
    applyOutcomeToSlot: (outcome) => {
      if (!coordinator || !resolvedSlot) return;
      coordinator.applyOutcome(resolvedSlot.slotId, 'target-a', outcome);
    },
    finishSlot: () => {
      if (!coordinator || !resolvedSlot) throw new Error('slot harness not enabled');
      const summary = coordinator.finish(resolvedSlot, schedule, [target]);
      return {
        status: summary.status as string,
        cells: summary.cells.map((c) => ({
          targetId: c.targetId,
          status: c.status as string,
          workId: c.workId,
          error: c.error,
        })),
      };
    },
    searchIllustrations,
    markSubmitted,
    // The ledger is the submission record: every row is one durable delivery
    // intent, so counting rows per work is counting submissions per work.
    ledgerRowsFor: (pixivId) =>
      [...db.deliveries.pending(1000), ...db.deliveries.listForCell(DELIVERY_TARGET, '', '')]
        .filter((row) => row.pixivId === String(pixivId))
        .map((row) => ({ id: row.id, status: row.status, idempotencyKey: row.idempotencyKey })),
    ledgerRowCount: () =>
      Object.values(db.deliveries.countByStatus()).reduce((sum, n) => sum + n, 0),
    outboxDeliveryRows: () => db.outbox.list().filter((row) => row.kind === 'delivery').length,
    close: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('scheduler candidate scan: duplicate -> next candidate, never a completed no-op', () => {
  it('submits candidate #2 when candidate #1 is already submitted', async () => {
    const h = buildHarness({ candidates: [100, 101] });
    try {
      h.markSubmitted('100', 'delivered');

      const outcome = await h.handler.handle(h.target);

      expect(outcome.kind).toBe('delivery_pending');
      expect(outcome.kind === 'delivery_pending' && outcome.workId).toBe('101');
      expect(outcome.scan?.skipped.map((s) => s.workId)).toEqual(['100']);
      expect(outcome.scan?.skipped[0].code).toBe('duplicate');
      // "submitted candidate X after skipping Y candidates"
      expect(outcomeSummary(outcome)).toMatch(
        /submitted candidate 101 \(illustration\) for review after skipping 1 candidate/
      );
    } finally {
      h.close();
    }
  });

  it('submits candidate #2 even when the duplicate is only discovered AFTER download', async () => {
    // A planner with no ledger visibility cannot pre-filter, so candidate #1 is
    // downloaded and only then found already delivered. It must still advance.
    const h = buildHarness({ candidates: [100, 101], blindPlanner: true });
    try {
      h.markSubmitted('100', 'delivered');

      const outcome = await h.handler.handle(h.target);

      expect(outcome.kind).toBe('delivery_pending');
      expect(outcome.kind === 'delivery_pending' && outcome.workId).toBe('101');
      expect(h.downloader.downloadIllustration).toHaveBeenCalledTimes(2);
      expect(outcome.scan?.attempted).toBe(2);
      expect(outcome.scan?.skipped.map((s) => s.code)).toEqual(['duplicate']);
    } finally {
      h.close();
    }
  });

  it('submits candidate #3 when candidates #1 and #2 are duplicates', async () => {
    const h = buildHarness({ candidates: [100, 101, 102], blindPlanner: true });
    try {
      h.markSubmitted('100', 'delivered');
      h.markSubmitted('101', 'delivered');

      const outcome = await h.handler.handle(h.target);

      expect(outcome.kind).toBe('delivery_pending');
      expect(outcome.kind === 'delivery_pending' && outcome.workId).toBe('102');
      expect(outcome.scan?.skipped.map((s) => s.workId)).toEqual(['100', '101']);
      expect(outcome.scan?.attempted).toBe(3);
      expect(outcomeSummary(outcome)).toMatch(/after skipping 2 candidate/);
    } finally {
      h.close();
    }
  });

  it('treats an already-PENDING review submission as taken and moves on', async () => {
    const h = buildHarness({ candidates: [100, 101] });
    try {
      h.markSubmitted('100', 'pending');

      const outcome = await h.handler.handle(h.target);

      expect(outcome.kind).toBe('delivery_pending');
      expect(outcome.kind === 'delivery_pending' && outcome.workId).toBe('101');
      expect(outcome.scan?.skipped[0]).toMatchObject({ code: 'duplicate', workId: '100' });
    } finally {
      h.close();
    }
  });

  it('all candidates duplicates -> clean bounded no-op with an explicit outcome', async () => {
    const h = buildHarness({ candidates: [100, 101, 102] });
    try {
      h.markSubmitted('100', 'delivered');
      h.markSubmitted('101', 'delivered');
      h.markSubmitted('102', 'delivered');

      const outcome = await h.handler.handle(h.target);

      expect(outcome.kind).toBe('no_candidate');
      expect(outcome.scan?.skipped).toHaveLength(3);
      expect(outcome.scan?.skipped.every((s) => s.code === 'duplicate')).toBe(true);
      const reason = outcome.kind === 'no_candidate' ? outcome.reason : '';
      expect(reason).toMatch(/no eligible candidate found after scanning \d+/);
      // Never the bare, unexplained "completed" the defect produced.
      expect(outcomeSummary(outcome)).not.toMatch(/^completed/);
      // No exception escaped: clean no-op.
      expect(h.downloader.downloadIllustration).not.toHaveBeenCalled();
    } finally {
      h.close();
    }
  });

  it('all candidates duplicates discovered post-download -> bounded scan, explicit outcome', async () => {
    const h = buildHarness({ candidates: [100, 101, 102], blindPlanner: true });
    try {
      h.markSubmitted('100', 'delivered');
      h.markSubmitted('101', 'delivered');
      h.markSubmitted('102', 'delivered');

      const outcome = await h.handler.handle(h.target);

      expect(outcome.kind).toBe('no_candidate');
      expect(outcome.scan?.attempted).toBe(3);
      expect(outcome.scan?.skipped).toHaveLength(3);
      // Strictly bounded: each candidate attempted exactly once, then it stops.
      expect(h.downloader.downloadIllustration).toHaveBeenCalledTimes(3);
      expect(outcome.kind === 'no_candidate' && outcome.reason).toMatch(
        /no eligible candidate found after scanning 3/
      );
    } finally {
      h.close();
    }
  });

  it.each([
    ['deleted', () => new Error('404 not found: work deleted')],
    ['access_denied', () => new Error('403 forbidden: private work')],
    ['unsupported_media', () => new Error('ugoira unsupported media format')],
    ['invalid_metadata', () => new Error('invalid metadata: no image urls')],
  ])('candidate #1 %s -> next candidate is tried', async (expectedCode, makeError) => {
    const h = buildHarness({
      candidates: [100, 101],
      blindPlanner: true,
      failWith: (pixivId) => (pixivId === '100' ? (makeError() as Error) : null),
    });
    try {
      const outcome = await h.handler.handle(h.target);

      expect(outcome.kind).toBe('delivery_pending');
      expect(outcome.kind === 'delivery_pending' && outcome.workId).toBe('101');
      expect(outcome.scan?.attempted).toBe(2);
      expect(outcome.scan?.skipped[0]).toMatchObject({ code: expectedCode, workId: '100' });
    } finally {
      h.close();
    }
  });

  it('an unavailable candidate (transient) is skipped and the next one is submitted', async () => {
    const h = buildHarness({
      candidates: [100, 101],
      blindPlanner: true,
      failWith: (pixivId) => (pixivId === '100' ? new NetworkError('ETIMEDOUT fetching image') : null),
    });
    try {
      const outcome = await h.handler.handle(h.target);

      expect(outcome.kind).toBe('delivery_pending');
      expect(outcome.kind === 'delivery_pending' && outcome.workId).toBe('101');
      expect(outcome.scan?.skipped[0]).toMatchObject({ code: 'unavailable', retryable: true });
    } finally {
      h.close();
    }
  });

  describe('job-level failures never degrade into "no eligible candidate"', () => {
    it('a general network outage FAILS the target as retryable', async () => {
      const h = buildHarness({
        candidates: [100, 101, 102],
        blindPlanner: true,
        failWith: () => new NetworkError('getaddrinfo ENOTFOUND app-api.pixiv.net'),
      });
      try {
        const outcome = await h.handler.handle(h.target);

        expect(outcome.kind).toBe('failed');
        expect(outcome.kind === 'failed' && outcome.retryable).toBe(true);
        expect(outcome.kind === 'failed' && outcome.error).toMatch(/transient|outage/);
      } finally {
        h.close();
      }
    });

    it('a global Pixiv auth failure FAILS the target', async () => {
      const h = buildHarness({
        candidates: [100, 101],
        blindPlanner: true,
        failWith: () => new AuthenticationError('invalid refresh token (401 unauthorized)'),
      });
      try {
        const outcome = await h.handler.handle(h.target);

        expect(outcome.kind).toBe('failed');
        expect(outcome.kind === 'failed' && outcome.error).toMatch(/invalid refresh token/);
        expect(outcomeSummary(outcome)).not.toMatch(/no eligible candidate/);
      } finally {
        h.close();
      }
    });

    it('a database outage FAILS the target', async () => {
      const h = buildHarness({
        candidates: [100, 101],
        blindPlanner: true,
        failWith: () => new DatabaseError('database is locked'),
      });
      try {
        const outcome = await h.handler.handle(h.target);

        expect(outcome.kind).toBe('failed');
        expect(outcomeSummary(outcome)).not.toMatch(/no eligible candidate/);
      } finally {
        h.close();
      }
    });

    it('a Telegram delivery outage FAILS the target as retryable', async () => {
      const h = buildHarness({
        candidates: [100, 101],
        blindPlanner: true,
        failWith: () =>
          new Error('telegram delivery target unavailable: api.telegram.org answered 503'),
      });
      try {
        const outcome = await h.handler.handle(h.target);

        expect(outcome.kind).toBe('failed');
        expect(outcome.kind === 'failed' && outcome.retryable).toBe(true);
        expect(outcomeSummary(outcome)).not.toMatch(/no eligible candidate/);
      } finally {
        h.close();
      }
    });

    it('an outage is NOT reported as an exhausted candidate list even next to real duplicates', async () => {
      const h = buildHarness({
        candidates: [100, 101, 102, 103, 104, 105],
        blindPlanner: true,
        failWith: (pixivId) => (pixivId === '101' ? new NetworkError('ECONNRESET api.pixiv.net') : null),
      });
      try {
        h.markSubmitted('100', 'delivered');
        h.markSubmitted('102', 'delivered');
        h.markSubmitted('103', 'delivered');
        h.markSubmitted('104', 'delivered');
        h.markSubmitted('105', 'delivered');

        const outcome = await h.handler.handle(h.target);

        expect(outcome.kind).toBe('failed');
        expect(outcome.kind === 'failed' && outcome.retryable).toBe(true);
      } finally {
        h.close();
      }
    });
  });

  describe('the configured bound N', () => {
    it('never attempts more candidates than the per-target candidateScanLimit', async () => {
      const h = buildHarness({
        candidates: [100, 101, 102, 103, 104, 105, 106, 107],
        blindPlanner: true,
        target: { candidateScanLimit: 3 },
      });
      try {
        for (const id of [100, 101, 102, 103, 104, 105, 106, 107]) {
          h.markSubmitted(String(id), 'delivered');
        }

        const outcome = await h.handler.handle(h.target);

        expect(outcome.scan?.bound).toBe(3);
        expect(outcome.scan?.attempted).toBe(3);
        expect(h.downloader.downloadIllustration).toHaveBeenCalledTimes(3);
        expect(outcome.kind).toBe('no_candidate');
        expect(outcome.kind === 'no_candidate' && outcome.reason).toMatch(
          /no eligible candidate found after scanning 3/
        );
      } finally {
        h.close();
      }
    });

    it('falls back to the global download.candidateScanLimit', async () => {
      const h = buildHarness({
        candidates: [100, 101, 102, 103, 104, 105, 106],
        blindPlanner: true,
        config: { download: { concurrency: 1, maxRetries: 1, retryDelay: 0, candidateScanLimit: 2 } },
      });
      try {
        for (const id of [100, 101, 102, 103, 104, 105, 106]) {
          h.markSubmitted(String(id), 'delivered');
        }

        const outcome = await h.handler.handle(h.target);

        expect(outcome.scan?.bound).toBe(2);
        expect(outcome.scan?.attempted).toBe(2);
        expect(h.downloader.downloadIllustration).toHaveBeenCalledTimes(2);
      } finally {
        h.close();
      }
    });

    it('defaults to DEFAULT_CANDIDATE_SCAN_LIMIT and never drops below the target limit', () => {
      const db = { getDownloadedIds: jest.fn(() => new Set<string>()) } as never;
      const planner = new DownloadPlanner(db);
      const items = [1, 2, 3, 4, 5, 6, 7, 8].map(illust);

      const single = planner.planDownloads(items, { type: 'illustration', limit: 1 } as TargetConfig, 'illustration');
      expect(single.scanBound).toBe(DEFAULT_CANDIDATE_SCAN_LIMIT);
      expect(single.queue).toHaveLength(DEFAULT_CANDIDATE_SCAN_LIMIT);

      const many = planner.planDownloads(items, { type: 'illustration', limit: 6 } as TargetConfig, 'illustration');
      // A multi-work target must still be able to fill its own limit.
      expect(many.scanBound).toBe(6);
      expect(many.queue).toHaveLength(6);

      const clamped = planner.planDownloads(
        items,
        { type: 'illustration', limit: 1, candidateScanLimit: 400 } as TargetConfig,
        'illustration'
      );
      expect(clamped.scanBound).toBe(8); // clamped to 100, capped by 8 available
    });
  });

  describe('concurrency safety against the ledger', () => {
    it('two concurrent runs produce exactly ONE submission for a given work', async () => {
      const h = buildHarness({ candidates: [100, 101], blindPlanner: true });
      try {
        // Force a genuine interleaving: both workers must be inside the
        // download of work 100 before either can reach the delivery ledger.
        let arrivals = 0;
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const fallback = setTimeout(release, 3000);
        h.downloader.downloadIllustration.mockImplementation(
          async (item: PixivIllust): Promise<DownloadedArtifact> => {
            if (String(item.id) === '100') {
              arrivals += 1;
              if (arrivals >= 2) release();
              await gate;
            }
            return {
              pixivId: String(item.id),
              type: 'illustration',
              title: item.title,
              files: [join(tmpdir(), `pixivflow-scan-race-${item.id}.jpg`)],
              previewFiles: [],
            } as DownloadedArtifact;
          }
        );
        // Real files: enqueue refuses to create an intent for a missing artifact.
        for (const id of [100, 101]) {
          writeFileSync(join(tmpdir(), `pixivflow-scan-race-${id}.jpg`), 'image');
        }

        const [first, second] = await Promise.all([
          h.handler.handle(h.target),
          h.handler.handle(h.target),
        ]);
        clearTimeout(fallback);

        expect(arrivals).toBe(2);

        // THE invariant: one ledger row for the contested work, one outbox
        // side effect, regardless of how many workers selected it.
        const rowsFor100 = h.ledgerRowsFor('100');
        expect(rowsFor100).toHaveLength(1);
        expect(new Set(rowsFor100.map((r) => r.idempotencyKey)).size).toBe(1);

        // Both runs reached a business outcome; neither reported an exhausted
        // candidate list, and the contested work was submitted once.
        expect([first.kind, second.kind]).toEqual(['delivery_pending', 'delivery_pending']);
        if (first.kind === 'delivery_pending' && second.kind === 'delivery_pending') {
          expect(first.workId).toBe('100');
          expect(second.workId).toBe('100');
          expect(first.deliveryId).toBe(second.deliveryId);
        }
        // Exactly one durable side effect for the contested work: one ledger
        // row and one outbox item, whether one worker or both selected it.
        expect(h.ledgerRowCount()).toBe(1);
        expect(h.outboxDeliveryRows()).toBe(1);
      } finally {
        h.close();
      }
    });
  });

  describe('scenario #1 vs #2 vocabulary', () => {
    it('merges per-page scans so a lookback reports the whole candidate picture', () => {
      const merged = mergeScanSummaries(
        { bound: 5, attempted: 2, skipped: [{ code: 'duplicate', workId: '1', reason: 'x' }], outages: [] },
        {
          bound: 5,
          attempted: 3,
          skipped: [{ code: 'deleted', workId: '2', reason: 'y' }],
          outages: ['network_outage'],
        }
      );
      expect(merged).toEqual({
        bound: 10,
        attempted: 5,
        skipped: [
          { code: 'duplicate', workId: '1', reason: 'x' },
          { code: 'deleted', workId: '2', reason: 'y' },
        ],
        outages: ['network_outage'],
      });
      expect(noEligibleCandidateText(merged)).toContain('scanning 5');
    });
  });
});

describe('scheduled slot: the cell work-claim must not block the scan', () => {
  it('releases the provisional cell claim when candidate #1 is a duplicate', async () => {
    const h = buildHarness({ candidates: [100, 101], blindPlanner: true, withSlot: true });
    try {
      h.markSubmitted('100', 'delivered');

      const outcome = await h.handle();

      // Without the release, `bind()` would refuse work 101 and the slot would
      // still end with nothing submitted: the production defect, one level down.
      expect(outcome.kind).toBe('delivery_pending');
      expect(outcome.kind === 'delivery_pending' && outcome.workId).toBe('101');
      expect(h.cellWorkId()).toBe('101');
      expect(outcome.scan?.skipped.map((s) => s.code)).toEqual(['duplicate']);
      expect(h.downloader.downloadIllustration).toHaveBeenCalledTimes(2);
    } finally {
      h.close();
    }
  });

  it('keeps the cell claim once a delivery intent exists (a committed identity is never swapped)', async () => {
    const h = buildHarness({ candidates: [100, 101], blindPlanner: true, withSlot: true });
    try {
      const outcome = await h.handle();

      expect(outcome.kind).toBe('delivery_pending');
      expect(outcome.kind === 'delivery_pending' && outcome.workId).toBe('100');
      expect(h.cellWorkId()).toBe('100');
      // Committed: the outbox owns this work now, so the scan stopped here.
      expect(h.downloader.downloadIllustration).toHaveBeenCalledTimes(1);
      expect(h.ledgerRowsFor('100')).toHaveLength(1);
    } finally {
      h.close();
    }
  });

  it('exhausts the bounded scan with a slot attached and reports the explicit verdict', async () => {
    const h = buildHarness({ candidates: [100, 101, 102], blindPlanner: true, withSlot: true });
    try {
      for (const id of [100, 101, 102]) h.markSubmitted(String(id), 'delivered');

      const outcome = await h.handle();

      expect(outcome.kind).toBe('no_candidate');
      expect(outcome.scan?.attempted).toBe(3);
      expect(h.downloader.downloadIllustration).toHaveBeenCalledTimes(3);
      // Nothing was committed, so the cell must be left unbound rather than
      // pinned to an undeliverable work.
      expect(h.cellWorkId()).toBeNull();
      expect(outcome.kind === 'no_candidate' && outcome.reason).toMatch(
        /no eligible candidate found after scanning 3/
      );
    } finally {
      h.close();
    }
  });

  it('records the explicit no-eligible-candidate verdict on the slot ledger', async () => {
    const h = buildHarness({ candidates: [100, 101], blindPlanner: true, withSlot: true });
    try {
      h.markSubmitted('100', 'delivered');
      h.markSubmitted('101', 'delivered');

      const outcome = await h.handle();

      // Nothing was submitted, so the durable verdict must NAME the reason:
      // never a bare "completed" cell with no explanation.
      expect(outcome.kind).toBe('no_candidate');
      h.applyOutcomeToSlot(outcome);
      const summary = h.finishSlot();
      expect(summary.status).toBe('failed');
      const cell = summary.cells.find((c) => c.targetId === 'target-a')!;
      expect(cell.status).toBe('no_candidate');
      expect(cell.error).toMatch(/no eligible candidate found after scanning/);
    } finally {
      h.close();
    }
  });

  it('records the chosen work id on the slot cell when a later candidate is eligible', async () => {
    const h = buildHarness({ candidates: [100, 101], blindPlanner: true, withSlot: true });
    try {
      h.markSubmitted('100', 'delivered');

      const outcome = await h.handle();
      expect(outcome.kind).toBe('delivery_pending');
      h.applyOutcomeToSlot(outcome);

      expect(h.cellWorkId()).toBe('101');
      expect(h.cellStatus()).toBe('delivery_pending');
      const cell = h.finishSlot().cells.find((c) => c.targetId === 'target-a')!;
      // delivery_pending is NOT submitted: only a confirmed ACK is.
      expect(cell.status).toBe('delivery_pending');
      expect(cell.workId).toBe('101');
    } finally {
      h.close();
    }
  });
});


describe('the candidate-scan bound is configurable', () => {
  const ORIGINAL = process.env.PIXIV_CANDIDATE_SCAN_LIMIT;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PIXIV_CANDIDATE_SCAN_LIMIT;
    else process.env.PIXIV_CANDIDATE_SCAN_LIMIT = ORIGINAL;
  });

  it('reads PIXIV_CANDIDATE_SCAN_LIMIT into download.candidateScanLimit', () => {
    process.env.PIXIV_CANDIDATE_SCAN_LIMIT = '9';

    const overridden = applyEnvironmentOverrides({});

    expect(overridden.download?.candidateScanLimit).toBe(9);
  });

  it('ignores a non-positive or non-numeric value instead of disabling the bound', () => {
    process.env.PIXIV_CANDIDATE_SCAN_LIMIT = 'nonsense';
    expect(applyEnvironmentOverrides({}).download?.candidateScanLimit).toBeUndefined();

    process.env.PIXIV_CANDIDATE_SCAN_LIMIT = '0';
    expect(applyEnvironmentOverrides({}).download?.candidateScanLimit).toBeUndefined();
  });

  it('defaults to 5 and clamps a bad per-target value', () => {
    expect(DEFAULT_CANDIDATE_SCAN_LIMIT).toBe(5);
    const targetBase = { type: 'illustration' } as TargetConfig;
    expect(resolveCandidateScanLimit(targetBase, undefined)).toBe(5);
    expect(resolveCandidateScanLimit({ ...targetBase, candidateScanLimit: 0 } as TargetConfig, undefined)).toBe(1);
    expect(resolveCandidateScanLimit({ ...targetBase, candidateScanLimit: -3 } as TargetConfig, undefined)).toBe(1);
    expect(resolveCandidateScanLimit({ ...targetBase, candidateScanLimit: 9999 } as TargetConfig, undefined)).toBe(100);
    expect(resolveCandidateScanLimit({ ...targetBase, candidateScanLimit: 4 } as TargetConfig, 9)).toBe(4);
  });
});

describe('the FETCH stage asks for the whole scan window', () => {
  function rankingHarness() {
    const db = { getDownloadedIds: () => new Set<string>(), logExecution: jest.fn() } as never;
    const delivery = { isAlreadyDelivered: () => false } as never;
    const getRankingIllustrations = jest.fn().mockResolvedValue(
      [1, 2, 3, 4, 5, 6, 7, 8].map(illust)
    );
    const rankingService = {
      getRankingIllustrationsWithFallback: jest.fn((_mode: string, _date: string, limit?: number) =>
        getRankingIllustrations(limit)
      ),
    } as unknown as RankingService;
    const handler = new IllustrationTargetHandler(
      { searchIllustrations: jest.fn(), getIllustration: jest.fn() } as unknown as IPixivClient,
      db,
      rankingService,
      { downloadIllustration: jest.fn() } as unknown as IllustrationDownloader,
      { run: jest.fn() } as unknown as DownloadPipeline,
      undefined,
      delivery
    );
    return { handler, getRankingIllustrations };
  }

  it('asks the ranking API for the scan bound, not for `limit`, on a one-post-per-slot target', async () => {
    const { handler, getRankingIllustrations } = rankingHarness();

    const works = await (
      handler as unknown as {
        fetchIllustrations(target: TargetConfig, mode: string): Promise<PixivIllust[]>;
      }
    ).fetchIllustrations({ type: 'illustration', mode: 'ranking', limit: 1 } as TargetConfig, 'ranking');

    // The old code passed `target.limit` straight through, so the whole run
    // could only ever see ONE candidate — the defect's deepest root.
    // The mock returns a fixed page, so only the REQUESTED size is the contract
    // at this layer; the planner enforces the attempt cap downstream.
    expect(getRankingIllustrations).toHaveBeenCalledWith(DEFAULT_CANDIDATE_SCAN_LIMIT);
    expect(works.length).toBeGreaterThanOrEqual(DEFAULT_CANDIDATE_SCAN_LIMIT);
  });

  it('honours an explicit per-target bound when fetching', async () => {
    const { handler, getRankingIllustrations } = rankingHarness();

    const works = await (
      handler as unknown as {
        fetchIllustrations(target: TargetConfig, mode: string): Promise<PixivIllust[]>;
      }
    ).fetchIllustrations(
      { type: 'illustration', mode: 'ranking', limit: 1, candidateScanLimit: 3 } as TargetConfig,
      'ranking'
    );

    expect(getRankingIllustrations).toHaveBeenCalledWith(3);
  });

  it('still asks for at least `limit`, so a multi-work target is not shrunk', async () => {
    const { handler, getRankingIllustrations } = rankingHarness();

    await (
      handler as unknown as {
        fetchIllustrations(target: TargetConfig, mode: string): Promise<PixivIllust[]>;
      }
    ).fetchIllustrations({ type: 'illustration', mode: 'ranking', limit: 7 } as TargetConfig, 'ranking');

    expect(getRankingIllustrations).toHaveBeenCalledWith(7);
  });
});

describe('DownloadManager wiring', () => {
  it('hands the global candidateScanLimit and the submitted-work ledger to the planner', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-scan-mgr-'));
    const db = new Database(join(dir, 'test.db'));
    db.migrate();
    try {
      const manager = new DownloadManager(
        {
          download: { concurrency: 1, candidateScanLimit: 7 },
          storage: {},
          targets: [],
        } as unknown as StandaloneConfig,
        { searchIllustrations: jest.fn() } as unknown as IPixivClient,
        db,
        { initialise: jest.fn() } as never
      );
      const planner = (manager as unknown as { planner: { defaultCandidateScanLimit?: number } }).planner;
      expect(planner.defaultCandidateScanLimit).toBe(7);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
