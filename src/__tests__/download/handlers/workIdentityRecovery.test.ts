/**
 * RECOVERY MUST NOT SWAP THE WORK (the core regression).
 *
 * Before this fix the resume path reduced `pending` to `p.target`, losing
 * `cell.workId`. The handler then had no idea it was a recovery: it re-ran the
 * candidate pipeline, `downloads` filtered out the work the cell ALREADY had,
 * and a different work was selected for the same logical item.
 *
 * These tests drive the real handler with a real slot ledger, so they assert the
 * execution path — not just a DB column.
 */
import { IllustrationTargetHandler } from '../../../download/handlers/IllustrationTargetHandler';
import { TargetConfig, ScheduleConfig, StandaloneConfig } from '../../../config';
import { IPixivClient } from '../../../interfaces/IPixivClient';
import { IDatabase } from '../../../interfaces/IDatabase';
import { RankingService } from '../../../download/RankingService';
import { IllustrationDownloader } from '../../../download/IllustrationDownloader';
import { DownloadPipeline } from '../../../download/pipeline/DownloadPipeline';
import { PixivIllust } from '@redtidev/pixiv-client';
import { Database } from '../../../storage/Database';
import { SlotCoordinator } from '../../../scheduler/SlotCoordinator';
import { createDeliveryLedgerPort } from '../../../delivery/DeliveryLedgerPort';
import { DeliveryService } from '../../../delivery/DeliveryService';
import { DownloadedArtifact } from '../../../delivery/types';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

jest.mock('../../../logger');
jest.mock('../../../utils/pixiv-date-utils', () => ({
  getTodayDate: jest.fn().mockReturnValue('2026-09-08'),
  getYesterdayDate: jest.fn().mockReturnValue('2026-09-07'),
}));

const TARGET_ID = 'daily-illust';
const SLOT_TARGET = 'telepost';
/** One work per run — the shape the work-identity invariant is defined for. */
const target = (): TargetConfig =>
  ({
    id: TARGET_ID,
    type: 'illustration',
    tag: 'landscape',
    mode: 'search',
    limit: 1,
    storageMode: 'cache',
    delivery: { target: SLOT_TARGET },
  }) as TargetConfig;

const schedule = {
  id: 'schedule-a',
  name: 'Schedule A',
  cron: '0 10 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
} as ScheduleConfig;
const config = { schedulerRuntime: { trigger: { graceMinutes: 120 } } } as StandaloneConfig;
const AT = new Date('2026-09-08T02:00:30Z');

const createMockIllust = (id: number): PixivIllust =>
  ({
    id,
    title: `Illust ${id}`,
    page_count: 1,
    user: { id: '12345', name: 'Test User' },
    image_urls: {
      square_medium: `https://example.com/${id}_square.jpg`,
      medium: `https://example.com/${id}_medium.jpg`,
      large: `https://example.com/${id}_large.jpg`,
    },
    create_date: '2026-09-08',
    total_bookmarks: 100,
    total_view: 1000,
  }) as PixivIllust;

const artifact = (pixivId: string): DownloadedArtifact =>
  ({
    type: 'illustration',
    pixivId,
    title: `Illust ${pixivId}`,
    files: [`/tmp/${pixivId}.jpg`],
    pageCount: 1,
    cachedDir: `/tmp/${pixivId}`,
  }) as unknown as DownloadedArtifact;

