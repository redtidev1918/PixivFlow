import { Database } from '../storage/Database';
import { CellDeliveryState, SchedulerDeliveryPort } from '../scheduler/SlotCoordinator';

/**
 * Answers the slot FSM's only delivery question — "does this cell still have an
 * owner downstream?" — from the durable delivery ledger.
 *
 * The distinction matters after a crash: a `delivery_pending` cell whose intent
 * is still live must be left alone (the OutboxWorker retries THAT work to a
 * terminal ACK), while one whose intent is terminally failed must be failed
 * explicitly. Both are read from committed rows, so the answer is the same
 * before and after a restart — which is exactly what a recovery decision needs.
 */
export function createDeliveryLedgerPort(database: Database): SchedulerDeliveryPort {
  return {
    stateFor({ deliveryTarget, slotId, targetId }): CellDeliveryState {
      const rows = database.deliveries.listForCell(deliveryTarget, slotId, targetId);
      if (rows.length === 0) return { kind: 'unknown' };

      const confirmed = rows.find((r) => r.status === 'delivered' || r.status === 'duplicate');
      if (confirmed) {
        return { kind: 'confirmed', workId: confirmed.pixivId, workType: confirmed.workType };
      }

      const pending = rows.filter((r) => r.status === 'pending');
      // Still actionable = the outbox is going to try again. Its retry budget is
      // the only thing that may converge this delivery, so keep hands off.
      if (pending.some((r) => database.outbox.hasActionableDelivery(r.id))) {
        return { kind: 'live' };
      }

      // Either the outbox exhausted its retries (dead/failed) or the intent was
      // never queued. Nobody will converge it, and re-running selection would
      // re-point the logical item at a different work — so fail it as-is.
      if (pending.length > 0 || rows.some((r) => r.status === 'failed')) {
        return {
          kind: 'lost',
          reason:
            'delivery intent reached a terminal failure without an ACK; failing the cell instead of re-selecting a different work',
        };
      }

      return { kind: 'unknown' };
    },
  };
}
