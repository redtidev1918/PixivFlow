/**
 * The producer-side projection layer of Workflow Protocol v1 (§11.1).
 *
 * Everything a consumer sees about a job is built here from the SAME durable
 * ledger the legacy endpoints read: no second state store, no parallel status
 * machine, no consumer vocabulary. The projection deliberately speaks only
 * protocol words — `job_id`, `status`, `progress`, `error` — while the internal
 * `TerminalReasonCode` is preserved inside `error.detail.internal_code` for
 * diagnosis and mapped to the closed protocol code at this single site.
 *
 * `GET /capabilities` is likewise derived from the live configuration, so a
 * config change (budget, deadline ceiling) is reflected without a code change.
 */

import { StandaloneConfig } from '../config';
import { CandidateSearchParams, CANDIDATE_SEARCH_SCAN_LIMIT_MAX } from './CandidateSearchParams';
import { JobStatusProjection } from './JobProjection';
import { ProtocolRequestError, protocolErrorBody } from './ProtocolErrors';
import { DEFAULT_SCHEDULE_TIMEOUT_MS } from './Scheduler';
import { SLOT_HEARTBEAT_MS } from './SlotCoordinator';
import { resolveStallTimeouts } from './StallSweep';
import {
  CandidateSupplyReport,
  protocolErrorCodeForTerminalReason,
} from './TargetOutcome';

/** Bounds that keep one request from becoming an unbounded allocation. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_CORRELATION_ID_LENGTH = 200;
const MAX_CALLBACK_URL_LENGTH = 2000;
const MAX_TAG_LENGTH = 100;
const MAX_TAGS = 20;
const MAX_EXCLUSIONS = 100;

/** The only job type this producer serves today. */
export const JOB_TYPE_CANDIDATE_SEARCH = 'candidate_search';

/** `$defs/ProtocolVersion` — this producer speaks exactly one version. */
export const PROTOCOL_VERSIONS: readonly string[] = ['1'];

/** `$defs/Job.status`. */
export type ProtocolJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';

/** `$defs/Progress`: `stage` is required, everything else is optional. */
export interface ProtocolJobProgress {
  stage: string;
  message?: string;
  at: number;
}

/**
 * `$defs/Job`, as this producer emits it.
 *
 * Field names are the contract and are asserted against the vendored schema by
 * `src/__tests__/protocol/job-facade.test.ts`. Note there is no `slot*`, no
 * `refetch*` and no consumer-specific key here, by design (§8).
 */
export interface ProtocolJob {
  protocol_version: string;
  job_id: string;
  job_type: string;
  status: ProtocolJobStatus;
  idempotency_key?: string;
  correlation_id?: string;
  created_at: number;
  updated_at: number;
  started_at?: number | null;
  heartbeat_at?: number | null;
  deadline_at?: number | null;
  lease_active: boolean;
  lease_expires_at?: number | null;
  attempt?: number;
  progress: ProtocolJobProgress;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message?: string;
    retryable?: boolean;
    detail?: Record<string, unknown>;
  };
  events_url?: string;
}

/** `$defs/JobTypeDeclaration`. */
export interface ProtocolJobTypeDeclaration {
  name: string;
  params_schema: string;
  result_schema: string;
  features?: string[];
  queued_timeout_ms?: number;
  stall_timeout_ms?: number;
  heartbeat_interval_ms?: number;
  default_deadline_ms?: number;
}

/** `$defs/Capabilities`. */
export interface ProtocolCapabilities {
  protocol_versions: string[];
  job_types: ProtocolJobTypeDeclaration[];
  server_time?: number;
}

/** `$defs/Candidate`, built from the work this job actually delivered. */
export interface ProtocolDeliveredWork {
  workId: string | null;
  workType: string | null;
}

