/**
 * Strongly-typed business result of running ONE target in a (scheduled) slot.
 *
 * This replaces the old implicit protocol "handler.handle() did not throw =>
 * submitted". Undefined / a 2xx HTTP response / a caught-and-swallowed error
 * must NEVER be inferred as a successful submission. Every target produces one
 * of these explicit outcomes; the Slot ledger maps it to a cell transition.
 *
 * The vocabulary has TWO levels, and conflating them is what let a duplicate
 * candidate end a scheduled slot as "successful":
 *
 *  - CANDIDATE level (`CandidateSkip`): this ONE candidate work was unusable —
 *    already delivered, deleted, private, wrong media, wrong language. A
 *    candidate problem is never a job verdict: the scan advances to the next
 *    candidate.
 *  - TARGET level (`TargetOutcome`, below): the verdict for the whole logical
 *    item after its bounded candidate scan, including the scan bookkeeping so
 *    "completed with nothing done" is impossible to report silently.
 */
export type WorkType = 'illustration' | 'novel';

/**
 * Why ONE candidate work was skipped without producing a business result.
 *
 * Codes are deliberately outcome-shaped, not error-shaped: they say what the
 * run should DO (try the next candidate), not which exception was raised.
 */
export type CandidateSkipCode =
  /** Already delivered / already pending review for this target, or a lost
   *  idempotency race against a concurrent worker. Try the next candidate. */
  | 'duplicate'
  /** Gone: 404, deleted work, removed account. Permanent for this candidate. */
  | 'deleted'
  /** Private / R-18 without permission / 403 on THIS work. */
  | 'access_denied'
  /** Ugoira or novel form this build cannot process. */
  | 'unsupported_media'
  /** Missing or malformed metadata: no id, no pages, no image urls. */
  | 'invalid_metadata'
  /**
   * The attempt failed for a reason that is NOT a fact about the work: timeout,
   * connection reset, rate limit, 5xx, or an unclassifiable error. `retryable`
   * is set, which means the candidate is handed back to the existing
   * retry/backoff instead of being silently skipped — and a scan in which EVERY
   * attempted candidate was transient is a JOB failure, not an empty candidate
   * list.
   */
  | 'unavailable'
  /**
   * Not usable for THIS run by the run's own rules: full-text language filter,
   * over maxPageCount, AI-metadata check, or a candidate the downloader
   * deliberately declined. Move on to the next candidate.
   */
  | 'filtered';

export interface CandidateSkip {
  code: CandidateSkipCode;
  workId: string;
  reason: string;
  /**
   * True when the cause is transient infrastructure rather than this work.
   * One such candidate still means "try the next"; EVERY attempted candidate
   * being retryable means the infrastructure — not the candidate list — is the
   * problem, and the target must fail/retry instead of reporting "no eligible
   * candidate".
   */
  retryable?: boolean;
}

/**
 * Infrastructure failure scoped to the WHOLE job, never to one candidate. These
 * must abort/fail/retry the job; they must never be swallowed as "skip and try
 * the next candidate" (that is the failure mode that burned scheduled slots).
 */
export type JobLevelOutage =
  | 'database_unavailable'
  | 'pixiv_auth_failure'
  | 'delivery_unavailable'
  | 'network_outage';

/**
 * What one failed candidate ATTEMPT means. `candidate` => the scan advances.
 * `job` => the scan must not be allowed to degrade the run into an empty
 * candidate list.
 */
export type CandidateFailure =
  | { scope: 'candidate'; skip: CandidateSkip }
  | { scope: 'job'; outage: JobLevelOutage; error: string };

/** What happened to ONE candidate work during a target's bounded scan. */
export type CandidateAttempt =
  /** The candidate produced the target's business result (or a delivery intent). */
  | { kind: 'selected'; workId: string; workType: WorkType }
  /** The candidate was unusable; the scan continues with the next one. */
  | { kind: 'skipped'; skip: CandidateSkip };

/**
 * Bookkeeping for a target's bounded candidate scan. Attached to the terminal
 * target outcome so the run can state exactly one of:
 *
 *   "submitted candidate X after skipping Y candidate(s)"
 *   "no eligible candidate found after scanning N"
 *
 * `bound` is the configured cap (never exceeded), `attempted` the real count.
 */
