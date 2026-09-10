/**
 * Run-scoped diagnostics for the business errors a batch execution hits.
 *
 * The control plane needs to tell a rate-limited run apart from a broken one: they
 * share an exit code but not a remedy. A batch runner has no daemon behind it, so
 * the only way that distinction survives is if this process records it and the
 * result file carries it back.
 *
 * Deliberately module-level and reset per run: the runner is a fresh process each
 * time, and a long-lived caller (tests, the scheduler) must not inherit counts.
 */

/** Stable categories the control plane understands. */
export type RunErrorCategory =
  | 'pixiv_rate_limit'
  | 'network_timeout'
  | 'download_failed'
  | 'provider_error'
  | 'internal_error';

export interface RunDiagnostics {
  categories: Partial<Record<RunErrorCategory, number>>;
  /** How many times a Pixiv 429 was observed. */
  rateLimitHits: number;
  /** The longest cooldown the server asked for, if it said. */
  maxRetryAfterMs: number | null;
  /** The category that best explains a failed run, if any. */
  dominantCategory: RunErrorCategory | null;
}

const empty = (): RunDiagnostics => ({
  categories: {},
  rateLimitHits: 0,
  maxRetryAfterMs: null,
  dominantCategory: null,
});

let state = empty();

/** Called at the start of a run so counts cannot leak between runs. */
export function resetRunDiagnostics(): void {
  state = empty();
}

function record(category: RunErrorCategory): void {
  state.categories[category] = (state.categories[category] ?? 0) + 1;
}

/**
 * Record one observed Pixiv rate limit.
 *
 * `waitMs` is the server's own hint when it provided one (Retry-After); the longest
 * hint seen during the run is what the report carries, because it is the one that
 * governs when this account may be used again.
 */
export function recordRateLimit(waitMs?: number): void {
  state.rateLimitHits += 1;
  if (typeof waitMs === 'number' && Number.isFinite(waitMs) && waitMs > 0) {
    state.maxRetryAfterMs = Math.max(state.maxRetryAfterMs ?? 0, waitMs);
  }
  record('pixiv_rate_limit');
}

/**
 * Classify a failure message into a category.
 *
 * Message matching is the fallback, not the primary mechanism: the Pixiv client
 * raises typed errors and the paths that see them call `recordRateLimit` directly.
 * This exists for the places where only a string survives, and it is intentionally
 * narrower than a generic "is this retryable" test — the point is to keep a rate
 * limit from being confused with a broken provider.
 */
export function classifyRunError(message: string): RunErrorCategory {
  if (/\b429\b|rate.?limit|too many requests|cooldown/i.test(message)) return 'pixiv_rate_limit';
  if (/timeout|timed out|abort|econnreset|econnrefused|enotfound|socket hang up/i.test(message)) {
    return 'network_timeout';
  }
  if (/download|file|write|disk|enospc/i.test(message)) return 'download_failed';
  return 'internal_error';
}

/** Record a failure the run actually hit, from its message. */
export function recordRunError(message: string): RunErrorCategory {
  const category = classifyRunError(message);
  if (category === 'pixiv_rate_limit') {
    state.rateLimitHits += 1;
    record(category);
    return category;
  }
  record(category);
  return category;
}

/** Record an explicit category (used where the caller already knows it). */
export function recordRunCategory(category: RunErrorCategory): void {
  if (category === 'pixiv_rate_limit') {
    state.rateLimitHits += 1;
  }
  record(category);
}

export function runDiagnostics(): RunDiagnostics {
  const rank: RunErrorCategory[] = [
    'pixiv_rate_limit',
    'network_timeout',
    'download_failed',
    'provider_error',
    'internal_error',
  ];
  // A rate limit outranks everything: it is the one category with a server-provided
  // remedy, and reporting it as "internal_error" would hide that.
  const dominant = rank.find((category) => (state.categories[category] ?? 0) > 0) ?? null;
  return {
    categories: { ...state.categories },
    rateLimitHits: state.rateLimitHits,
    maxRetryAfterMs: state.maxRetryAfterMs,
    dominantCategory: dominant,
  };
}
