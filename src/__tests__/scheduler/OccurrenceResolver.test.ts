/**
 * Canonical occurrence resolution tests.
 *
 * A Slot is one durable execution occurrence of a Schedule; identity derives
 * from (schedule id, the schedule's OWN cron + timezone, and the trigger
 * instant). Late triggers (watchdog/retry/wake) must resolve to the SAME
 * occurrence as an on-time cron tick. No morning/evening assumption anywhere.
 */
import { resolveOccurrence, checkOccurrenceWindow, scheduleTimezone } from '../../scheduler/OccurrenceResolver';
import { ScheduleConfig } from '../../config';

const schedule = (overrides: Partial<ScheduleConfig> = {}): ScheduleConfig =>
  ({
    id: 'schedule-a',
    name: 'Schedule A',
    cron: '0 10 * * *', // 10:00 daily
    timezone: 'Asia/Shanghai',
    enabled: true,
    ...overrides,
  }) as ScheduleConfig;

describe('resolveOccurrence', () => {
  it('uses the schedule timezone, not the server local tz', () => {
    // 2026-09-08 02:30 UTC == 10:30 Shanghai. The most recent 10:00 fire is
    // 2026-09-08 10:00 Shanghai (02:00 UTC).
    const at = new Date('2026-09-08T02:30:00Z');
    const occ = resolveOccurrence({ schedule: schedule(), at, triggerSource: 'http' });
    expect(occ.timezone).toBe('Asia/Shanghai');
    expect(occ.occurrenceDate).toBe('2026-09-08');
    expect(occ.occurrenceLabel).toBe('10:00');
    expect(occ.slotId).toBe('schedule-a@2026-09-08T1000');
  });

  it('resolves the same occurrence for an on-time tick and a late watchdog', () => {
    const onTime = new Date('2026-09-08T02:00:00Z'); // 10:00 Shanghai
    const tenLate = new Date('2026-09-08T02:10:00Z'); // 10:10 Shanghai (watchdog)
    const a = resolveOccurrence({ schedule: schedule(), at: onTime, triggerSource: 'cron' });
    const b = resolveOccurrence({ schedule: schedule(), at: tenLate, triggerSource: 'http' });
    expect(a.slotId).toBe(b.slotId);
    expect(a.occurrenceAt.getTime()).toBe(b.occurrenceAt.getTime());
  });

  it('supports UTC schedules explicitly', () => {
    const s = schedule({ id: 'utc-job', cron: '0 10 * * *', timezone: 'UTC' });
    const at = new Date('2026-09-08T10:05:00Z');
    const occ = resolveOccurrence({ schedule: s, at, triggerSource: 'cron' });
    expect(occ.timezone).toBe('UTC');
    expect(occ.occurrenceDate).toBe('2026-09-08');
    expect(occ.occurrenceLabel).toBe('10:00');
    expect(occ.slotId).toBe('utc-job@2026-09-08T1000');
  });

  it('supports arbitrary cron granularity (hourly), not one-per-day', () => {
    const s = schedule({ id: 'hourly', cron: '0 */6 * * *', timezone: 'UTC' });
    // 13:30 UTC most recent 6-hourly fire is 12:00.
    const occ = resolveOccurrence({ schedule: s, at: new Date('2026-09-08T13:30:00Z'), triggerSource: 'cron' });
    expect(occ.occurrenceLabel).toBe('12:00');
    expect(occ.slotId).toBe('hourly@2026-09-08T1200');
    // Different fire => different occurrence, same day.
    const occ2 = resolveOccurrence({ schedule: s, at: new Date('2026-09-08T18:30:00Z'), triggerSource: 'cron' });
    expect(occ2.slotId).toBe('hourly@2026-09-08T1800');
    expect(occ2.slotId).not.toBe(occ.slotId);
  });

  it('uses arbitrary schedule ids (no business hardcoding)', () => {
    const s = schedule({ id: 'daily-ranking', cron: '0 3 * * *' });
    const occ = resolveOccurrence({ schedule: s, at: new Date('2026-09-08T02:30:00Z'), triggerSource: 'cron' });
    expect(occ.scheduleId).toBe('daily-ranking');
    expect(occ.slotId.startsWith('daily-ranking@')).toBe(true);
  });

  it('throws when the schedule has no cron', () => {
    const s = schedule({ cron: undefined as unknown as string });
    expect(() => resolveOccurrence({ schedule: s, at: new Date(), triggerSource: 'manual' })).toThrow(/no cron/);
  });

  it('falls back to UTC when no timezone is configured', () => {
    expect(scheduleTimezone(undefined, undefined)).toBe('UTC');
    expect(scheduleTimezone(schedule({ timezone: '  ' }), 'America/New_York')).toBe('America/New_York');
  });
});

describe('checkOccurrenceWindow', () => {
  const sched = () => resolveOccurrence({ schedule: schedule(), at: new Date('2026-09-08T02:00:00Z'), triggerSource: 'http' });

  it('accepts a trigger within the grace window after the fire', () => {
    const occ = sched();
    const at = new Date('2026-09-08T02:40:00Z'); // +40 min, grace 90
    expect(checkOccurrenceWindow(occ, at, 90).ok).toBe(true);
  });

  it('rejects a trigger after grace as expired (no historical back-fill)', () => {
    const occ = sched();
    const at = new Date('2026-09-09T02:00:00Z'); // a day late
    const w = checkOccurrenceWindow(occ, at, 90);
    expect(w.ok).toBe(false);
    expect(w.status).toBe(410);
  });

  it('rejects a trigger well before the fire as not-due', () => {
    const occ = resolveOccurrence({ schedule: schedule(), at: new Date('2026-09-08T02:00:00Z'), triggerSource: 'http' });
    // Anchor a full hour before the fire.
    const at = new Date('2026-09-08T00:00:00Z');
    const w = checkOccurrenceWindow(occ, at, 90);
    expect(w.ok).toBe(false);
    expect(w.status).toBe(425);
  });
});
