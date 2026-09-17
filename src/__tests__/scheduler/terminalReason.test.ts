/**
 * Normalized terminal reason tests (§terminal-reason, §tests).
 *
 * The contract: a terminal failure preserves ONE stable reason code plus a
 * business-language message, and recovery exhaustion is never itself the root
 * cause. Raw error text (paths, SQL, stack traces, tokens) must never be what
 * an operator reads.
 */
import {
  TERMINAL_REASON_MESSAGES,
  TargetOutcome,
  terminalReasonFor,
} from '../../scheduler/TargetOutcome';

const SCAN = (skipped: Array<'duplicate' | 'deleted' | 'filtered' | 'access_denied'>) => ({
  bound: skipped.length,
  attempted: skipped.length,
  skipped: skipped.map((code, index) => ({ code, workId: String(index), reason: 'x' })),
  outages: [] as never[],
});

describe('terminalReasonFor', () => {
  it('exposes metadata_failed and telepost_rejected in the taxonomy', () => {
    expect(TERMINAL_REASON_MESSAGES).toHaveProperty('metadata_failed');
    expect(TERMINAL_REASON_MESSAGES).toHaveProperty('telepost_rejected');
  });

  it('has no terminal reason for successful or pending outcomes', () => {
    expect(terminalReasonFor({ kind: 'submitted', workId: '1', workType: 'illustration' })).toBeNull();
    expect(terminalReasonFor({ kind: 'stored', workId: '1', workType: 'novel' })).toBeNull();
    expect(
      terminalReasonFor({ kind: 'delivery_pending', workId: '1', workType: 'novel', deliveryId: 'd' })
    ).toBeNull();
  });

  it('reports duplicate_exhausted when every scanned candidate was already submitted', () => {
    const outcome: TargetOutcome = {
      kind: 'no_candidate',
      reason: 'no eligible candidate',
      scan: SCAN(['duplicate', 'duplicate', 'duplicate']),
    };
    expect(terminalReasonFor(outcome)).toEqual({
      code: 'duplicate_exhausted',
      message: '候选作品均已投稿过',
    });
  });

  it('reports no_candidate when the scan saw nothing at all', () => {
    const outcome: TargetOutcome = { kind: 'no_candidate', reason: 'empty pool', scan: SCAN([]) };
    expect(terminalReasonFor(outcome)?.code).toBe('no_candidate');
  });

  it('reports filter_exhausted when candidates existed but none passed the filters', () => {
    const outcome: TargetOutcome = {
      kind: 'no_candidate',
      reason: 'filtered',
      scan: SCAN(['filtered', 'deleted', 'access_denied']),
    };
    expect(terminalReasonFor(outcome)?.code).toBe('filter_exhausted');
  });

  it('reports duplicate_exhausted for a terminal duplicate cell', () => {
    const outcome: TargetOutcome = { kind: 'duplicate', workId: '99', reason: 'historical duplicate' };
    expect(terminalReasonFor(outcome)?.code).toBe('duplicate_exhausted');
  });

  it.each([
    ['download timeout while fetching the image', 'download_timeout'],
    ['Download timeout for https://i.pximg.net/x.jpg', 'download_timeout'],
    ['download failed while fetching controlled fixture', 'download_failed'],
    ['execution timeout after 1800000ms', 'execution_timeout'],
    ['429 Too Many Requests: rate limit exceeded', 'rate_limited'],
    ['401 unauthorized: invalid refresh token', 'auth_failed'],
    ['503 Service Unavailable from Pixiv', 'remote_http_error'],
    ['Telegram sendMessage failed: chat not found', 'telegram_failed'],
    ['delivery rejected by the submission endpoint', 'delivery_failed'],
    ['ECONNRESET while reading response', 'network_error'],
    ['missing configuration: delivery target not configured', 'configuration_error'],
    ['something entirely unexpected happened', 'internal_error'],
    ['failed to parse metadata for work 42: unexpected JSON structure', 'metadata_failed'],
    ['metadata gather failed for work 1234: no image urls', 'metadata_failed'],
    ['TelePost rejected the work: invalid payload (HTTP 400)', 'telepost_rejected'],
    ['TelePost returned 403: submission rejected', 'telepost_rejected'],
  ])('classifies %s as %s', (error, expected) => {
    const outcome: TargetOutcome = { kind: 'failed', retryable: false, error };
    expect(terminalReasonFor(outcome)?.code).toBe(expected);
  });

  it('prefers the scan-level job outage over message heuristics', () => {
    const outcome: TargetOutcome = {
      kind: 'failed',
      retryable: false,
      error: 'unclassifiable',
      scan: {
        bound: 1,
        attempted: 1,
        skipped: [],
        outages: ['pixiv_auth_failure'],
      },
    };
    expect(terminalReasonFor(outcome)?.code).toBe('auth_failed');
  });

  it('never leaks raw error internals into the user-facing message', () => {
    const outcome: TargetOutcome = {
      kind: 'failed',
      retryable: false,
      error: 'SQLITE_ERROR: no such table: pending_reviews at /app/data/pixivflow.db',
    };
    const reason = terminalReasonFor(outcome)!;
    expect(reason.message).toBe(TERMINAL_REASON_MESSAGES.internal_error);
    expect(reason.message).not.toMatch(/SQLITE|pending_reviews|\/app\/data/);
  });
});
