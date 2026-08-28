import { ScheduleConfig, StandaloneConfig, TargetConfig } from '../config';

export const LEGACY_SCHEDULE_ID = 'default';

/** Return configured plans while preserving the legacy single-cron format. */
export function resolveSchedules(config: StandaloneConfig): ScheduleConfig[] {
  if (config.schedules !== undefined) {
    return config.schedules.map((schedule) => ({
      ...schedule,
      targetIds: schedule.targetIds ? [...schedule.targetIds] : undefined,
    }));
  }

  if (!config.scheduler) {
    return [];
  }

  return [{ id: LEGACY_SCHEDULE_ID, name: 'Default', ...config.scheduler }];
}

/** Select a plan's targets without mutating the active config snapshot. */
export function selectScheduleTargets(
  targets: TargetConfig[],
  schedule: ScheduleConfig
): TargetConfig[] {
  if (!schedule.targetIds || schedule.targetIds.length === 0) {
    return [...targets];
  }

  const selected = new Set(schedule.targetIds);
  return targets.filter((target) => target.id && selected.has(target.id));
}

export function describeSchedule(schedule: ScheduleConfig): string {
  return schedule.name?.trim() || schedule.id;
}