export interface ProtocolJobInput {
  jobType?: string;
  /** The shared ledger projection (`buildJobProjection`). */
  projection: JobStatusProjection;
  /** The execution ceiling this deployment enforces for the job, if known. */
  deadlineAt?: number | null;
  /** The single work item a succeeded job delivered. */
  delivered?: ProtocolDeliveredWork | null;
  /** The persisted candidate-supply funnel (counts only, by design). */
  supply?: CandidateSupplyReport | null;
  /** Injected clock, for tests. */
  now?: number;
}

/**
 * Classify the durable cell state.
 *
 * The CELL is the truth: it is the unit that executes and the unit the manual
 * surface submits. Budget verdicts (`queued_too_long`, `stalled_no_heartbeat`,
 * `execution_timeout`) end as protocol `expired` per §4 — they describe a lost
 * liveness, not a Pixiv failure — while a consumer cancel is `cancelled`.
 */
export function protocolJobStatus(projection: JobStatusProjection): ProtocolJobStatus {
  const cell = projection.state;
  if (cell === 'submitted') return 'succeeded';
  if (cell === 'pending') return 'queued';
  if (cell === 'selected' || cell === 'artifact_ready' || cell === 'delivery_pending') {
    return 'running';
  }
  const reason = projection.terminalReasonCode;
  if (reason === 'cancelled_by_consumer') return 'cancelled';
  if (
    projection.slotStatus === 'expired' ||
    reason === 'queued_too_long' ||
    reason === 'stalled_no_heartbeat' ||
    reason === 'execution_timeout'
  ) {
    return 'expired';
  }
  return 'failed';
}

/** The protocol-visible stage label for a job status (§2 `Progress.stage`). */
export function protocolProgressStage(
  status: ProtocolJobStatus,
  cellStatus: string
): string {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'running':
      return cellStatus === 'selected' ? 'searching' : 'delivering';
    case 'succeeded':
      return 'done';
    default:
      return status;
  }
}

/** `$defs/Candidate.work_type` is a closed enum; anything else is `unknown`. */
function protocolWorkType(workType: string | null): string {
  return workType === 'illustration' || workType === 'novel' ? workType : 'unknown';
}

/**
 * Build the `$defs/Job` body for one job.
 *
 * A terminal job always carries `result` or `error` (§4). The result is built
 * from what the ledger actually knows — the delivered work item and the
 * persisted supply counts — never from a re-derived guestimate: `filtered` is
 * omitted because per-work rejection reasons are not persisted (only counts).
 */
export function buildProtocolJob(input: ProtocolJobInput): ProtocolJob {
  const now = input.now ?? Date.now();
  const projection = input.projection;
  const status = protocolJobStatus(projection);
  const created = projection.createdAt ?? now;
  const updated = projection.updatedAt ?? created;

  const job: ProtocolJob = {
    protocol_version: '1',
    job_id: projection.slotId,
    job_type: input.jobType ?? JOB_TYPE_CANDIDATE_SEARCH,
    status,
    created_at: created,
    updated_at: updated,
    started_at: projection.startedAt,
    heartbeat_at: projection.heartbeatAt,
    deadline_at: input.deadlineAt ?? null,
    lease_active: projection.leaseActive,
    lease_expires_at: projection.leaseExpiresAt,
    attempt: projection.attemptCount,
    progress: {
      stage: protocolProgressStage(status, projection.state),
      at: updated,
    },
  };
  if (projection.idempotencyKey) job.idempotency_key = projection.idempotencyKey;
  if (projection.correlationId) job.correlation_id = projection.correlationId;

  if (status === 'succeeded') {
    job.result = buildCandidateSearchResult(input.delivered ?? null, input.supply ?? null);
  } else if (status === 'failed' || status === 'cancelled' || status === 'expired') {
    const internal = projection.terminalReasonCode;
    const code = protocolErrorCodeForTerminalReason(internal) ?? 'internal_error';
    job.error = protocolErrorBody(code, {
      ...(projection.terminalReasonMessage ? { message: projection.terminalReasonMessage } : {}),
      detail: internal ? { internal_code: internal } : undefined,
    });
  }
  return job;
}