describe('work identity across recovery', () => {
  let handler: IllustrationTargetHandler;
  let mockClient: jest.Mocked<IPixivClient>;
  let mockDatabase: jest.Mocked<IDatabase>;
  let mockRankingService: jest.Mocked<RankingService>;
  let mockIllustrationDownloader: jest.Mocked<IllustrationDownloader>;
  let mockPipeline: jest.Mocked<DownloadPipeline>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = { searchIllustrations: jest.fn(), getIllustration: jest.fn() } as any;
    mockDatabase = { logExecution: jest.fn() } as any;
    mockRankingService = { getRankingIllustrationsWithFallback: jest.fn() } as any;
    mockIllustrationDownloader = { downloadIllustration: jest.fn() } as any;
    mockPipeline = { run: jest.fn() } as any;

    handler = new IllustrationTargetHandler(
      mockClient,
      mockDatabase,
      mockRankingService,
      mockIllustrationDownloader,
      mockPipeline
    );
  });

  /**
   * A sequential candidate loop: the first work that yields an artifact stops
   * the run. This is what DownloadPipeline does for a single-work target, and it
   * is what makes "which candidate wins" observable.
   */
  function pipelineDownloadsEveryCandidate(): void {
    mockPipeline.run.mockImplementation(async (items: any, _t: any, _ty: any, downloadFn: any) => {
      for (const item of items) await downloadFn(item, 'landscape');
      return { downloaded: items.length, skipped: 0, alreadyDownloaded: 0, filteredOut: 0 };
    });
  }

  async function withSlot<T>(fn: (ctx: { db: Database; slotId: string }) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-workid-handler-'));
    const db = new Database(join(dir, 'test.db'));
    db.migrate();
    const coord = new SlotCoordinator(db);
    const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
    coord.prepare(slot, schedule, [target()]);
    try {
      return await fn({ db, slotId: slot.slotId });
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('binds the cell to the selected work BEFORE any side effect', async () => {
    await withSlot(async ({ db, slotId }) => {
      const coord = new SlotCoordinator(db);
      mockClient.searchIllustrations.mockResolvedValue([createMockIllust(100)]);

      let workIdAtDownload: string | null | undefined;
      let statusAtDownload: string | undefined;
      mockIllustrationDownloader.downloadIllustration.mockImplementation(async () => {
        // Sampled exactly when the downloader runs: before it writes a downloads
        // row and before any delivery is enqueued.
        const cell = db.slots.getCell(slotId, TARGET_ID)!;
        workIdAtDownload = cell.workId;
        statusAtDownload = cell.status;
        return artifact('100');
      });
      pipelineDownloadsEveryCandidate();

      await handler.handle(
        target(),
        coord.executionContextsFor(slotId, coord.pendingTargets(slotId, [target()])).get(TARGET_ID)
      );

      expect(workIdAtDownload).toBe('100');
      expect(statusAtDownload).toBe('selected');
    });
  });

  it('resumes the SAME work after a crash that followed the download', async () => {
    await withSlot(async ({ db, slotId }) => {
      const coord = new SlotCoordinator(db);
      // First run: A was selected, bound and downloaded; then the process died
      // before a delivery intent existed. `downloads` now holds A — which is
      // exactly what used to make the resume filter A out and pick B.
      coord.lockWorkCas(slotId, TARGET_ID, '100', 'illustration');

      // Restart: a fresh coordinator, then the resume path the runtime uses.
      const resumed = new SlotCoordinator(db);
      const pending = resumed.pendingTargets(slotId, [target()]);
      expect(pending).toHaveLength(1);
      expect(pending[0].cell.workId).toBe('100');

      mockClient.getIllustration.mockResolvedValue(createMockIllust(100));
      mockIllustrationDownloader.downloadIllustration.mockResolvedValue(artifact('100'));

      await handler.handle(target(), resumed.executionContextsFor(slotId, pending).get(TARGET_ID));

      // A is fetched and processed by identity...
      expect(mockClient.getIllustration).toHaveBeenCalledWith(100);
      expect(mockIllustrationDownloader.downloadIllustration).toHaveBeenCalledTimes(1);
      expect(mockIllustrationDownloader.downloadIllustration.mock.calls[0][0]).toMatchObject({ id: 100 });
      // ...and selection never ran, so no other work could be selected for it.
      expect(mockClient.searchIllustrations).not.toHaveBeenCalled();
      expect(mockRankingService.getRankingIllustrationsWithFallback).not.toHaveBeenCalled();
      expect(mockPipeline.run).not.toHaveBeenCalled();
      expect(db.slots.getCell(slotId, TARGET_ID)!.workId).toBe('100');
    });
  });

  it('CONTRAST: dropping the cell at dispatch is exactly what swaps the work', async () => {
    await withSlot(async ({ db, slotId }) => {
      const coord = new SlotCoordinator(db);
      // Crash after the download: the cell owns A and `downloads` holds A.
      coord.lockWorkCas(slotId, TARGET_ID, '100', 'illustration');

      // Pre-fix wiring: `pending.map(p => p.target)` threw the cell away, so the
      // handler ran selection again. `downloads` (and later the delivery ledger)
      // exclude A, so the pool the pipeline sees is [B] — and B is what it
      // processes under A's logical identity.
      const preFixRunTargets = coord.pendingTargets(slotId, [target()]).map((p) => p.target);
      mockClient.searchIllustrations.mockResolvedValue([createMockIllust(200)]);
      pipelineDownloadsEveryCandidate();
      mockIllustrationDownloader.downloadIllustration.mockResolvedValue(artifact('200'));

      await handler.handle(preFixRunTargets[0]);

      expect(mockIllustrationDownloader.downloadIllustration.mock.calls[0][0]).toMatchObject({ id: 200 });
      // The cell's identity stays 100 while work 200 is what was processed.
      expect(db.slots.getCell(slotId, TARGET_ID)!.workId).toBe('100');
    });
  });

  it('never substitutes another work when the locked work is permanently gone', async () => {
    await withSlot(async ({ db, slotId }) => {
      const coord = new SlotCoordinator(db);
      coord.lockWorkCas(slotId, TARGET_ID, '100', 'illustration');
      mockClient.getIllustration.mockRejectedValue(new Error('HTTP 404: work is deleted or private'));
      mockClient.searchIllustrations.mockResolvedValue([createMockIllust(200)]);

      const pending = new SlotCoordinator(db).pendingTargets(slotId, [target()]);
      const outcome = await handler.handle(
        target(),
        coord.executionContextsFor(slotId, pending).get(TARGET_ID)
      );

      // The item fails AS A. It must not silently become B.
      expect(outcome).toMatchObject({ kind: 'failed', retryable: false });
      expect(outcome.kind === 'failed' && outcome.error).toContain('LOCKED_WORK_UNAVAILABLE');
      expect(mockClient.searchIllustrations).not.toHaveBeenCalled();
      expect(mockIllustrationDownloader.downloadIllustration).not.toHaveBeenCalled();
      expect(db.slots.getCell(slotId, TARGET_ID)!.workId).toBe('100');
    });
  });

  it('does not invoke the handler at all while the outbox still owns the cell', async () => {
    await withSlot(async ({ db, slotId }) => {
      const coord = new SlotCoordinator(db);
      coord.lockWorkCas(slotId, TARGET_ID, '100', 'illustration');
      coord.applyOutcome(slotId, TARGET_ID, {
        kind: 'delivery_pending',
        workId: '100',
        workType: 'illustration',
        deliveryId: 'delivery-100',
      });
      // The intent survived the crash, and its outbox row is still actionable.
      const intent = db.deliveries.insertIntent({
        id: 'delivery-100',
        deliveryTarget: SLOT_TARGET,
        workType: 'illustration',
        pixivId: '100',
        slotId,
        targetId: TARGET_ID,
        idempotencyKey: `pixivflow:${SLOT_TARGET}:illustration:100:${slotId}:${TARGET_ID}`,
      }).row;
      db.outbox.enqueue({
        kind: 'delivery',
        deliveryTarget: SLOT_TARGET,
        deliveryId: intent.id,
        idempotencyKey: `outbox:${intent.idempotencyKey}`,
        payload: {},
      });

      // Resume with the real ledger port: the outbox owns this delivery.
      const resumed = new SlotCoordinator(db, createDeliveryLedgerPort(db));
      const dispatch = resumed.pendingTargets(slotId, [target()]);

      for (const { target: t, cell } of dispatch) {
        await handler.handle(t, resumed.executionContextsFor(slotId, [{ target: t, cell }]).get(TARGET_ID));
      }

      expect(dispatch).toEqual([]);
      expect(mockClient.searchIllustrations).not.toHaveBeenCalled();
      expect(mockClient.getIllustration).not.toHaveBeenCalled();
      expect(mockPipeline.run).not.toHaveBeenCalled();
      expect(mockIllustrationDownloader.downloadIllustration).not.toHaveBeenCalled();
      expect(mockRankingService.getRankingIllustrationsWithFallback).not.toHaveBeenCalled();
      // Still exactly one logical delivery for the cell, still pointing at A.
      const deliveries = db.deliveries.listForCell(SLOT_TARGET, slotId, TARGET_ID);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].pixivId).toBe('100');
    });
  });

  it('refuses to process a work the cell does not own (first selection wins)', async () => {
    await withSlot(async ({ db, slotId }) => {
      const coord = new SlotCoordinator(db);
      // The context was built while the cell was still unbound...
      const contextsWhileUnbound = coord.executionContextsFor(
        slotId,
        coord.pendingTargets(slotId, [target()])
      );
      // ...then another worker elected work 100 for it.
      coord.lockWorkCas(slotId, TARGET_ID, '100', 'illustration');

      mockClient.searchIllustrations.mockResolvedValue([createMockIllust(200)]);
      pipelineDownloadsEveryCandidate();
      mockIllustrationDownloader.downloadIllustration.mockResolvedValue(artifact('200'));

      await handler.handle(target(), contextsWhileUnbound.get(TARGET_ID));

      // The loser must not keep processing its own candidate B.
      expect(mockIllustrationDownloader.downloadIllustration).not.toHaveBeenCalled();
      expect(db.slots.getCell(slotId, TARGET_ID)!.workId).toBe('100');
    });
  });

  it('frees a failed candidate, so an unbound cell is never stuck on it', async () => {
    await withSlot(async ({ db, slotId }) => {
      const coord = new SlotCoordinator(db);
      mockClient.searchIllustrations.mockResolvedValue([createMockIllust(100)]);
      // The candidate fails without persisting anything, so nothing is committed
      // and the cell must stay free — otherwise a 404 candidate would consume the
      // logical item's identity forever.
      mockIllustrationDownloader.downloadIllustration.mockRejectedValue(
        new Error('HTTP 404: candidate 100 is gone')
      );
      pipelineDownloadsEveryCandidate();

      const outcome = await handler.handle(
        target(),
        coord.executionContextsFor(slotId, coord.pendingTargets(slotId, [target()])).get(TARGET_ID)
      );

      expect(outcome.kind).toBe('failed');
      const cell = db.slots.getCell(slotId, TARGET_ID)!;
      expect(cell.workId).toBeNull();
      expect(cell.status).toBe('pending');
    });
  });

  it('binds only the work that actually produced an artifact', async () => {
    await withSlot(async ({ db, slotId }) => {
      const coord = new SlotCoordinator(db);
      mockClient.searchIllustrations.mockResolvedValue([createMockIllust(200)]);
      mockIllustrationDownloader.downloadIllustration.mockResolvedValue(artifact('200'));
      pipelineDownloadsEveryCandidate();

      await handler.handle(
        target(),
        coord.executionContextsFor(slotId, coord.pendingTargets(slotId, [target()])).get(TARGET_ID)
      );

      expect(db.slots.getCell(slotId, TARGET_ID)!.workId).toBe('200');
    });
  });

  it('ignores the execution context for targets that intentionally own N works per run', async () => {
    await withSlot(async ({ db, slotId }) => {
      const coord = new SlotCoordinator(db);
      const multi: TargetConfig = { ...target(), limit: 10 } as TargetConfig;
      mockClient.searchIllustrations.mockResolvedValue([createMockIllust(100), createMockIllust(200)]);
      mockIllustrationDownloader.downloadIllustration.mockResolvedValue(artifact('100'));
      pipelineDownloadsEveryCandidate();

      // A cell with a stale binding must still fetch the whole feed: pinning it
      // to one work would silently shrink the run.
      coord.lockWorkCas(slotId, TARGET_ID, '100', 'illustration');
      await handler.handle(multi, coord.executionContextsFor(slotId, [{ target: multi, cell: db.slots.getCell(slotId, TARGET_ID)! }]).get(TARGET_ID));

      expect(mockClient.searchIllustrations).toHaveBeenCalled();
      expect(mockClient.getIllustration).not.toHaveBeenCalled();
      expect(mockPipeline.run).toHaveBeenCalled();
    });
  });

  it('maps the locked work to a STABLE delivery idempotency identity across recovery', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-workid-idem-'));
    const db = new Database(join(dir, 'test.db'));
    db.migrate();
    const file = join(dir, '100.jpg');
    writeFileSync(file, 'img');
    try {
      const coord = new SlotCoordinator(db);
      const slot = coord.resolveOccurrence(schedule, config, 'http', AT).context!;
      // The runtime injects the occurrence into delivery.executionContext; the
      // intent key must be scoped to this slot, not fall back to 'adhoc'.
      const scopedTarget = {
        ...target(),
        delivery: { target: SLOT_TARGET, executionContext: { slotId: slot.slotId } },
      } as TargetConfig;
      coord.prepare(slot, schedule, [scopedTarget]);

      // Crash after the download bound A, before any delivery intent existed.
      coord.lockWorkCas(slot.slotId, TARGET_ID, '100', 'illustration');

      const recoveringHandler = new IllustrationTargetHandler(
        mockClient,
        mockDatabase,
        mockRankingService,
        mockIllustrationDownloader,
        mockPipeline,
        undefined,
        new DeliveryService(db)
      );
      mockClient.getIllustration.mockResolvedValue(createMockIllust(100));
      mockIllustrationDownloader.downloadIllustration.mockResolvedValue({
        type: 'illustration',
        pixivId: '100',
        title: 'Illust 100',
        files: [file],
        pageCount: 1,
        cachedDir: dir,
      } as unknown as DownloadedArtifact);

      const resumed = new SlotCoordinator(db);
      const pending = resumed.pendingTargets(slot.slotId, [scopedTarget]);
      const outcome = await recoveringHandler.handle(
        scopedTarget,
        resumed.executionContextsFor(slot.slotId, pending).get(TARGET_ID)
      );

      expect(outcome.kind).toBe('delivery_pending');
      const intents = db.deliveries.listForCell(SLOT_TARGET, slot.slotId, TARGET_ID);
      // One logical item => exactly one intent, still pointing at the locked work.
      expect(intents).toHaveLength(1);
      expect(intents[0].pixivId).toBe('100');

      // The key is a pure function of the work identity, so recovering the SAME
      // work always yields the SAME downstream idempotency identity (a replay
      // converges to one remote record instead of double-posting).
      const keyFor = (pixivId: string) =>
        DeliveryService.idempotencyKey(
          SLOT_TARGET,
          { type: 'illustration', pixivId } as DownloadedArtifact,
          slot.slotId,
          TARGET_ID
        );
      expect(intents[0].idempotencyKey).toBe(keyFor('100'));
      // ...whereas a swapped work would carry a different identity — which is
      // exactly what silently re-pointing the item at B would have produced.
      expect(keyFor('200')).not.toBe(keyFor('100'));
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