export interface CandidateScanSummary {
  /**
   * Cap on candidates this scan was allowed to attempt: the effective window,
   * never above the configured `candidateScanLimit` unless the target's own
   * `limit` is larger (a multi-work target must be able to fill its limit).
   */
  bound: number;
  /** Candidates actually attempted. Always <= bound. */
  attempted: number;
  /**
   * Candidates skipped before the scan ended, in the order they were skipped —
   * strictly candidate order whenever the scan is serial, which is always the
   * case for a single-work cell.
   */
  skipped: CandidateSkip[];
  /** Job-level outages observed while scanning (never a candidate verdict). */
  outages: JobLevelOutage[];
}

/**
 * A scan that attempted nothing. The real pipeline always reports its own scan;
 * this is for callers/tests that have no candidate-level information, so they
 * cannot fabricate a verdict they did not observe.
 */
export function emptyCandidateScan(): CandidateScanSummary {
  return { bound: 0, attempted: 0, skipped: [], outages: [] };
}

export type TargetOutcome =
  | {
      kind: 'submitted';
      workId: string;
      workType: WorkType;
      /** Durable delivery row that recorded the downstream ACK. */
      deliveryId?: string;
      /** Which candidates were skipped to reach this one. */
      scan?: CandidateScanSummary;
    }
  /**
   * The work was processed locally but there is no downstream delivery target
   * (persistent storageMode / pure-download config). For a scheduled slot this
   * is a business success for that target, but it is NEVER confused with a
   * confirmed remote submission.
   */
  | { kind: 'stored'; workId: string; workType: WorkType; scan?: CandidateScanSummary }
  /**
   * A delivery intent + outbox item were created durably, but the downstream
   * ACK has not been confirmed yet. The OutboxWorker drives this to
   * 'submitted'; a crash/restart resumes it. delivery_pending != submitted.
   */
  | {
      kind: 'delivery_pending';
      workId: string;
      workType: WorkType;
      deliveryId: string;
      scan?: CandidateScanSummary;
    }
  /**
   * The bounded scan found no ELIGIBLE candidate: every attempted candidate was
   * skipped for a candidate-level reason (duplicate / deleted / denied / ...).
   * A clean no-op, not a failure and not a retry loop.
   */
  | { kind: 'no_candidate'; reason: string; scan?: CandidateScanSummary }
  /**
   * Downstream proved this work was already delivered by a DIFFERENT intent
   * (historical drift). This is a terminal business duplicate, not a new
   * submission. Produced only by the explicit reconciliation path
   * (`settleDeliveryTerminal`) or by a single-work cell RESUME whose locked work
   * turns out to be already delivered — NEVER as the verdict of a candidate scan.
   */
  | { kind: 'duplicate'; workId: string; reason: string; scan?: CandidateScanSummary }
  /** The target failed. retryable=true => a later trigger/outbox may resume. */
  | { kind: 'failed'; retryable: boolean; error: string; scan?: CandidateScanSummary };

/** Terminal outcomes settle the cell; others leave it recoverable. */
export function isTerminalOutcome(outcome: TargetOutcome): boolean {
  return (
    outcome.kind === 'submitted' ||
    outcome.kind === 'stored' ||
    outcome.kind === 'no_candidate' ||
    outcome.kind === 'duplicate' ||
    (outcome.kind === 'failed' && !outcome.retryable)
  );
}

/** True when the scan ended on a candidate it may actually submit. */
export function isSelectedAttempt(attempt: CandidateAttempt | void): attempt is {
  kind: 'selected';
  workId: string;
  workType: WorkType;
} {
  return attempt?.kind === 'selected';
}

/**
 * True when this candidate failure means "move on to the next candidate"
 * WITHOUT retrying this one — the cause is a fact about the work (deleted,
 * private, wrong media/format, filtered by rules, already submitted).
 *
 * Transient infrastructure failures return FALSE on purpose: the existing
 * retry/backoff semantics own those, because retrying the same work is what
 * this repo does, and churning through a whole ranking page while the network
 * is down would be worse than failing the target once.
 */
export function skipCandidateWithoutRetry(skip: CandidateSkip): boolean {
  return skip.retryable !== true;
}