/**
 * `$defs/Result_CandidateSearch` from the durable outcome.
 *
 * `scanned` is the persisted pre-filter count (`fetched`); when the ledger has
 * no supply report the delivered candidate count is the only honest lower
 * bound.
 */
function buildCandidateSearchResult(
  delivered: ProtocolDeliveredWork | null,
  supply: CandidateSupplyReport | null
): Record<string, unknown> {
  const candidates: Array<Record<string, unknown>> = [];
  if (delivered?.workId) {
    candidates.push({
      candidate_id: delivered.workId,
      platform: 'pixiv',
      work_id: delivered.workId,
      work_type: protocolWorkType(delivered.workType),
    });
  }
  return { candidates, scanned: supply?.fetched ?? candidates.length };
}

/**
 * The execution ceiling this deployment enforces for one schedule's work:
 * the plan's configured `timeout`, else the scheduler-wide default.
 */
export function resolveDeadlineMs(config: StandaloneConfig, scheduleId: string): number {
  const plan = (config.schedules ?? []).find((item) => item.id === scheduleId);
  const timeout = plan?.timeout;
  return typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0
    ? timeout
    : DEFAULT_SCHEDULE_TIMEOUT_MS;
}

/**
 * The declared `default_deadline_ms`: the widest ceiling any enabled plan
 * grants, so the declaration never promises more time than config allows, and
 * never less than a plan that does grant it.
 */
export function resolveDefaultDeadlineMs(config: StandaloneConfig): number {
  const declared = (config.schedules ?? [])
    .filter((plan) => plan.enabled !== false)
    .map((plan) => plan.timeout)
    .filter((timeout): timeout is number => typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0);
  return declared.length > 0 ? Math.max(...declared) : DEFAULT_SCHEDULE_TIMEOUT_MS;
}

/** A `$defs/Task` this producer accepted, normalized for the admission. */
export interface ParsedTask {
  idempotencyKey: string;
  correlationId?: string;
  /** `params.source.account` — the Pixiv resource identity to assert. */
  account?: string;
  /** `params` — the occurrence-scoped retrieval view. */
  params: CandidateSearchParams;
  /**
   * Validated but not enforced in this phase: there is no durable column for a
   * consumer-supplied ceiling yet, so `deadline_at` reports the ceiling the
   * producer actually enforces (see `resolveDeadlineMs`) instead of promising
   * one it would not honour.
   */
  deadlineMs?: number;
  /** Validated and accepted; callback delivery arrives with the events phase. */
  callbackUrl?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string, detail?: Record<string, unknown>): ProtocolRequestError {
  return new ProtocolRequestError('invalid_params', 400, { message, detail });
}

/**
 * Parse and validate a `$defs/Task` body (§2/§3).
 *
 * Strict about the documented fields — a wrong type or an out-of-range value is
 * a 400 `invalid_params`, never a silently coerced default — and deliberately
 * tolerant about unknown keys, which §3 requires to be ignored so a newer
 * consumer can talk to an older producer.
 *
 * `protocol_version` is judged by kind: absent is a malformed request
 * (`invalid_params`), present-but-different is a version mismatch
 * (`unsupported_protocol_version`). `job_type` uses `invalid_params`; the
 * published error enum has no `unsupported_job_type` member and this producer
 * does not invent protocol codes.
 */
