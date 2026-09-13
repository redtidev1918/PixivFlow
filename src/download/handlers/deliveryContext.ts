import { TargetConfig } from '../../config';

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
 * attempt on this id.
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
  return {
    scheduleId: executionContext?.scheduleId ?? '',
    executionId: executionContext?.slotId ?? '',
    occurrenceAt: executionContext?.occurrenceAtIso ?? '',
    triggerSource: executionContext?.triggerSource ?? '',
    slotId: slotContext?.slotId ?? executionContext?.slotId ?? '',
    slotName: slotContext?.slotName ?? executionContext?.slotName ?? '',
    slotDate: slotContext?.slotDate ?? executionContext?.slotDate ?? '',
    refetchRequestId: slotContext?.manualRequestId ?? '',
  };
}