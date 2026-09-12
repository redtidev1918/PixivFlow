/**
 * V4 simulation — illustration happy path (P2).
 *
 * Contract under test:
 *
 *   schedule trigger -> occurrence -> Slot -> target
 *     -> fake Pixiv illustration candidate -> synthetic media
 *     -> download completion -> outbox -> TelePost submission
 *     -> pending review -> simulated approve -> fake Telegram publish
 *     -> published
 *
 * Isolation: loopback only, temporary directory, temporary SQLite, synthetic
 * credentials, synthetic media, fake Pixiv and fake Telegram responses. No
 * production secret is read and no production service is contacted.
 *
 * Failures are reported with the full correlated state rather than a bare
 * `expected 1 received 2`, because the interesting question in this suite is
 * always "which stage of the chain diverged".
 */
import { V4Simulation, SIM_TARGET_ID, type SlotRunResult } from './harness';

jest.setTimeout(180_000);

describe('V4 simulation: illustration happy path', () => {
  let sim: V4Simulation;

  beforeAll(async () => {
    sim = await V4Simulation.start();
  });

  afterAll(async () => {
    await sim?.close();
  });

  it('produces exactly one of everything from trigger to publish', async () => {
    const run: SlotRunResult = await sim.runScheduledSlot();
    const facts: Record<string, unknown> = { slotId: run.slotId };

    /** Attach the correlated state to whatever assertion fails first. */
    const withState = async <T>(body: () => Promise<T> | T): Promise<T> => {
      try {
        return await body();
      } catch (error) {
        const state = await sim.describe('illustration happy path');
        throw new Error(`${(error as Error).message}\n\nfacts:\n${JSON.stringify(facts, null, 2)}\n\n${state}`);
      }
    };

    await withState(async () => {
      // ── Slot / target cardinality ─────────────────────────────────────────
      facts.pendingTargets = run.pendingTargetCount;
      facts.drained = run.drained;
      facts.runError = run.runError;
      facts.outbox = run.outboxRows;
      expect(run.pendingTargetCount).toBe(1);

      const cells = sim.cells(run.slotId);
      facts.cells = cells;
      expect(cells).toHaveLength(1);
      expect(cells[0].targetId).toBe(SIM_TARGET_ID);

      // download logical result = 1: the real pipeline locked a real work id
      // and the fake provider boundary was actually crossed.
      expect(cells[0].workId).toBeTruthy();
      facts.pixivDownloads = sim.pixiv.downloadedCount();
      expect(sim.pixiv.downloadedCount()).toBeGreaterThanOrEqual(1);

      // ── TelePost submission = 1, review = 1 ───────────────────────────────
      const reviews = await sim.reviews();
      facts.reviews = reviews.map((r) => ({ id: r.id, status: r.status, media: r.media_count }));
      expect(reviews).toHaveLength(1);

      // outbox logical delivery = 1
      const deliveryCounts = sim.deliveryCounts();
      facts.deliveryCounts = deliveryCounts;
      const totalDeliveries = Object.values(deliveryCounts).reduce((sum, n) => sum + n, 0);
      expect(totalDeliveries).toBe(1);
      expect(deliveryCounts.pending ?? 0).toBe(0);

      const review = reviews[0];
      // TelePost's queue status is `pending` (not `pending_review`).
      expect(review.status).toBe('pending');
      expect(Number(review.media_count ?? 0)).toBeGreaterThanOrEqual(1);

      // Nothing may be published before an explicit approval.
      facts.publishesBeforeApprove = sim.publishesToChannel().map((p) => p.method);
      expect(sim.publishesToChannel()).toHaveLength(0);

      // ── simulated approve -> fake Telegram publish ────────────────────────
      const approved = await sim.approve(review.id);
      facts.approveStatus = approved.status;
      facts.approveBody = approved.json;
      expect(approved.status).toBeLessThan(300);

      const publishedPublishes = sim.publishesToChannel();
      facts.publishesAfterApprove = publishedPublishes.map((p) => ({
        method: p.method,
        chat: p.chatId,
        media: p.mediaIds.length,
        fileParts: p.fileParts,
      }));

      // Telegram publish = 1, asserted on the fake server's structured call log
      // (never on log text) and scoped to the publish channel so the review-card
      // posting cannot be mistaken for a publish.
      expect(publishedPublishes).toHaveLength(1);

      // ── final state ───────────────────────────────────────────────────────
      // `/reviews` is the pending queue and `/reviews/{id}` is not served once a
      // review is settled, so the authoritative terminal state is the approve
      // response body. The resource read is kept for observability only.
      const publishedReview = await sim.review(review.id);
      facts.reviewAfterApprove = publishedReview;

      const approveData = (approved.json.data ?? {}) as Record<string, unknown>;
      facts.approveData = approveData;
      expect(String(approveData.status ?? '')).toBe('published');
      expect(approveData.reused).toBe(false);
      if (publishedReview) expect(publishedReview.status).toBe('published');

      // Publish must be a real Bot API call the fake server answered with a
      // message id, not a local bookkeeping flip.
      expect(Number(approveData.message_id ?? 0)).toBeGreaterThan(0);

      const finalCounts = sim.deliveryCounts();
      facts.finalDeliveryCounts = finalCounts;
      const finalTotal = Object.values(finalCounts).reduce((sum, n) => sum + n, 0);
      expect(finalTotal).toBe(1);
      expect(finalCounts.pending ?? 0).toBe(0);

      // The slot's single cell must be terminal, not merely 'running'.
      const finalCells = sim.cells(run.slotId);
      facts.finalCells = finalCells;
      expect(['submitted', 'delivered', 'done']).toContain(finalCells[0].status);
    });
  });
});
