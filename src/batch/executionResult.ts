/**
 * Machine-readable result of one batch execution.
 *
 * The batch runner is a disposable CI job: it cannot leave its state behind in a
 * process, so its *only* handoff is this document. Everything a control plane
 * needs to roll the occurrence up — and everything a human needs to debug a
 * night's failure — has to be in here.
 *
 * Two rules the shape enforces:
 *  - a target that produced NO outcome is reported as `missing`, never omitted and
 *    never assumed successful;
 *  - the exit code IS the execution status (0 success / 2 partial / 3 failed /
 *    4 uncertain), so a supervisor that only reads the exit code still cannot
 *    mistake "some targets failed" for "everything worked".
 */

import type { TargetOutcome } from '../scheduler/TargetOutcome';

export type BatchTargetStatus =
  | 'submitted'
  | 'stored'
  | 'delivery_pending'
  | 'no_candidate'
  | 'duplicate'
  | 'failed'
  /** The run produced no outcome for this target at all (aborted mid-way). */
  | 'missing';

export type BatchExecutionStatus = 'success' | 'partial' | 'failed' | 'uncertain';

export interface BatchTargetResult {
  targetId: string;
  status: BatchTargetStatus;
  workId?: string;
  error?: string;
  /** Only meaningful for `failed`: a later attempt may still succeed. */
  retryable?: boolean;
}

export interface BatchOutboxSummary {
  processed: number;
  done: number;
  retried: number;
  dead: number;
}

export interface BatchExecutionResult {
  slotId: string;
  scheduleId: string;
  botId?: string;
  attempt: number;
  mode: 'live' | 'shadow' | 'dry-run';
  occurrenceAt?: number;
  status: BatchExecutionStatus;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  targets: BatchTargetResult[];
  outbox?: BatchOutboxSummary;
  /** Process-level failure (config, auth, crash): not a per-target outcome. */
  error?: string;
}

export const EXIT_SUCCESS = 0;
export const EXIT_ERROR = 1;
export const EXIT_PARTIAL = 2;
export const EXIT_FAILED = 3;
export const EXIT_UNCERTAIN = 4;

/** Outcomes that mean "this target is done and content went somewhere". */
const OK_STATUSES: readonly BatchTargetStatus[] = ['submitted', 'stored', 'duplicate'];

export function outcomeToTargetResult(targetId: string, outcome: TargetOutcome): BatchTargetResult {
  switch (outcome.kind) {
    case 'submitted':
      return { targetId, status: 'submitted', workId: outcome.workId };
    case 'stored':
      return { targetId, status: 'stored', workId: outcome.workId };
    case 'delivery_pending':
      return { targetId, status: 'delivery_pending', workId: outcome.workId };
    case 'duplicate':
      return { targetId, status: 'duplicate', workId: outcome.workId, error: outcome.reason };
    case 'no_candidate':
      return { targetId, status: 'no_candidate', error: outcome.reason };
    case 'failed':
      return {
        targetId,
        status: 'failed',
        error: outcome.error,
        retryable: outcome.retryable,
      };
  }
}

export interface ExecutionSummary {
  status: BatchExecutionStatus;
  exitCode: number;
  targets: BatchTargetResult[];
}

/**
 * Combine per-target results into the execution's status.
 *
 * `expectedTargetIds` is what makes this honest: a target that never reported is
 * added as `missing` instead of being dropped, so a run that died halfway cannot
 * come out as `success`.
 */
export function summarizeExecution(
  results: readonly BatchTargetResult[],
  expectedTargetIds: readonly string[]
): ExecutionSummary {
  const byTarget = new Map(results.map((result) => [result.targetId, result]));
  const targets: BatchTargetResult[] = expectedTargetIds.map(
    (targetId) =>
      byTarget.get(targetId) ?? {
        targetId,
        status: 'missing' as const,
        error: 'no outcome was produced for this target',
      }
  );
  for (const result of results) {
    if (!expectedTargetIds.includes(result.targetId)) targets.push(result);
  }

  const ok = targets.filter((target) => OK_STATUSES.includes(target.status));
  const uncertain = targets.filter((target) => target.status === 'delivery_pending');

  if (uncertain.length > 0) {
    // An unconfirmed Telegram send must never be retried automatically: the
    // control plane treats this as terminal and a human resolves it.
    return { status: 'uncertain', exitCode: EXIT_UNCERTAIN, targets };
  }
  if (targets.length === 0) {
    return { status: 'failed', exitCode: EXIT_FAILED, targets };
  }
  if (ok.length === targets.length) {
    return { status: 'success', exitCode: EXIT_SUCCESS, targets };
  }
  if (ok.length === 0) {
    // Nothing was delivered. All-empty-candidates is a business outcome (retrying
    // the same day rarely helps) but it is still "nothing published", not success.
    const allNoCandidate = targets.every((target) => target.status === 'no_candidate');
    return { status: allNoCandidate ? 'partial' : 'failed', exitCode: allNoCandidate ? EXIT_PARTIAL : EXIT_FAILED, targets };
  }
  return { status: 'partial', exitCode: EXIT_PARTIAL, targets };
}

/** Exit code → execution status, the contract the control plane relies on. */
export function executionStatusForExitCode(exitCode: number): BatchExecutionStatus {
  switch (exitCode) {
    case EXIT_SUCCESS:
      return 'success';
    case EXIT_PARTIAL:
      return 'partial';
    case EXIT_UNCERTAIN:
      return 'uncertain';
    default:
      return 'failed';
  }
}
