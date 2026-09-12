/**
 * P3 — lost ACK / idempotency.
 *
 * The reliability contract under test:
 *
 *   TelePost commits the submission and answers 201
 *   -> that response never reaches PixivFlow
 *   -> the durable outbox schedules a retry
 *   -> the retry carries the SAME idempotency key
 *   -> TelePost's real idempotency lookup replays the existing review
 *   -> exactly one review, exactly one publish
 *
 * The fault is injected at the loopback transport boundary only. TelePost runs
 * its real code path — the replay is produced by its own `find_active_by_key`
 * lookup, not by the harness.
 */
import { V4Simulation } from './harness';

jest.setTimeout(300_000);

/** Idempotency keys are namespaced by the production DeliveryService. */
const KEY_PREFIX = 'pixivflow:v4sim-telepost:illustration';

describe('V4 simulation — lost ACK / idempotency', () => {
  let sim: V4Simulation;

  beforeAll(async () => {
    sim = await V4Simulation.start({ lossyDeliveryTransport: true });
  });

  afterAll(async () => {
    await sim?.close();
  });

  it('retries with the same idempotency key and publishes exactly once', async () => {
    const transport = sim.transport;
    if (!transport) throw new Error('simulation started without a fault transport');
    const facts: Record<string, unknown> = {};

    try {
      // ── 1. trigger -> download -> durable outbox row, nothing delivered yet ──
      const first = await sim.runScheduledSlot({ drain: false, finish: false });
      facts.firstRun = first;
      expect(first.pendingTargetCount).toBe(1);
      expect(first.runError).toBeNull();

      const cellsAfterDownload = sim.cells(sim.slotId);
      expect(cellsAfterDownload).toHaveLength(1);
      expect(cellsAfterDownload[0].workId).toBeTruthy();

      const outboxEnqueued = sim.outboxRows();
      facts.outboxEnqueued = outboxEnqueued;
      expect(outboxEnqueued).toHaveLength(1);
      expect(outboxEnqueued[0].status).toBe('pending');
      expect(Number(outboxEnqueued[0].attempts)).toBe(0);

      // ── 2. first attempt: the server commits, the response is lost ──────────
      transport.dropNextResponse();
      const attemptOne = await sim.drainOutbox(1);
      facts.attemptOne = attemptOne;

      const afterLoss = sim.submissionAttempts();
      facts.attemptsAfterLoss = afterLoss;
      expect(afterLoss).toHaveLength(1);
      // Server side really happened: the upstream committed and answered.
      expect(afterLoss[0].upstreamStatus).toBe(201);
      expect(afterLoss[0].businessStatus).toBe('accepted');
      expect(afterLoss[0].transportError).toBeNull();
      // Client side really did not see it.
      expect(afterLoss[0].droppedResponse).toBe(true);

      // The loss must surface as a scheduled retry, never as a success.
      const outboxAfterLoss = sim.outboxRows();
      facts.outboxAfterLoss = outboxAfterLoss;
      expect(outboxAfterLoss[0].status).toBe('retry_wait');
      expect(Number(outboxAfterLoss[0].attempts)).toBeGreaterThanOrEqual(1);
      expect(sim.cells(sim.slotId)[0].status).not.toBe('submitted');

      // TelePost did persist a review behind that lost response.
      const reviewsAfterLoss = await sim.reviews();
      facts.reviewsAfterLoss = reviewsAfterLoss.map((review) => ({ id: review.id, status: review.status }));
      expect(reviewsAfterLoss).toHaveLength(1);

      // ── 3. retry: same key, TelePost's real idempotency path ────────────────
      const attemptTwo = await sim.drainOutbox();
      facts.attemptTwo = attemptTwo;

      const attempts = sim.submissionAttempts();
      facts.attempts = attempts;
      expect(attempts).toHaveLength(2);
      expect(attempts[1].droppedResponse).toBe(false);
      // Answered by the idempotency lookup, not by a second accept.
      expect(attempts[1].upstreamStatus).toBe(200);
      expect(attempts[1].businessStatus).toBe('idempotent_replay');
      expect(attempts[1].reused).toBe(true);
      // Identical key on both attempts.
      expect(attempts[0].idempotencyKey).toBeTruthy();
      expect(attempts[0].idempotencyKey).toBe(attempts[1].idempotencyKey);
      expect(String(attempts[0].idempotencyKey)).toContain(KEY_PREFIX);

      // PixivFlow classified the second response as a replay, not a fresh accept.
      const duplicates = sim.deliveryEvents().filter((event) => event.event === 'delivery.duplicate');
      facts.deliveryDuplicates = duplicates;
      expect(duplicates).toHaveLength(1);
      expect(String((duplicates[0].detail as { reason?: unknown } | null)?.reason)).toBe(
        'idempotent_replay',
      );

      // The outbox reached its terminal state through the real worker.
      const outboxFinal = sim.outboxRows();
      facts.outboxFinal = outboxFinal;
      expect(outboxFinal[0].status).toBe('done');

      sim.finishSlot();
      facts.slotStatus = sim.slotStatus();
      facts.cellsFinal = sim.cells(sim.slotId);
      expect(sim.slotStatus()).toBe('success');
      expect(sim.cells(sim.slotId)[0].status).toBe('submitted');

      // ── 4. the retry must not have created a second review ──────────────────
      const reviews = await sim.reviews();
      facts.reviews = reviews.map((review) => ({ id: review.id, status: review.status }));
      expect(reviews).toHaveLength(1);

      // ── 5. publish exactly once ─────────────────────────────────────────────
      const approved = await sim.approve(reviews[0].id);
      const approveData = (approved.json.data ?? {}) as Record<string, unknown>;
      facts.approveData = approveData;
      expect(String(approveData.status ?? '')).toBe('published');
      expect(approveData.reused).toBe(false);

      const publishes = sim.publishesToChannel();
      facts.publishes = publishes;
      expect(publishes).toHaveLength(1);
      expect(String(publishes[0].method)).toBe('sendPhoto');
    } catch (error) {
      const dump = await sim.describe('lost ack', { slotId: sim.slotId }).catch(() => '(snapshot failed)');
      throw new Error(
        `${(error as Error).message}\n\n` +
          `facts: ${JSON.stringify(facts, null, 2)}\n\n${dump}`,
      );
    }
  });
});
