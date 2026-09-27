import { TargetConfig } from '../../config';
import { logger } from '../../logger';
import { canonicalRefetchRequestId } from '../../delivery/refetchProvenance';

/**
 * Delivery payload context for one target run, merging schedule/slot provenance
 * with the optional remote manual replacement identity.
 *
 * Every key is ALWAYS present (empty string when absent) so delivery templates
 * never render a literal `{{placeholder}}` into the submitted payload — a
 * scheduled run and a manual refetch share the same field templates.
 *
 * `refetchRequestId` is the request UUID of a remote manual replacement ("重抓")
 * that produced this delivery; it is empty for scheduled occurrences. The
 * receiving service (TelePost) correlates the incoming review with the refetch
 * attempt on this id, and validates it as a canonical UUID — see
 * `delivery/refetchProvenance.ts` for why an unusable key becomes empty instead
 * of failing the whole delivery. The consumer's idempotency key itself keeps its
 * exact spelling as the durable slot identity; only this wire field is
 * normalized.
 */
export function deliveryContextFields(target: TargetConfig): Record<string, unknown> {
  const ec = target.delivery as
    | { executionContext?: Record<string, unknown>; slotContext?: Record<string, unknown> }
    | undefined;
  const slotContext = ec?.slotContext as
    | { slotId?: string; slotName?: string; slotDate?: string; manualRequestId?: string }
    | undefined;
  const executionContext = ec?.executionContext as
    | { slotId?: string; scheduleId?: string; occurrenceAtIso?: string; triggerSource?: string; slotName?: string; slotDate?: string }
    | undefined;
  const manualRequestId = slotContext?.manualRequestId ?? '';
  const refetchRequestId = canonicalRefetchRequestId(manualRequestId);
  if (manualRequestId && !refetchRequestId) {
    // Visible, not silent: the delivery still goes out (the receiving service
    // treats an empty provenance as "not a refetch"), but the operator must be
    // able to see that this manual run cannot be correlated remotely.
    logger.warn('Manual refetch request id is not a UUID; sending an empty refetch_request_id so the delivery is not rejected', {
      slotId: slotContext?.slotId ?? '',
      manualRequestIdLength: manualRequestId.length,
      manualRequestIdPrefix: manualRequestId.slice(0, 8),
    });
  } else if (manualRequestId && manualRequestId !== refetchRequestId) {
    logger.info('Canonicalized the manual refetch request id for the delivery payload', {
      slotId: slotContext?.slotId ?? '',
      canonicalRefetchRequestId: refetchRequestId,
    });
  }
  return {
    scheduleId: executionContext?.scheduleId ?? '',
    executionId: executionContext?.slotId ?? '',
    occurrenceAt: executionContext?.occurrenceAtIso ?? '',
    triggerSource: executionContext?.triggerSource ?? '',
    slotId: slotContext?.slotId ?? executionContext?.slotId ?? '',
    slotName: slotContext?.slotName ?? executionContext?.slotName ?? '',
    slotDate: slotContext?.slotDate ?? executionContext?.slotDate ?? '',
    refetchRequestId,
  };
}