/**
 * The explicit, human-readable verdict of a target. Requirement: a run must
 * report one of "submitted candidate X after skipping Y candidates" or "no
 * eligible candidate found after scanning N" — never a bare "completed".
 */
export function outcomeSummary(outcome: TargetOutcome): string {
  switch (outcome.kind) {
    case 'submitted':
    case 'stored':
      return outcome.scan
        ? `submitted candidate ${outcome.workId} (${outcome.workType}) after skipping ` +
            `${outcome.scan.skipped.length} candidate(s)${skipDetail(outcome.scan)}`
        : `${outcome.kind} ${outcome.workId}`;
    case 'delivery_pending':
      return outcome.scan
        ? `submitted candidate ${outcome.workId} (${outcome.workType}) for review after skipping ` +
            `${outcome.scan.skipped.length} candidate(s)${skipDetail(outcome.scan)}`
        : `delivery_pending ${outcome.workId}`;
    case 'no_candidate':
      return outcome.scan
        ? noEligibleCandidateText(outcome.scan)
        : `no_candidate: ${outcome.reason}`;
    case 'duplicate':
      return `duplicate: ${outcome.reason}`;
    case 'failed':
      return `failed(${outcome.retryable ? 'retryable' : 'permanent'}): ${outcome.error}`;
  }
}

/**
 * `no eligible candidate found after scanning N` (+ what was skipped).
 *
 * Candidates dropped before any download attempt (already submitted / already
 * in history) are counted separately from the ones actually attempted, because
 * "scanned 0" with three duplicates is a very different statement from
 * "scanned 3, all unusable" — and the operator needs to be able to tell them
 * apart.
 */
export function noEligibleCandidateText(scan: CandidateScanSummary): string {
  const scanned = scan.attempted;
  if (scan.skipped.length === 0) {
    return `no eligible candidate found after scanning ${scanned}`;
  }
  const codes = [...new Set(scan.skipped.map((s) => s.code))].join(', ');
  const prefiltered = Math.max(0, scan.skipped.length - scanned);
  const detail =
    prefiltered > 0
      ? ` (bound ${scan.bound}); all ${scan.skipped.length} candidate(s) unusable ` +
        `[${prefiltered} filtered before download, ${scanned} attempted]: ${codes}`
      : ` (bound ${scan.bound}); all ${scan.skipped.length} attempted candidate(s) skipped: ${codes}`;
  return `no eligible candidate found after scanning ${scanned}${detail}${skipDetail(scan)}`;
}

function skipDetail(scan: CandidateScanSummary): string {
  if (scan.skipped.length === 0) return '';
  const sample = scan.skipped
    .slice(0, 3)
    .map((s) => `${s.code}(${s.workId})`)
    .join(', ');
  return ` [${sample}${scan.skipped.length > 3 ? `, +${scan.skipped.length - 3} more` : ''}]`;
}

/**
 * True when the scan saw a transient infrastructure failure, or ANY attempted
 * candidate failed transiently. Such a scan says "the network/API is flaky",
 * NOT "no eligible candidate", so the caller must fail/retry the target instead
 * of reporting a clean empty scan.
 */
export function hasTransientFailure(scan: CandidateScanSummary): boolean {
  if (scan.outages.length > 0) return true;
  return scan.skipped.some((skip) => skip.retryable === true);
}

/**
 * Fold two scans of the same logical target into one, so a multi-page or
 * lookback scan reports the whole picture rather than only its last page.
 * `bound` is the sum of the windows actually offered (each page is bounded
 * independently), which keeps `attempted <= bound` true.
 */
export function mergeScanSummaries(
  first: CandidateScanSummary | null,
  second: CandidateScanSummary
): CandidateScanSummary {
  if (!first) return second;
  return {
    bound: first.bound + second.bound,
    attempted: first.attempted + second.attempted,
    skipped: [...first.skipped, ...second.skipped],
    outages: [...new Set([...first.outages, ...second.outages])],
  };
}

