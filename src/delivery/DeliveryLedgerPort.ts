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
 *
 * A cell may fan out to SEVERAL delivery targets (one ledger row each). The
 * answer is then the aggregate over all of them:
 *   - `confirmed` only when EVERY route is confirmed, so a work still owed to
 *     one platform keeps its cell actionable instead of being reported as done;
 *   - `live` when at least one route is still actionable (the outbox owns it);
 *   - `lost` when no route is confirmed and at least one is terminally failed.
 * A single-target cell (the historical shape) produces exactly the old answer.
 */
export function createDeliveryLedgerPort(database: Database): SchedulerDeliveryPort {
  return {
    stateFor({ deliveryTargets, deliveryTarget, slotId, targetId }): CellDeliveryState {
      const targets = normalizeTargets(deliveryTargets, deliveryTarget);
      if (targets.length === 0) return { kind: 'unknown' };

      let firstConfirmed: { workId: string; workType: string } | undefined;
      let anyConfirmed = false;
      let allConfirmed = true;
      let anyLive = false;
      let anyLost = false;
      let anyDeliverableRow = false;

      for (const name of targets) {
        const rows = database.deliveries.listForCell(name, slotId, targetId);
        if (rows.length === 0) {
          allConfirmed = false;
          continue;
        }
        anyDeliverableRow = true;

        const confirmed = rows.find((r) => r.status === 'delivered' || r.status === 'duplicate');
        if (confirmed) {
          anyConfirmed = true;
          firstConfirmed ??= { workId: confirmed.pixivId, workType: confirmed.workType };
          continue;
        }
        allConfirmed = false;

        const pending = rows.filter((r) => r.status === 'pending');
        // Still actionable = the outbox is going to try again. Its retry budget is
        // the only thing that may converge this delivery, so keep hands off.
        if (pending.some((r) => database.outbox.hasActionableDelivery(r.id))) {
          anyLive = true;
          continue;
        }

        // Either the outbox exhausted its retries (dead/failed) or the intent was
        // never queued. Nobody will converge it, and re-running selection would
        // re-point the logical item at a different work — so fail it as-is.
        if (pending.length > 0 || rows.some((r) => r.status === 'failed')) {
          anyLost = true;
        }
      }

      // Every route confirmed: the work IS delivered everywhere.
      if (anyConfirmed && allConfirmed) {
        return { kind: 'confirmed', workId: firstConfirmed!.workId, workType: firstConfirmed!.workType };
      }
      // At least one route still owned by the outbox: hands off, it will converge.
      if (anyLive) return { kind: 'live' };
      if (anyLost) {
        return {
          kind: 'lost',
          reason:
            'delivery intent reached a terminal failure without an ACK; failing the cell instead of re-selecting a different work',
        };
      }
      // Some routes confirmed while others reported no delivery fact at all:
      // nothing is going to converge the rest, so do not re-select blindly.
      if (anyConfirmed) return { kind: 'live' };
      if (!anyDeliverableRow) return { kind: 'unknown' };
      return { kind: 'unknown' };
    },
  };
}

/** `deliveryTargets` (multi) with the legacy singular `deliveryTarget` as fallback. */
function normalizeTargets(deliveryTargets?: string[], deliveryTarget?: string): string[] {
  const source = deliveryTargets && deliveryTargets.length > 0 ? deliveryTargets : [deliveryTarget];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of source) {
    const name = value?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
