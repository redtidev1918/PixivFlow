/**
 * Typed error hierarchy for the Pixiv Client Kit.
 *
 * Callers classify failures structurally (instanceof + fields), never by
 * matching strings in error messages:
 *
 *   try {
 *     await pixiv.illustrations.get(123);
 *   } catch (e) {
 *     if (e instanceof PixivRateLimitError) await sleep(e.retryAfterMs);
 *     else if (e instanceof PixivNotFoundError) skip();
 *     else throw e;
 *   }
 *
 * Compatibility: every error exposes `statusCode` / `code` / `isRateLimit` /
 * `waitTime` getters, so host code written against the legacy PixivFlow
 * `NetworkError(message, url, cause, metadata)` shape keeps working.
 */

export interface PixivErrorDetails {
  /** HTTP status code, when the failure came from an HTTP response. */
  status?: number;
  /** Machine-readable code (e.g. 'rate_limited', 'timeout'). */
  code?: string;
  /** Whether the operation may succeed if retried later. */
  retryable?: boolean;
  /** Delay the caller should wait before retrying, when known (ms). */
  retryAfterMs?: number;
  /** Endpoint / absolute URL the request targeted (never contains secrets). */
  endpoint?: string;
  /** Original underlying error. */
  cause?: unknown;
}

export class PixivError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly endpoint?: string;
  override readonly cause?: unknown;

  constructor(message: string, details: PixivErrorDetails = {}) {
    super(message);
    this.name = 'PixivError';
    this.status = details.status;
    this.code = details.code;
    this.retryable = details.retryable ?? false;
    this.retryAfterMs = details.retryAfterMs;
    this.endpoint = details.endpoint;
    if (details.cause !== undefined) this.cause = details.cause;
    if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
  }

  // --- legacy PixivFlow compatibility accessors -----------------------------
  /** @deprecated use `status`. Kept so legacy `NetworkError` consumers compile. */
  get statusCode(): number | undefined {
    return this.status;
  }
  /** @deprecated use `endpoint`. */
  get url(): string | undefined {
    return this.endpoint;
  }
  /** @deprecated use `instanceof PixivRateLimitError`. */
  get isRateLimit(): boolean {
    return this instanceof PixivRateLimitError;
  }
  /** @deprecated use `retryAfterMs`. */
  get waitTime(): number | undefined {
    return this.retryAfterMs;
  }
}

/** Network-level failure (DNS, reset, proxy, timeout): no HTTP response. */
export class PixivNetworkError extends PixivError {
  constructor(message: string, details: PixivErrorDetails = {}) {
    super(message, { retryable: true, code: 'network_error', ...details });
    this.name = 'PixivNetworkError';
  }
}

/** Request timed out (our AbortController, not an HTTP response). */
export class PixivTimeoutError extends PixivNetworkError {
  constructor(message: string, details: PixivErrorDetails = {}) {
    super(message, { code: 'timeout', ...details });
    this.name = 'PixivTimeoutError';
  }
}

/** Non-2xx HTTP response base. */
export class PixivHttpError extends PixivError {
  /** Response body text, truncated (may be empty). */
  readonly body?: string;
  constructor(message: string, details: PixivErrorDetails & { body?: string } = {}) {
    super(message, { code: `http_${details.status ?? 'unknown'}`, ...details });
    this.name = 'PixivHttpError';
    this.body = details.body;
  }
}

/** 401: access token missing/expired and refresh did not recover it. */
export class PixivAuthenticationError extends PixivHttpError {
  constructor(message: string, details: PixivErrorDetails & { body?: string } = {}) {
    super(message, { status: 401, code: 'unauthorized', retryable: false, ...details });
    this.name = 'PixivAuthenticationError';
  }
}

/** 403: forbidden (private/deleted content, account restriction). */
export class PixivForbiddenError extends PixivHttpError {
  constructor(message: string, details: PixivErrorDetails & { body?: string } = {}) {
    super(message, { status: 403, code: 'forbidden', retryable: false, ...details });
    this.name = 'PixivForbiddenError';
  }
}

/** 404: endpoint or work does not exist. Never retried. */
export class PixivNotFoundError extends PixivHttpError {
  constructor(message: string, details: PixivErrorDetails & { body?: string } = {}) {
    super(message, { status: 404, code: 'not_found', retryable: false, ...details });
    this.name = 'PixivNotFoundError';
  }
}

/**
 * 429 / rate limited. `retryAfterMs` carries the gate cooldown. The shared
 * gate has ALREADY applied this cooldown by the time this is thrown, so the
 * durable caller (scheduler/outbox) should back off rather than retry tight.
 */
export class PixivRateLimitError extends PixivHttpError {
  constructor(message: string, details: PixivErrorDetails & { body?: string } = {}) {
    super(message, {
      status: 429,
      code: 'rate_limited',
      retryable: true,
      ...details,
    });
    this.name = 'PixivRateLimitError';
  }
}

/** 5xx server error. */
export class PixivServerError extends PixivHttpError {
  constructor(message: string, details: PixivErrorDetails & { body?: string } = {}) {
    super(message, { retryable: true, code: `http_${details.status ?? 500}`, ...details });
    this.name = 'PixivServerError';
  }
}

/**
 * Circuit breaker is OPEN: requests fail fast instead of queuing dozens of
 * tasks against a rate-limiting Pixiv. Retryable after `retryAfterMs`.
 */
export class PixivCircuitOpenError extends PixivError {
  constructor(message: string, details: PixivErrorDetails = {}) {
    super(message, { code: 'circuit_open', retryable: true, ...details });
    this.name = 'PixivCircuitOpenError';
  }
}

/** Caller-supplied AbortSignal aborted the operation. */
export class PixivAbortError extends PixivError {
  constructor(message = 'Operation aborted', details: PixivErrorDetails = {}) {
    super(message, { code: 'aborted', retryable: false, ...details });
    this.name = 'PixivAbortError';
  }
}

/** Generic API-level error (unexpected payload shape, empty body, ...). */
export class PixivApiError extends PixivError {
  constructor(message: string, details: PixivErrorDetails = {}) {
    super(message, { code: 'api_error', ...details });
    this.name = 'PixivApiError';
  }
}

/** True when the error originated from this kit (used by host adapters). */
export function isPixivError(error: unknown): error is PixivError {
  return error instanceof PixivError;
}
