/**
 * Liveness sweep for the durable Slot ledger (§liveness).
 *
 * Accepted work must not be able to sit in a non-terminal state forever. Two
 * situations can strand a Slot that no worker will ever touch again:
 *
 *  - `queued_too_long`: the Slot was admitted (202) but nothing ever claimed it
 *    — the plan is disabled, its Scheduler is stopped, or the resource wait
 *    queue never drained. `recoverableSlots()` retries such rows on every tick,
 *    which keeps reporting them as "unfinished" forever when admission keeps
 *    failing.
 *  - `stalled_no_heartbeat`: a worker claimed the Slot and then stopped
 *    heartbeating (crash, OOM, redeploy window). Its lease expires, but nothing
 *    terminalises the row, so `countActiveSlots()` keeps the worker alive and a
 *    caller polling the job state sees a frozen `running`.
 *
 * Both rules are LIVENESS-based and deliberately generous: a genuinely
 * progressing job renews its lease every 30s and writes a heartbeat, so it can
 * never be selected — however long a real Pixiv search takes (production runs of
 * 10-40 minutes, occasionally queued hours behind a busy account).
 *
 * The sweep only ever writes terminal states for cells that never made progress
 * (`pending`/`selected`). A cell already handed to the delivery ledger keeps its
 * own lifecycle; `SlotCoordinator.finish` is what converges an abandoned one.
 */
import type { Database } from '../storage/Database';
import type { SlotRecord } from '../storage/repositories/SlotRepository';
import { TERMINAL_REASON_MESSAGES, TerminalReasonCode } from './TargetOutcome';
import { sqliteUtcTimestamp } from './ledger-time';
import { logger } from '../logger';

/** Nothing is ever stalled before this: a floor against a misconfigured budget. */
export const STALL_SWEEP_MIN_TIMEOUT_MS = 60 * 1000;
/** Admitted but never claimed for this long -> `queued_too_long`. */
export const DEFAULT_QUEUED_TIMEOUT_MS = 30 * 60 * 1000;
/** No heartbeat/lease for this long while `running` -> `stalled_no_heartbeat`. */
export const DEFAULT_STALL_TIMEOUT_MS = 15 * 60 * 1000;
/** Bounded batch: one tick must stay cheap on a large ledger. */
export const STALL_SWEEP_BATCH_LIMIT = 100;

export interface StallTimeouts {
  queuedTimeoutMs: number;
  stallTimeoutMs: number;
}

/** The two budgets as configured, each clamped to the floor / its default. */
export function resolveStallTimeouts(rt?: {
  queuedTimeoutMs?: unknown;
  stallTimeoutMs?: unknown;
}): StallTimeouts {
  return {
    queuedTimeoutMs: positiveMs(rt?.queuedTimeoutMs, DEFAULT_QUEUED_TIMEOUT_MS),
    stallTimeoutMs: positiveMs(rt?.stallTimeoutMs, DEFAULT_STALL_TIMEOUT_MS),
  };
}

function positiveMs(value: unknown, fallback: number): number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= STALL_SWEEP_MIN_TIMEOUT_MS
    ? Math.trunc(value)
    : fallback;
}

export interface StallSweepOptions extends Partial<StallTimeouts> {
  /** Injectable clock (tests). */
  now?: number;
  /** Max rows examined per rule per tick. */
  limit?: number;
  /**
   * Slots recovery re-dispatched on this same tick. They are owned by an
   * asynchronous run that has not claimed its lease yet, so they are excluded
   * here: crash-resume must not be turned into a failure by the sweep that runs
   * right after it.
   */
  skipSlotIds?: ReadonlySet<string>;
}

export interface StallSweepResult {
  /** Rows examined (both rules together). */
  scanned: number;
  queuedTooLong: number;
  stalledNoHeartbeat: number;
}

/** One bounded, liveness-aware sweep. Never throws for a single bad row. */
export function sweepStalledSlots(database: Database, options: StallSweepOptions = {}): StallSweepResult {
  const now = options.now ?? Date.now();
  const limit = options.limit ?? STALL_SWEEP_BATCH_LIMIT;
  const { queuedTimeoutMs, stallTimeoutMs } = resolveStallTimeouts(options);
  const skip = options.skipSlotIds;

  const result: StallSweepResult = { scanned: 0, queuedTooLong: 0, stalledNoHeartbeat: 0 };

  // Rule 1: admitted but never claimed.
  const queued = database.slots.agedPendingSlots(
    sqliteUtcTimestamp(now - queuedTimeoutMs),
    now,
    limit
  );
  result.scanned += queued.length;
  for (const slot of queued) {
    if (skip?.has(slot.id)) continue;
    if (terminaliseStalledSlot(database, slot, 'queued_too_long', now - queuedTimeoutMs)) {
      result.queuedTooLong++;
    }
  }

  // Rule 2: claimed, then lost its worker. The lease must be dead AND progress
  // stale; either one alone is a healthy (or merely slow) run, never a stall.
  const stalled = database.slots.stalledRunningSlots(
    sqliteUtcTimestamp(now - stallTimeoutMs),
    now,
    limit
  );
  result.scanned += stalled.length;
  for (const slot of stalled) {
    if (skip?.has(slot.id)) continue;
    if (terminaliseStalledSlot(database, slot, 'stalled_no_heartbeat', now - stallTimeoutMs)) {
      result.stalledNoHeartbeat++;
    }
  }

  return result;
}

/**
 * Terminalise one stalled Slot: every cell that never made progress becomes
 * `failed` with the liveness reason, and the Slot derives its own rollup so a
 * partially delivered occurrence still reports `partial` instead of being
 * misreported as a plain failure. Returns false when nothing was written.
 */
function terminaliseStalledSlot(
  database: Database,
  slot: SlotRecord,
  code: Extract<TerminalReasonCode, 'queued_too_long' | 'stalled_no_heartbeat'>,
  sinceMs: number
): boolean {
  const message = TERMINAL_REASON_MESSAGES[code];
  const cells = database.slots.getCells(slot.id);
  let failedCells = 0;
  for (const cell of cells) {
    if (cell.status !== 'pending' && cell.status !== 'selected') continue;
    try {
      database.slots.transitionCell(slot.id, cell.targetId, 'failed', message);
      database.slots.setCellTerminalReason(slot.id, cell.targetId, code, message);
      failedCells++;
    } catch (error) {
      logger.debug('Stall sweep skipped a cell it could not terminalise', {
        slot: slot.id,
        target: cell.targetId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const derived = cells.length === 0 ? 'failed' : database.slots.deriveSlotStatus(slot.id);
  // A stalled slot must never be reported as healthy: an empty ledger or a
  // rollup that still contains an in-flight delivery cell stays `failed`.
  const status = derived === 'success' || derived === 'running' ? 'failed' : derived;
  database.slots.markSlotStatus(slot.id, status, message);

  logger.warn('Terminalising a slot that made no progress within its liveness budget', {
    slot: slot.id,
    schedule: slot.scheduleId,
    trigger_source: slot.triggerSource,
    manual_request_id: slot.manualRequestId,
    correlation_id: slot.correlationId,
    reason_code: code,
    slot_status: slot.status,
    cells_failed: failedCells,
    stalled_since: new Date(sinceMs).toISOString(),
  });
  return true;
}
