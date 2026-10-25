import { Database } from '../storage/Database';
import { recoveryOutcomeFor, recoveryUserMessage } from './RecoveryOutcome';

/**
 * Read ONE manual recovery request's durable state, keyed by the same identity
 * the execution owner uses (targetId + requestId).
 *
 * This is THE single implementation behind every surface that answers
 * "where is my recovery?": the authenticated HTTP handler
 * (`GET /internal/targets/:targetId/recover/:requestId`, consumed by TelePost's
 * reconciliation sweep) and the `pixivflow recovery-status` CLI share this
 * function, so an operator and a consumer can never disagree about the shape
 * or the source of the answer.
 *
 * Returns null when the request has no durable ledger row (never admitted, or
 * cleaned up) — callers decide their own not-found semantics; this module does
 * not guess whether a 404 is safe to retry.
 */
export interface RecoveryStatusView {
  requestId: string;
  targetId: string;
  slotId: string;
  scheduleId: string;
  /** Raw execution cell status (CellState). */
  state: string;
  /** Rolled-up slot status (SlotStatus). */
  slotStatus: string;
  /** Business outcome for operators (recovery_* vocabulary). */
  business_state: string;
  /** Terminal reason code when the cell failed, else null. */
  errorCode: string | null;
  /** User-facing copy; never leaks internal error names. */
  message: string;
}

export function queryRecoveryStatus(
  database: Database,
  targetId: string,
  requestId: string,
): RecoveryStatusView | null {
  const slot = database.slots.findRecoverySlot(requestId, targetId);
  const cell = slot ? database.slots.getCell(slot.id, targetId) : null;
  if (!slot || !cell) return null;
  const businessState = recoveryOutcomeFor(cell);
  return {
    requestId,
    targetId,
    slotId: slot.id,
    scheduleId: slot.scheduleId,
    state: cell.status,
    slotStatus: slot.status,
    business_state: businessState,
    errorCode: cell.terminalReasonCode || null,
    message: recoveryUserMessage(businessState),
  };
}