const SQLITE_OUTAGE = /sqlite|database (?:is )?locked|unable to open database|no such table|disk i\/o error/i;
/** A delivery-provider OUTAGE — not a per-message rejection such as a too-long caption. */
const DELIVERY_OUTAGE =
  /(?:telegram|delivery (?:target|provider))[^.]{0,80}\b(?:unavailable|unreachable|down|not configured|timed? ?out|econn\w*|etimedout|enotfound|401|403|50[234])\b|api\.telegram\.org[^.]*\b(?:econn\w*|etimedout|enotfound|50[234])\b/i;
const AUTH_OUTAGE = /\b(401|unauthorized|invalid_grant|invalid refresh token|authentication failed)\b/i;
const NETWORK_OUTAGE =
  /econnrefused|econnreset|enotfound|etimedout|ehostunreach|enetunreach|socket hang up|network is unreachable|getaddrinfo/i;
const RATE_LIMIT = /\b429\b|rate limit/i;

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown; statusCode?: unknown })?.status ??
    (error as { statusCode?: unknown })?.statusCode;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Decide what a failed candidate ATTEMPT means.
 *
 * This is the boundary the previous design got wrong: a duplicate was treated
 * as a completed job. The order below is what makes the distinction real —
 * a dead database, a dead token, a dead delivery provider or a dead network is
 * a JOB problem and is classified as such before any candidate-level pattern
 * can claim it.
 */
export function classifyCandidateFailure(error: unknown, workId: string): CandidateFailure {
  const message = messageOf(error);
  const status = statusOf(error);
  const name = error instanceof Error ? error.name : '';
  const code = (error as { code?: unknown })?.code;
  const codeText = typeof code === 'string' ? code : '';

  // --- Job-level first: these must never shrink to "empty candidate list" ---
  if (name === 'DatabaseError' || codeText.startsWith('SQLITE_') || SQLITE_OUTAGE.test(message)) {
    return { scope: 'job', outage: 'database_unavailable', error: message };
  }
  if (name === 'AuthenticationError' || status === 401 || AUTH_OUTAGE.test(message)) {
    return { scope: 'job', outage: 'pixiv_auth_failure', error: message };
  }
  // The delivery provider being unreachable says nothing about the candidate:
  // every candidate would "fail" identically, so this must never be counted as
  // an empty candidate list.
  if (DELIVERY_OUTAGE.test(message) && !/already delivered|already published|duplicate/i.test(message)) {
    return { scope: 'job', outage: 'delivery_unavailable', error: message };
  }
  if (status === 502 || status === 503 || status === 504) {
    // The remote provider itself is down, not this work.
    return { scope: 'job', outage: 'network_outage', error: message };
  }
  if (NETWORK_OUTAGE.test(message)) {
    return {
      scope: 'candidate',
      skip: { code: 'unavailable', workId, reason: message, retryable: true },
    };
  }

  // --- Candidate-level: this ONE work is unusable, try the next one ---------
  if (/already delivered|already processed|already published|idempotent_replay/i.test(message)) {
    return {
      scope: 'candidate',
      skip: { code: 'duplicate', workId, reason: message },
    };
  }
  if (name === 'PixivNotFoundError' || status === 404 || /\b404\b|not found|deleted/i.test(message)) {
    return { scope: 'candidate', skip: { code: 'deleted', workId, reason: message } };
  }
  if (name === 'PixivRateLimitError' || RATE_LIMIT.test(message)) {
    return {
      scope: 'candidate',
      skip: { code: 'unavailable', workId, reason: message, retryable: true },
    };
  }
  if (status === 403 || /forbidden|private|access denied|permission/i.test(message)) {
    return { scope: 'candidate', skip: { code: 'access_denied', workId, reason: message } };
  }
  if (/ugoira|unsupported (?:media|type|format)|cannot (?:process|handle)/i.test(message)) {
    return { scope: 'candidate', skip: { code: 'unsupported_media', workId, reason: message } };
  }
  if (/language filter|filtered out|excluded (?:by|from)/i.test(message)) {
    return { scope: 'candidate', skip: { code: 'filtered', workId, reason: message } };
  }
  if (/invalid (?:metadata|id|illustId|novelId)|missing (?:metadata|page|image)|no files produced/i.test(message)) {
    return { scope: 'candidate', skip: { code: 'invalid_metadata', workId, reason: message } };
  }

  // Unclassifiable: treat as a transient candidate problem (retryable) so an
  // all-unknown scan fails the job rather than silently reporting an empty scan.
  return {
    scope: 'candidate',
    skip: { code: 'unavailable', workId, reason: message, retryable: true },
  };
}

