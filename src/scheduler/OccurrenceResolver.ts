/**
 * Canonical Schedule Occurrence resolution.
 *
 * A Slot is "one durable execution occurrence of a configured Schedule" — it is
 * NOT a morning/evening row. Identity derives from (schedule definition, the
 * schedule's own cron + timezone, and the trigger moment): every trigger source
 * (internal cron tick, authenticated HTTP trigger, bounded internal catch-up)
 * resolves the SAME canonical scheduled time for a given wall-clock instant, so
 * duplicate/concurrent/retry triggers converge on one Slot.
 *
 * Pure + dependency-light (cron-parser is already a production dependency).
 * This module is the ONLY place that computes occurrence identity / due-window.
 * Adapters (cron/http/cli) must never hand-roll slot ids or dates.
 */

import cronParser from 'cron-parser';

import { ScheduleConfig } from '../config';

import type { SlotContext } from './SlotCoordinator';

export type TriggerSource = 'cron' | 'http' | 'manual' | 'catchup';

/**
 * Options for running a schedule, accepted by every trigger adapter (internal
 * cron, authenticated HTTP, manual CLI) so they all funnel through the one
 * ScheduleExecutionService. This is the cross-layer contract between the
 * scheduler manager / trigger HTTP server and the runtime's runJob.
 */
export interface ScheduleRunOptions {
  /** Run only this target id (explicit operator replacement / "重抓"). */
  onlyTarget?: string;
  /** Why this run was started. Defaults to 'cron' for scheduled runs. */
  triggerSource?: TriggerSource;
  /**
   * Ad-hoc/manual execution (run-once / refetch): runs the download plan but
   * never opens a scheduled Slot, so it can neither mark a scheduled occurrence
   * complete nor be resumed as one. Explicit replacement, not automatic retry.
   */
  adhoc?: boolean;
  /**
   * Pre-resolved occurrence for a scheduled run (cron/http/catchup). When
   * omitted and `adhoc` is false, runJob resolves the canonical occurrence for
   * now via the schedule's own cron + timezone.
   */
  slot?: SlotContext;
}

export interface OccurrenceInput {
  schedule: ScheduleConfig;
  /** Wall-clock instant of the trigger. Defaults to now. */
  at?: Date;
  /** Why this execution was started (recorded for observability only). */
  triggerSource: TriggerSource;
}

export interface ResolvedOccurrence {
  /**
   * Durable, schedule-scoped identity: `<scheduleId>@<occurrenceAt ISO in tz>`.
   * occurrenceAt is the canonical scheduled fire time (minute precision), so a
   * 10:10 watchdog and a 10:00 cron both map to the 10:00 occurrence.
   */
  slotId: string;
  scheduleId: string;
  /** Canonical scheduled fire time (UTC Date). */
  occurrenceAt: Date;
  /** ISO-8601 with the schedule's tz offset, e.g. 2026-09-08T10:00:00+08:00. */
  occurrenceAtIso: string;
  /** Schedule date (YYYY-MM-DD) in the schedule timezone — for display only. */
  occurrenceDate: string;
  /** Human label of the scheduled time-of-day in tz (e.g. "10:00"). */
  occurrenceLabel: string;
  timezone: string;
  triggerSource: TriggerSource;
  /** Schedule display name (provenance only; never parsed). */
  scheduleName: string;
}

export interface OccurrenceWindow {
  ok: boolean;
  /** 425 = not due yet, 410 = expired (outside grace). */
  status?: 425 | 410;
  error?: string;
}

const DEFAULT_TZ = 'UTC';

/** Resolve the schedule's configured timezone (never the server's local tz). */
export function scheduleTimezone(schedule: ScheduleConfig | undefined, fallback?: string): string {
  return schedule?.timezone?.trim() || fallback?.trim() || DEFAULT_TZ;
}

function partsInTz(date: Date, tz: string): { y: string; m: string; d: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { y: get('year'), m: get('month'), d: get('day') };
}

