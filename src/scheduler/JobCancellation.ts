/**
 * Consumer-initiated cancellation of one job, in ONE transaction.
 *
 * The protocol has no separate "cancelled" ledger state on purpose (§11.1: no
 * new cell-FSM state may be invented). A cancel is therefore expressed with the
 * existing terminal cell state: the cell becomes `failed` carrying the
 * dedicated terminal reason `cancelled_by_consumer`, which the taxonomy treats
 * as an operator/consumer stop rather than a Pixiv failure, and which the job
 * facade surfaces as protocol `status: "cancelled"`.
 *
 * Stopping delivery is part of the same intent: every actionable outbox row for
 * the cancelled cells is cancelled inside the transaction, and the delivery
 * worker refuses to (re)attempt a delivery whose cell carries the cancel
 * reason — a cancel that is undone by a retry would be worse than no cancel.
 */

import type { Database } from '../storage/Database';
import type { SlotItemRecord } from '../storage/repositories/SlotRepository';
import { CANCELLED_BY_CONSUMER, ProtocolRequestError } from './ProtocolErrors';
import { TERMINAL_CELL_STATES } from './SlotStateMachine';

/** The user-facing business message for a consumer cancel. */
export const CANCELLED_BY_CONSUMER_MESSAGE = '任务已被取消';

export interface JobCancellationResult {
  slotId: string;
  /** True when THIS call performed the terminal transition. */
  cancelled: boolean;
  /** True when the work was already terminal before this call (idempotent replay). */
  alreadyTerminal: boolean;
  /** Outbox intents this call stopped from ever being attempted again. */
  stoppedDeliveries: number;
}

/**
 * Cancel one job (a slot) by id. Idempotent: a second call observes a terminal
 * slot and reports `alreadyTerminal` without touching the ledger.
 *
 * A slot that already delivered something is never downgraded to `failed`; it
 * keeps its delivered cell and rolls up as `partial`.
 */
export function cancelConsumerJob(
  database: Database,
  slotId: string,
  now: number = Date.now()
): JobCancellationResult {
  return database.transaction(() => {
    const slot = database.slots.getSlot(slotId);
    if (!slot) {
      throw new ProtocolRequestError('invalid_params', 404, {
        message: 'unknown job',
        detail: { reason: 'unknown_job', job_id: slotId },
      });
    }
    const cells = slot.targetIds
      .map((targetId) => database.slots.getCell(slotId, targetId))
      .filter((cell): cell is SlotItemRecord => cell !== null);
    const open = cells.filter((cell) => !TERMINAL_CELL_STATES.has(cell.status));
    if (open.length === 0) {
      return {
        slotId,
        cancelled: false,
        alreadyTerminal: true,
        stoppedDeliveries: 0,
      };
    }

    let stoppedDeliveries = 0;
    for (const cell of open) {
      for (const delivery of database.deliveries.listForSlotCell(slotId, cell.targetId)) {
        if (!database.outbox.hasActionableDelivery(delivery.id)) continue;
        const row = database.outbox.listForDeliveryIds([delivery.id]).get(delivery.id);
        if (row && database.outbox.cancel(row.id, now)) stoppedDeliveries++;
      }
      database.slots.transitionCell(slotId, cell.targetId, 'failed', CANCELLED_BY_CONSUMER_MESSAGE);
      database.slots.setCellTerminalReason(
        slotId,
        cell.targetId,
        CANCELLED_BY_CONSUMER,
        CANCELLED_BY_CONSUMER_MESSAGE
      );
    }

    // Never report a slot with a confirmed delivery as failed.
    const delivered = cells.some((cell) => cell.status === 'submitted');
    database.slots.markSlotStatus(
      slotId,
      delivered ? 'partial' : 'failed',
      CANCELLED_BY_CONSUMER_MESSAGE
    );
    const lease = database.slots.getSlotLease(slotId);
    if (lease.owner) database.slots.releaseSlotLease(slotId, lease.owner);

    return { slotId, cancelled: true, alreadyTerminal: false, stoppedDeliveries };
  });
}