/** Hard job-level outage for a directly-thrown error, or null. */
export function classifyJobLevelOutage(error: unknown): JobLevelOutage | null {
  const failure = classifyCandidateFailure(error, '');
  return failure.scope === 'job' ? failure.outage : null;
}

/**
 * Normalized terminal failure taxonomy (§terminal-reason).
 *
 * These codes are what operators actually see: the FIRST-LEVEL cause of a
 * terminal cell. Recovery exhaustion is an execution state, never a root
 * cause — a cell that exhausted its fallback stages because every candidate
 * was a duplicate reports `duplicate_exhausted`, not `recovery_exhausted`.
 * Queue waiting is not a terminal reason at all.
 *
 * Codes are kept deliberately small (no giant taxonomy): each maps to one
 * real failure path in this codebase.
 */
export type TerminalReasonCode =
  /** The candidate scan was empty — nothing was found in the day's ranked pool. */
  | 'no_candidate'
  /** Every candidate the scan saw was already delivered/pending for this target. */
  | 'duplicate_exhausted'
  /** Candidates existed but none passed the target's own filters. */
  | 'filter_exhausted'
  | 'download_timeout'
  | 'download_failed'
  | 'metadata_failed'
  | 'rate_limited'
  | 'auth_failed'
  | 'remote_http_error'
  | 'delivery_failed'
  | 'telepost_rejected'
  | 'telegram_failed'
  | 'network_error'
  | 'execution_timeout'
  | 'configuration_error'
  | 'internal_error';

export interface TerminalReason {
  code: TerminalReasonCode;
  /** Business-language message an operator/reviewer reads directly. */
  message: string;
}

/** Operator-facing recovery semantics derived from the stable reason code.
 *
 * These fields are deliberately derived instead of persisted as a second
 * failure record.  The durable SSOT remains the cell's terminal reason code;
 * wording and policy can evolve without rewriting historical slot rows.
 */
export interface OperationalReason extends TerminalReason {
  stage: 'acquisition' | 'download' | 'delivery' | 'execution' | 'configuration';
  /** A later/manual attempt may succeed; this does not mean auto-retry is pending. */
  retryable: boolean;
  operatorHint: string;
}

const OPERATIONAL_REASON_POLICY: Record<TerminalReasonCode, Omit<OperationalReason, 'code' | 'message'>> = {
  no_candidate: { stage: 'acquisition', retryable: true, operatorHint: '可等待下次任务，或使用“放宽条件重试”。' },
  duplicate_exhausted: { stage: 'acquisition', retryable: true, operatorHint: '候选均已处理，可等待新作品或放宽条件重试。' },
  filter_exhausted: { stage: 'acquisition', retryable: true, operatorHint: '检查筛选条件，或使用“放宽条件重试”。' },
  download_timeout: { stage: 'download', retryable: true, operatorHint: '可稍后重试；若持续发生，请检查 Pixiv 连接。' },
  download_failed: { stage: 'download', retryable: true, operatorHint: '可稍后重试；若持续发生，请检查网络与存储空间。' },
  metadata_failed: { stage: 'acquisition', retryable: true, operatorHint: '可稍后重试；若只影响单个作品，请检查作品是否已删除或转为私密。' },
  rate_limited: { stage: 'acquisition', retryable: true, operatorHint: '等待限流窗口结束后再重试。' },
  auth_failed: { stage: 'acquisition', retryable: false, operatorHint: '检查并刷新对应 Pixiv 账号的认证状态。' },
  remote_http_error: { stage: 'acquisition', retryable: true, operatorHint: '可稍后重试；若持续发生，请检查 Pixiv 服务状态。' },
  delivery_failed: { stage: 'delivery', retryable: true, operatorHint: '检查 TelePost 可达性与投稿接口状态后重试。' },
  telepost_rejected: { stage: 'delivery', retryable: false, operatorHint: '检查投稿内容和 TelePost 接口契约。' },
  telegram_failed: { stage: 'delivery', retryable: true, operatorHint: '检查 Telegram 可达性与 Bot 权限后重试。' },
  network_error: { stage: 'execution', retryable: true, operatorHint: '检查执行端网络；恢复后可重试。' },
  execution_timeout: { stage: 'execution', retryable: true, operatorHint: '检查执行耗时和资源使用后重试。' },
  configuration_error: { stage: 'configuration', retryable: false, operatorHint: '修正配置并完成校验后再重试。' },
  internal_error: { stage: 'execution', retryable: false, operatorHint: '查看对应执行记录；若重复发生，请提交诊断信息。' },
};

