import { TargetConfig } from '../config';
import { TargetExecutionContext } from '../scheduler/WorkIdentity';
import { SystemErrorInput } from './types';

/**
 * Build the standard structured error fields for a target-cell handler from
 * the cell identity plus the current stage/error. Nothing here throws.
 * bot_id / schedule_id derive from the slot identity (`bot1-daily@...`).
 */
export function targetErrorContext(
  target: TargetConfig,
  execution: TargetExecutionContext | null,
  extra: Partial<SystemErrorInput>
): SystemErrorInput {
  const slotId = execution?.slotId;
  const scheduleId = slotId ? slotId.split('@')[0] : undefined;
  const botId = scheduleId ? scheduleId.split('-')[0] : undefined;
  return {
    service: 'pixivflow',
    component: target.type === 'novel' ? 'novel_target' : 'illustration_target',
    schedule_id: scheduleId,
    bot_id: botId,
    slot_id: slotId,
    ...extra,
  } as SystemErrorInput;
}