export function parseTaskBody(body: unknown): ParsedTask {
  if (!isPlainObject(body)) {
    throw invalid('body must be a JSON object');
  }

  const version = body.protocol_version;
  if (version === undefined || version === null) {
    throw invalid('protocol_version is required');
  }
  if (version !== PROTOCOL_VERSIONS[0]) {
    throw new ProtocolRequestError('unsupported_protocol_version', 400, {
      message: `unsupported protocol_version ${JSON.stringify(version)}`,
      detail: { received: version, supported: [...PROTOCOL_VERSIONS] },
    });
  }

  if (body.job_type !== JOB_TYPE_CANDIDATE_SEARCH) {
    throw invalid(`unsupported job_type ${JSON.stringify(body.job_type ?? null)}`, {
      reason: 'unsupported_job_type',
      job_type: body.job_type ?? null,
      supported: [JOB_TYPE_CANDIDATE_SEARCH],
    });
  }

  const rawKey = body.idempotency_key;
  if (typeof rawKey !== 'string' || rawKey.trim() === '') {
    throw invalid('idempotency_key must be a non-empty string');
  }
  const idempotencyKey = rawKey.trim();
  if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw invalid(`idempotency_key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`);
  }

  let correlationId: string | undefined;
  if (body.correlation_id !== undefined && body.correlation_id !== null) {
    if (typeof body.correlation_id !== 'string' || body.correlation_id.length > MAX_CORRELATION_ID_LENGTH) {
      throw invalid(`correlation_id must be a string of at most ${MAX_CORRELATION_ID_LENGTH} chars`);
    }
    correlationId = body.correlation_id;
  }

  let callbackUrl: string | undefined;
  if (body.callback_url !== undefined && body.callback_url !== null) {
    if (typeof body.callback_url !== 'string' || body.callback_url.length > MAX_CALLBACK_URL_LENGTH) {
      throw invalid(`callback_url must be a string of at most ${MAX_CALLBACK_URL_LENGTH} chars`);
    }
    callbackUrl = body.callback_url;
  }

  let deadlineMs: number | undefined;
  if (body.deadline_ms !== undefined && body.deadline_ms !== null) {
    if (!Number.isInteger(body.deadline_ms) || (body.deadline_ms as number) < 1000) {
      throw invalid('deadline_ms must be an integer of at least 1000 ms');
    }
    deadlineMs = body.deadline_ms as number;
  }

  if (body.labels !== undefined && body.labels !== null) {
    if (!isPlainObject(body.labels)) {
      throw invalid('labels must be an object of strings');
    }
    for (const [name, value] of Object.entries(body.labels)) {
      if (typeof value !== 'string') {
        throw invalid(`labels.${name} must be a string`);
      }
    }
  }

  const params = parseCandidateSearchParams(body.params);
  return {
    idempotencyKey,
    ...(correlationId !== undefined ? { correlationId } : {}),
    ...(params.source?.account !== undefined ? { account: params.source.account } : {}),
    params,
    ...(deadlineMs !== undefined ? { deadlineMs } : {}),
    ...(callbackUrl !== undefined ? { callbackUrl } : {}),
  };
}

/** `$defs/CandidateSearchParams`, validated field by field. */
function parseCandidateSearchParams(raw: unknown): CandidateSearchParams {
  if (!isPlainObject(raw)) {
    throw invalid('params must be a JSON object');
  }

  let source: CandidateSearchParams['source'];
  if (raw.source !== undefined && raw.source !== null) {
    if (!isPlainObject(raw.source)) {
      throw invalid('params.source must be a JSON object');
    }
    const platform = raw.source.platform;
    if (platform !== undefined && platform !== null && platform !== 'pixiv') {
      throw invalid(`params.source.platform must be 'pixiv'`, { received: platform });
    }
    const account = raw.source.account;
    if (account !== undefined && account !== null) {
      if (typeof account !== 'string' || account.trim() === '' || account.length > MAX_TAG_LENGTH) {
        throw invalid('params.source.account must be a non-empty string');
      }
      source = { ...(platform === 'pixiv' ? { platform } : {}), account };
    } else if (platform === 'pixiv') {
      source = { platform };
    }
  }

  const query = raw.query;
  if (!isPlainObject(query)) {
    throw invalid('params.query must be a JSON object');
  }
  const tags = query.tags;
  if (!Array.isArray(tags) || tags.length === 0) {
    throw invalid('params.query.tags must be a non-empty array of strings');
  }
  if (tags.length > MAX_TAGS) {
    throw invalid(`params.query.tags must contain at most ${MAX_TAGS} tags`);
  }
  for (const tag of tags) {
    if (typeof tag !== 'string' || tag.trim() === '' || tag.length > MAX_TAG_LENGTH) {
      throw invalid('params.query.tags must be a non-empty array of strings');
    }
  }
  if (query.expand !== undefined && query.expand !== null && typeof query.expand !== 'boolean') {
    throw invalid('params.query.expand must be a boolean');
  }

  const constraints = parseConstraints(raw.constraints);
  return {
    ...(source !== undefined ? { source } : {}),
    query: {
      tags: tags.map((tag) => (tag as string).trim()),
      ...(query.expand === true ? { expand: true } : {}),
    },
    ...(constraints !== undefined ? { constraints } : {}),
  };
}