export function operationalReasonForCode(code: string, message?: string | null): OperationalReason | null {
  if (!(code in OPERATIONAL_REASON_POLICY)) return null;
  const knownCode = code as TerminalReasonCode;
  return {
    code: knownCode,
    message: message?.trim() || TERMINAL_REASON_MESSAGES[knownCode],
    ...OPERATIONAL_REASON_POLICY[knownCode],
  };
}

/** User-facing business messages — never stack traces, paths, SQL or tokens. */
export const TERMINAL_REASON_MESSAGES: Record<TerminalReasonCode, string> = {
  no_candidate: '没有找到合适的新作品',
  duplicate_exhausted: '候选作品均已投稿过',
  filter_exhausted: '没有符合筛选条件的新作品',
  download_timeout: '图片下载超时',
  download_failed: '图片下载失败',
  metadata_failed: '作品信息获取失败',
  rate_limited: 'Pixiv 请求频率受限',
  auth_failed: 'Pixiv 登录已失效，需要重新登录',
  remote_http_error: 'Pixiv 服务器返回错误',
  delivery_failed: '投稿投递失败',
  telepost_rejected: '投稿被接收端拒绝',
  telegram_failed: 'Telegram 发送失败',
  network_error: '网络异常',
  execution_timeout: '执行超时',
  configuration_error: '配置错误',
  internal_error: '内部错误',
};

/**
 * Map a typed terminal TargetOutcome onto the normalized reason. Returns null
 * for non-terminal outcomes (they have no terminal reason yet).
 */
export function terminalReasonFor(outcome: TargetOutcome): TerminalReason | null {
  switch (outcome.kind) {
    case 'submitted':
    case 'stored':
    case 'delivery_pending':
      return null;
    case 'no_candidate':
      return reasonForNoCandidate(outcome);
    case 'duplicate':
      return {
        code: 'duplicate_exhausted',
        message: TERMINAL_REASON_MESSAGES.duplicate_exhausted,
      };
    case 'failed':
      return classifyFailedReason(outcome.error, outcome.scan);
  }
}

/**
 * Root cause for a `no_candidate` target, read from the scan's skip codes
 * rather than from exhaustion bookkeeping: all duplicates ⇒
 * `duplicate_exhausted`; otherwise the candidates were present but unusable
 * (filter/deleted/denied/wrong media) ⇒ `filter_exhausted`; a scan that saw
 * nothing at all ⇒ `no_candidate`.
 */
function reasonForNoCandidate(outcome: Extract<TargetOutcome, { kind: 'no_candidate' }>): TerminalReason {
  const skipped = outcome.scan?.skipped ?? [];
  if (skipped.length > 0) {
    const duplicates = skipped.filter((s) => s.code === 'duplicate').length;
    if (duplicates === skipped.length) {
      return { code: 'duplicate_exhausted', message: TERMINAL_REASON_MESSAGES.duplicate_exhausted };
    }
    if (duplicates >= skipped.length / 2 || skipped.every((s) => s.code !== 'unavailable')) {
      // Predominantly duplicates, or every skip was a hard work-level verdict:
      // the pool contained works but none were usable for this target.
      return { code: 'filter_exhausted', message: TERMINAL_REASON_MESSAGES.filter_exhausted };
    }
  }
  return { code: 'no_candidate', message: TERMINAL_REASON_MESSAGES.no_candidate };
}

/**
 * Classify a terminal `failed` reason from the error text + scan bookkeeping.
 * Job-level outages from the scan win first (they describe the whole run), then
 * message-shape heuristics; anything unclassifiable becomes `internal_error`
 * rather than leaking raw error text to the review group.
 */
