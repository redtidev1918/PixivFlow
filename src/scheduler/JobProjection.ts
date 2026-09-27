/**
 * The generic Job projection (§liveness).
 *
 * One durable Slot cell, described in terms a consumer can act on WITHOUT
 * knowing this service's internal column names, table layout or scheduler
 * topology. This is the body a job-status endpoint returns; the manual-refetch
 * GET endpoint is the first such consumer (and declares the legacy
 * `requestId`/`slotId`/`state`/`slotStatus` aliases on top of it).
 *
 * Why the extra fields exist: a caller that receives only a coarse state cannot
 * tell "queued two seconds ago" from "pending for three days behind a stopped
 * scheduler", so it cannot implement a heartbeat-based watchdog — it can only
 * poll forever. Timestamps + lease liveness + attempt count make the difference
 * decidable, and `terminalReasonCode`/`terminalReasonMessage` give the
 * first-level cause once the job is terminal.
 *
 * Timestamp normalisation (the columns do NOT share one shape):
 *  - `schedule_slots.created_at` / `started_at` and
 *    `schedule_slot_items.updated_at` are SQLite `CURRENT_TIMESTAMP` UTC
 *    datetimes without a zone marker -> parsed as UTC (see `ledger-time`).
 *  - `schedule_slots.heartbeat_at` / `lease_until` are already epoch ms.
 *  - Every timestamp in this projection is epoch milliseconds UTC, or null when
 *    the ledger has no such instant.
 */
import type { SlotItemRecord, SlotRecord } from '../storage/repositories/SlotRepository';
import { sqliteUtcMs } from './ledger-time';

export interface JobStatusProjection {
  // --- Legacy identity triple. Semantics must not change. ---
  /** The caller's own request id, echoed back. */
  requestId: string;
  slotId: string;
  /** Cell state from the Slot FSM (pending|selected|artifact_ready|delivery_pending|submitted|no_candidate|duplicate|failed). */
  state: string;
  /** Rolled-up Slot status (pending|running|success|partial|failed|expired). */
  slotStatus: string;

  // --- Timestamps (epoch ms UTC, null when unknown). ---
  createdAt: number | null;
  /** When a worker first marked the slot running. */
  startedAt: number | null;
  /** Last cell update: the freshest durable progress signal for this target. */
  updatedAt: number | null;
  /** Last lease heartbeat written by the owning run. */
  heartbeatAt: number | null;
  /** When the current lease expires (null when nobody holds one). */
  leaseExpiresAt: number | null;

  // --- Liveness / progress. ---
  /** A lease is held AND unexpired: some run owns this slot right now. */
  leaseActive: boolean;
  /** The slot left `pending` (claimed by a run or already terminal). */
  claimed: boolean;
  /** Delivery/execution attempts recorded on this cell. */
  attemptCount: number;

  // --- Terminal cause (null while non-terminal). ---
  terminalReasonCode: string | null;
  terminalReasonMessage: string | null;

  // --- Opaque caller correlation. ---
  /** Internal name of the request that opened this job. */
  manualRequestId: string | null;
  /**
   * Consumer-facing opaque key for the same request. A consumer groups work by
   * this value and never needs to learn the column it came from.
   */
  idempotencyKey: string | null;
  /** Opaque caller correlation (review chain / review id). */
  correlationId: string | null;
}

/**
 * Project one (slot, cell) pair. Pure: no clock reads beyond the injectable
 * `now`, so the same ledger row always projects the same way for a given
 * instant.
 */
export function buildJobProjection(
  requestId: string,
  slot: SlotRecord,
  cell: SlotItemRecord,
  now: number = Date.now()
): JobStatusProjection {
  const leaseActive =
    slot.leaseOwner !== null && slot.leaseUntil !== null && slot.leaseUntil > now;
  return {
    requestId,
    slotId: slot.id,
    state: cell.status,
    slotStatus: slot.status,

    createdAt: sqliteUtcMs(slot.createdAt) ?? null,
    startedAt: sqliteUtcMs(slot.startedAt) ?? null,
    updatedAt: sqliteUtcMs(cell.updatedAt) ?? null,
    heartbeatAt: slot.heartbeatAt ?? null,
    leaseExpiresAt: slot.leaseUntil ?? null,

    leaseActive,
    claimed: slot.status !== 'pending' || leaseActive,
    attemptCount: cell.attemptCount,

    terminalReasonCode: cell.terminalReasonCode ?? null,
    terminalReasonMessage: cell.terminalReasonMessage ?? null,

    manualRequestId: slot.manualRequestId ?? null,
    idempotencyKey: slot.manualRequestId ?? null,
    correlationId: slot.correlationId ?? null,
  };
}