function parseConstraints(raw: unknown): CandidateSearchParams['constraints'] {
  if (raw === undefined || raw === null) return undefined;
  if (!isPlainObject(raw)) {
    throw invalid('params.constraints must be a JSON object');
  }

  let exclude: NonNullable<CandidateSearchParams['constraints']>['exclude'];
  if (raw.exclude !== undefined && raw.exclude !== null) {
    if (!Array.isArray(raw.exclude) || raw.exclude.length > MAX_EXCLUSIONS) {
      throw invalid(`params.constraints.exclude must be an array of at most ${MAX_EXCLUSIONS} items`);
    }
    exclude = raw.exclude.map((entry) => {
      if (!isPlainObject(entry) || !['work', 'candidate', 'tag'].includes(String(entry.kind))) {
        throw invalid('params.constraints.exclude[].kind must be one of work, candidate, tag');
      }
      if (typeof entry.id !== 'string' || entry.id.trim() === '' || entry.id.length > MAX_TAG_LENGTH) {
        throw invalid('params.constraints.exclude[].id must be a non-empty string');
      }
      return { kind: entry.kind as 'work' | 'candidate' | 'tag', id: entry.id.trim() };
    });
  }

  const limit = parsePositiveInteger(raw.limit, 'params.constraints.limit');
  const scanLimit = parsePositiveInteger(raw.scan_limit, 'params.constraints.scan_limit');

  let workTypes: string[] | undefined;
  if (raw.work_types !== undefined && raw.work_types !== null) {
    if (!Array.isArray(raw.work_types) || raw.work_types.some((type) => typeof type !== 'string' || type === '')) {
      throw invalid('params.constraints.work_types must be an array of non-empty strings');
    }
    workTypes = [...(raw.work_types as string[])];
  }

  return {
    ...(exclude !== undefined ? { exclude } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(scanLimit !== undefined ? { scan_limit: Math.min(scanLimit, CANDIDATE_SEARCH_SCAN_LIMIT_MAX) } : {}),
    ...(workTypes !== undefined ? { work_types: workTypes } : {}),
  };
}

function parsePositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw invalid(`${name} must be an integer of at least 1`);
  }
  return value as number;
}

/**
 * `$defs/Capabilities`, derived from the live configuration: change a budget in
 * config and this declaration follows without a code change.
 */
export function buildCapabilities(
  config: StandaloneConfig,
  now: number = Date.now()
): ProtocolCapabilities {
  const budgets = resolveStallTimeouts(config.schedulerRuntime);
  return {
    protocol_versions: [...PROTOCOL_VERSIONS],
    job_types: [
      {
        name: JOB_TYPE_CANDIDATE_SEARCH,
        params_schema: '#/$defs/CandidateSearchParams',
        result_schema: '#/$defs/Result_CandidateSearch',
        // Honest feature list. `exclude` and `tag_expansion` are real: the
        // occurrence-scoped retrieval view applies `constraints.exclude` and
        // `query.expand`. `events` is NOT declared: this phase has no events
        // endpoint and no callback delivery yet.
        features: ['progress', 'cancel', 'idempotency', 'exclude', 'tag_expansion'],
        queued_timeout_ms: budgets.queuedTimeoutMs,
        stall_timeout_ms: budgets.stallTimeoutMs,
        heartbeat_interval_ms: SLOT_HEARTBEAT_MS,
        default_deadline_ms: resolveDefaultDeadlineMs(config),
      },
    ],
    server_time: now,
  };
}