function classifyFailedReason(message: string, scan?: CandidateScanSummary): TerminalReason {
  const outage = scan?.outages?.[0];
  if (outage === 'pixiv_auth_failure') {
    return { code: 'auth_failed', message: TERMINAL_REASON_MESSAGES.auth_failed };
  }
  if (outage === 'delivery_unavailable') {
    return { code: 'delivery_failed', message: TERMINAL_REASON_MESSAGES.delivery_failed };
  }
  if (outage === 'network_outage' || outage === 'database_unavailable') {
    return { code: 'network_error', message: TERMINAL_REASON_MESSAGES.network_error };
  }

  const text = String(message ?? '').slice(0, 600);
  if (/\b429\b|rate ?limit/i.test(text)) {
    return { code: 'rate_limited', message: TERMINAL_REASON_MESSAGES.rate_limited };
  }
  if (/\b401\b|unauthorized|invalid grant|invalid refresh token|authentication failed|登录/i.test(text)) {
    return { code: 'auth_failed', message: TERMINAL_REASON_MESSAGES.auth_failed };
  }
  if (/timeout|timed ?out|timedout/i.test(text)) {
    return /download|image|url|fetch/i.test(text)
      ? { code: 'download_timeout', message: TERMINAL_REASON_MESSAGES.download_timeout }
      : { code: 'execution_timeout', message: TERMINAL_REASON_MESSAGES.execution_timeout };
  }
  if (/\b(?:download|image fetch|image write)\b.{0,80}\b(?:fail|failed|error|unable)\b|\b(?:failed|unable)\b.{0,40}\b(?:download|fetch image|write image)\b/i.test(text)) {
    return { code: 'download_failed', message: TERMINAL_REASON_MESSAGES.download_failed };
  }
  if (/502|503|504|bad gateway|service unavailable|server error|5\d\d/i.test(text)) {
    return { code: 'remote_http_error', message: TERMINAL_REASON_MESSAGES.remote_http_error };
  }
  if (/telegram/i.test(text)) {
    return { code: 'telegram_failed', message: TERMINAL_REASON_MESSAGES.telegram_failed };
  }
  // Configuration faults are reported as such even when they surface inside a
  // delivery/submission path ("delivery target not configured"): the operator
  // fixes configuration, not the upstream.
  if (/not configured|missing (?:config|configuration|setting)|invalid config/i.test(text)) {
    return { code: 'configuration_error', message: TERMINAL_REASON_MESSAGES.configuration_error };
  }
  // A candidate's metadata could not be gathered/parsed: this is its own root
  // cause (config is fine; the upstream work was unreadable), so it must not
  // fall through to internal_error or configuration_error.
  if (/\bmetadata\b.{0,60}\b(?:fail|error|unable|invalid|parse|serialize|gather)\b|failed to (?:gather|parse|fetch|load|save)\b.{0,40}\bmetadata\b/i.test(text)) {
    return { code: 'metadata_failed', message: TERMINAL_REASON_MESSAGES.metadata_failed };
  }
  // TelePost (or any theme/review submission endpoint) explicitly rejected the
  // work with a client-side / payload verdict. This is not a delivery outage
  // (5xx/unreachable — handled above) nor a generic delivery failure.
  if (/\btele[ _-]?post\b[^.\n]{0,60}\b(?:reject|invalid|4\d\d)\b/i.test(text)) {
    return { code: 'telepost_rejected', message: TERMINAL_REASON_MESSAGES.telepost_rejected };
  }
  if (/delivery|submit(?:t?ed)?|publish|post|outbox/i.test(text)) {
    return { code: 'delivery_failed', message: TERMINAL_REASON_MESSAGES.delivery_failed };
  }
  if (/econnrefused|econnreset|enotfound|etimedout|ehostunreach|enetunreach|socket hang up|network is unreachable|getaddrinfo/i.test(text)) {
    return { code: 'network_error', message: TERMINAL_REASON_MESSAGES.network_error };
  }
  if (/config|missing|invalid/i.test(text)) {
    return { code: 'configuration_error', message: TERMINAL_REASON_MESSAGES.configuration_error };
  }
  return { code: 'internal_error', message: TERMINAL_REASON_MESSAGES.internal_error };
}