function hhmmInTz(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/**
 * Return the most recent scheduled fire time of `cron` at or before `at` in
 * `tz`. This is the canonical occurrence for a trigger arriving at `at`: late
 * triggers (watchdog/retry/wake delay) resolve to the fire they belong to.
 */
export function resolveOccurrence(input: OccurrenceInput): ResolvedOccurrence {
  const { schedule, at = new Date(), triggerSource } = input;
  const tz = scheduleTimezone(schedule);
  const cronExpr = schedule.cron;
  if (!cronExpr) {
    throw new Error(`schedule ${schedule.id} has no cron expression; cannot resolve occurrence`);
  }

  // A trigger belongs to the occurrence whose window contains the trigger
  // instant: the last fire at/before `at`, OR — when `at` is just before a fire
  // (clock fired a hair early / a small lead) — that upcoming fire. Resolving to
  // "yesterday's fire" for an on-time tick is what a naive prev() would do
  // (cron-parser is exclusive of the anchor), so peek both sides and pick the
  // occurrence whose lead/grace window actually contains `at`.
  // cron-parser treats the anchor instant as exclusive: prev() exactly AT a
  // fire time returns the PREVIOUS fire. Nudge the anchor a minute forward (a
  // schedule is minute-granular) so an on-time tick resolves to its own fire,
  // then pick prev vs the upcoming fire by window.
  const anchor = new Date(at.getTime() + 60_000);
  const interval = cronParser.parseExpression(cronExpr, { currentDate: anchor, tz, iterator: false });
  const prev = interval.prev().toDate();
  const next = cronParser
    .parseExpression(cronExpr, { currentDate: at, tz, iterator: false })
    .next()
    .toDate();

  // Default to the most recent fire; prefer the upcoming one only when `at` is
  // within its lead window (a clock that fired a hair early). Lead is
  // resolver-internal and small (15 min).
  const LEAD_MS = 15 * 60_000;
  const fire = next.getTime() - at.getTime() <= LEAD_MS && next.getTime() >= at.getTime() ? next : prev;

  const { y, m, d } = partsInTz(fire, tz);
  const occurrenceDate = `${y}-${m}-${d}`;
  const occurrenceLabel = hhmmInTz(fire, tz);
  // Stable, filesystem/URL-safe id: minute precision in the tz wall clock.
  const occurrenceStamp = `${occurrenceDate}T${occurrenceLabel.replace(':', '')}`;
  const slotId = `${schedule.id}@${occurrenceStamp}`;

  return {
    slotId,
    scheduleId: schedule.id,
    occurrenceAt: fire,
    occurrenceAtIso: fire.toISOString(),
    occurrenceDate,
    occurrenceLabel,
    timezone: tz,
    triggerSource,
    scheduleName: schedule.name?.trim() || schedule.id,
  };
}

/**
 * Validate that a trigger at `at` may run `occurrence`: it is runnable from a
 * small lead before its scheduled time until `graceMinutes` after. Outside that
 * window external clocks must not execute (no historical back-fill).
 */
export function checkOccurrenceWindow(occurrence: ResolvedOccurrence, at: Date, graceMinutes: number, leadMinutes = 15): OccurrenceWindow {
  const sched = occurrence.occurrenceAt.getTime();
  const leadMs = leadMinutes * 60_000;
  const graceMs = graceMinutes * 60_000;
  const now = at.getTime();
  if (now < sched - leadMs) {
    return {
      ok: false,
      status: 425,
      error: `schedule ${occurrence.scheduleId} occurrence ${occurrence.occurrenceAtIso} is not due yet`,
    };
  }
  if (now > sched + graceMs) {
    return {
      ok: false,
      status: 410,
      error: `schedule ${occurrence.scheduleId} occurrence ${occurrence.occurrenceAtIso} has expired (grace ${graceMinutes}m)`,
    };
  }
  return { ok: true };
}
