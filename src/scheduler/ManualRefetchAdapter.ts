/**
 * Legacy adapters for the pre-protocol `refetch` surface.
 *
 * Workflow Protocol v1 §3.1: the historic endpoint is kept as a *shim* over the
 * one shared admission, so both entry points create and resolve the SAME work
 * item and share one identity space (`requestId` == `idempotency_key`). Nothing
 * here may add behaviour of its own — it only translates shapes and, for the
 * submit route, restores the historic message strings that route maps onto its
 * HTTP statuses (`unknown target` -> 404, `ambiguous target` -> 409).
 */
import { Database } from '../storage/Database';
import { JobStatusProjection, buildJobProjection } from './JobProjection';
import { ManualJobAdmission } from './ManualJobAdmission';
import { ProtocolRequestError } from './ProtocolErrors';

export interface LegacyRefetchSubmitResult {
  slotId: string;
  disposition: string;
}

/** `POST /internal/targets/:targetId/refetch` as a thin adapter. */
export function legacyRefetchSubmit(
  admission: ManualJobAdmission
): (targetId: string, requestId: string, correlationId?: string) => Promise<LegacyRefetchSubmitResult> {
  return async (targetId, requestId, correlationId) => {
    try {
      const result = admission.admit({
        targetId,
        idempotencyKey: requestId,
        ...(correlationId ? { correlationId } : {}),
      });
      return { slotId: result.slotId, disposition: result.disposition };
    } catch (error) {
      // The legacy route classifies by MESSAGE, not by code. Re-throwing the
      // message preserves the deployed contract; the codes stay on the new
      // surface where callers can rely on them.
      if (error instanceof ProtocolRequestError) {
        throw new Error(error.body.message ?? error.body.code);
      }
      throw error;
    }
  };
}

/**
 * `GET /internal/targets/:targetId/refetch/:requestId`. The historic alias
 * fields (`requestId`, `slotId`, `state`, `slotStatus`) are unchanged; the rest
 * of the projection is additive liveness/cause detail.
 */
export function legacyRefetchStatus(
  database: Database
): (targetId: string, requestId: string) => JobStatusProjection | null {
  return (targetId, requestId) => {
    const slot = database.slots.findManualSlot(requestId, targetId);
    const cell = slot && database.slots.getCell(slot.id, targetId);
    return slot && cell ? buildJobProjection(requestId, slot, cell) : null;
  };
}
