/**
 * Deliver one `$defs/Event` to the `callback_url` an accepted `$defs/Task`
 * declared.
 *
 * At-least-once, exactly like every other delivery in this repo: the caller is
 * the EXISTING `OutboxWorker`, which owns retry, backoff and dead-lettering. So
 * this module performs exactly ONE HTTP POST and reports the outcome as a thrown
 * error whose `status` lets `classifyError` decide whether the mistake was
 * retryable (5xx / 429 -> retry, 4xx -> dead-letter). Transport errors are
 * rethrown untouched, which keeps them retryable by construction.
 *
 * A separate delivery path is deliberately NOT introduced: the callback rides
 * the same outbox, the same `idx_outbox_key` idempotency index and the same
 * `delivery_events` audit log as outcome delivery.
 */

export interface EventCallbackPayload {
  /** The `$defs/Event`. The POST body is exactly this object. */
  event: unknown;
  job_id: string;
  /**
   * Correlation hint read by `OutboxWorker.contextCorrelation` so the outbox
   * audit rows for this callback are linked to the job's slot.
   */
  context?: { slotId?: string };
}

export const EVENT_CALLBACK_TIMEOUT_MS = 30_000;

/**
 * A callback endpoint answered with a non-2xx status. `status` is carried as an
 * own enumerable property because `Error.message` is not a machine-readable
 * contract — the outbox hands it to `classifyError(error, status)`.
 */
export class EventCallbackError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'EventCallbackError';
    this.status = status;
  }
}

export class EventCallbackDelivery {
  private readonly dispatcher?: unknown;

  constructor(
    private readonly proxyUrl?: string,
    private readonly timeoutMs: number = EVENT_CALLBACK_TIMEOUT_MS
  ) {
    if (proxyUrl) {
      // Same egress path (and same undici ProxyAgent wiring) as every other
      // outbound delivery.
      const { ProxyAgent } = require('undici');
      this.dispatcher = new ProxyAgent(proxyUrl);
    }
  }

  /**
   * One POST of one event. Resolves with the HTTP status on success; throws
   * `EventCallbackError` on a non-2xx status and the raw transport error when
   * the request never completed.
   */
  async deliver(request: {
    url: string;
    payload: EventCallbackPayload;
    idempotencyKey: string;
  }): Promise<number> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    const options: Record<string, unknown> = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PixivFlow-Delivery': 'job-event',
        // The consumer deduplicates on the event_id; the outbox deduplicates on
        // its own key. Sending both is deliberate: either side can converge.
        'X-Idempotency-Key': request.idempotencyKey,
      },
      body: JSON.stringify(request.payload.event),
      signal: controller.signal,
    };
    if (this.dispatcher) options.dispatcher = this.dispatcher;
    try {
      const response = await fetch(request.url, options as Parameters<typeof fetch>[1]);
      // Drain (and bound) the body so the socket can be reused/closed.
      await response.text().catch(() => '');
      if (response.status >= 200 && response.status < 300) return response.status;
      // 409 means the consumer already recorded this event_id — idempotent
      // convergence, not a failure.
      if (response.status === 409) return response.status;
      throw new EventCallbackError(
        `job event callback answered HTTP ${response.status}`,
        response.status
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
