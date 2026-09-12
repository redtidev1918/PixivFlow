/**
 * Terminal-ACK settlement: the ONE place a confirmed downstream delivery ACK
 * becomes a Slot cell state.
 *
 * The outbox worker already recorded the durable delivery ledger outcome before
 * calling here; this maps that ack onto the Slot FSM. Keeping it as a named,
 * dependency-light function (instead of an inline closure in the scheduler
 * runtime) is what makes the central invariant directly testable:
 *
 *   REMOTE FAILURE MUST NOT BE REPORTED AS END-TO-END SUCCESS.
 *
 * A provider can answer HTTP 2xx while the record it persisted is terminally
 * broken. The provider keys that record by OUR idempotency key, so a retry only
 * returns the same broken record. Such an ack must settle the cell as `failed`,
 * never promote it to `submitted` as though the content had been published.
 */
import type { Database } from '../storage/Database';
import type { DeliveryAck } from './DeliveryAck';
import { SlotCoordinator } from '../scheduler/SlotCoordinator';

/**
 * Apply a terminal delivery ack to the Slot cell that owns the delivery intent.
 * Returns false when the delivery has no Slot cell (ad-hoc / batch runs), which
 * is a normal no-op rather than an error.
 */
export function settleDeliveryTerminal(
  database: Database,
  deliveryId: string,
  ack: DeliveryAck
): boolean {
  const row = database.deliveries.getById(deliveryId);
  if (!row || !row.slotId || !row.targetId) return false;
  const coord = new SlotCoordinator(database);
  if (ack.kind === 'duplicate_existing') {
    // Historical duplicate: a record from a DIFFERENT intent already exists, so
    // THIS intent published nothing. Never a successful submission.
    coord.applyOutcome(row.slotId, row.targetId, {
      kind: 'duplicate',
      workId: row.pixivId,
      reason: 'downstream attested historical duplicate',
    });
    return true;
  }
  if (ack.kind === 'remote_failed') {
    // The downstream record is terminally broken, so nothing was published:
    // settle the cell as failed instead of promoting it to submitted. Not
    // retryable — the same idempotency key can only return that record.
    coord.applyOutcome(row.slotId, row.targetId, {
      kind: 'failed',
      retryable: false,
      error: `downstream reported terminal status ${ack.remoteStatus} (review ${ack.remoteId ?? 'unknown'})`,
    });
    return true;
  }
  // accepted / idempotent_replay: a confirmed ACK is the sole path to submitted.
  coord.markDelivered(
    row.slotId,
    row.targetId,
    row.pixivId,
    row.workType as 'illustration' | 'novel'
  );
  return true;
}
