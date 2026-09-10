/**
 * Tiny pure error classification for delivery attempts.
 * Maps a thrown error / HTTP status to a stable audit category.
 */
export type DeliveryErrorClass =
  | 'dependency_not_ready'
  | 'network_timeout'
  | 'rate_limited'
  | 'remote_5xx'
  | 'remote_4xx'
  | 'invalid_payload'
  | 'telegram_send_failed'
  | 'duplicate'
  | 'internal_error';

export interface ErrorClassification {
  errorClass: DeliveryErrorClass;
  retryable: boolean;
}

/** Classify one failed delivery attempt from its thrown error and/or HTTP status. */
export function classifyError(error: unknown, status?: number): ErrorClassification {
  const message = error instanceof Error ? error.message : String(error ?? '');

  // Explicit HTTP status wins when present.
  if (status === 429) return { errorClass: 'rate_limited', retryable: true };
  if (typeof status === 'number' && status >= 500) return { errorClass: 'remote_5xx', retryable: true };
  if (status === 409) return { errorClass: 'duplicate', retryable: false };
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return { errorClass: 'remote_4xx', retryable: false };
  }

  if (/timeout|timed out|abort|aborted/i.test(message) || (error as { name?: string })?.name === 'AbortError') {
    return { errorClass: 'network_timeout', retryable: true };
  }
  if (/429|rate.?limit/i.test(message)) return { errorClass: 'rate_limited', retryable: true };
  if (/duplicate|idempotent|replay|409/i.test(message)) return { errorClass: 'duplicate', retryable: false };
  if (/invalid|validation|bad request|payload|http\s*4\d\d\b/i.test(message)) {
    return { errorClass: 'invalid_payload', retryable: false };
  }
  if (/telegram/i.test(message)) return { errorClass: 'telegram_send_failed', retryable: false };
  if (/not ready|refused|unavailable|connection|network|fetch|econn/i.test(message)) {
    return { errorClass: 'network_timeout', retryable: true };
  }
  return { errorClass: 'internal_error', retryable: true };
}
