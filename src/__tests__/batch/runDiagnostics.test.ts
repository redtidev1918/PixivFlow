import {
  classifyRunError,
  recordRateLimit,
  recordRunError,
  resetRunDiagnostics,
  runDiagnostics,
} from '../../batch/runDiagnostics';

/**
 * The control plane decides a retry delay from these, so misreporting them retries
 * a throttled account too early or leaves a broken provider on the same schedule.
 * The distinction matters because the exit code is identical in both cases.
 */
describe('run diagnostics', () => {
  beforeEach(() => resetRunDiagnostics());

  it('starts empty and resets between runs', () => {
    expect(runDiagnostics()).toEqual({
      categories: {},
      rateLimitHits: 0,
      maxRetryAfterMs: null,
      dominantCategory: null,
    });
    recordRateLimit(1000);
    resetRunDiagnostics();
    expect(runDiagnostics().rateLimitHits).toBe(0);
  });

  it('keeps the longest cooldown the server asked for', () => {
    recordRateLimit(5_000);
    recordRateLimit(120_000);
    recordRateLimit(30_000);

    const diagnostics = runDiagnostics();
    expect(diagnostics.rateLimitHits).toBe(3);
    expect(diagnostics.maxRetryAfterMs).toBe(120_000);
  });

  it('reports no cooldown when the server never gave one', () => {
    recordRateLimit();
    expect(runDiagnostics().maxRetryAfterMs).toBeNull();
  });

  it('lets a rate limit outrank other failures when both happened', () => {
    recordRunError('download failed: ENOSPC');
    recordRateLimit(2_000);
    recordRunError('timeout after 30000ms');

    const diagnostics = runDiagnostics();
    // A rate limit is the only category with a server-provided remedy, so a run
    // that hit one must not be reported as an internal error.
    expect(diagnostics.dominantCategory).toBe('pixiv_rate_limit');
    expect(diagnostics.categories.network_timeout).toBe(1);
    expect(diagnostics.categories.download_failed).toBe(1);
  });

  it('classifies messages without confusing a throttle for a broken provider', () => {
    expect(classifyRunError('Pixiv 429 Too Many Requests')).toBe('pixiv_rate_limit');
    expect(classifyRunError('rate limit cooldown active')).toBe('pixiv_rate_limit');
    expect(classifyRunError('socket hang up')).toBe('network_timeout');
    expect(classifyRunError('failed to write file: ENOSPC')).toBe('download_failed');
    expect(classifyRunError('unexpected state')).toBe('internal_error');
  });

  it('counts a rate limit found by message as a hit', () => {
    recordRunError('HTTP 429 from pixiv');
    expect(runDiagnostics().rateLimitHits).toBe(1);
  });
});
