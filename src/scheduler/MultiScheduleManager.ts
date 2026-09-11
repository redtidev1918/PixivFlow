import { watchFile, unwatchFile } from 'node:fs';

import cronParser from 'cron-parser';

import { Database } from '../storage/Database';
import { logger } from '../logger';
import { ScheduleConfig, StandaloneConfig } from '../config';
import {
  DEFAULT_SCHEDULE_TIMEOUT_MS,
  JobAbandoned,
  JobAdmissionController,
  JobFailure,
  JobLease,
  JobTelemetry,
  Scheduler,
} from './Scheduler';
import { describeSchedule, resolveSchedules } from './schedules';
import { ResolvedOccurrence, ScheduleRunOptions, TriggerSource, resolveOccurrence } from './OccurrenceResolver';
import { SlotContext } from './SlotCoordinator';

export interface MultiScheduleManagerOptions {
  configPath: string;
  loadConfig: () => StandaloneConfig;
  execute: (config: StandaloneConfig, schedule: ScheduleConfig, options?: ScheduleRunOptions) => Promise<void>;
  database?: Database;
  telemetry?: JobTelemetry;
  onFailure?: (
    config: StandaloneConfig,
    schedule: ScheduleConfig,
    failure: JobFailure
  ) => Promise<void> | void;
  /**
   * A run outlived its timeout AND the drain window, so it will never be
   * awaited again. The host must finish the bookkeeping the run cannot: stop
   * renewing its lease and take its Slot terminal, otherwise the recovery sweep
   * re-dispatches the same occurrence next to a still-running job.
   */
  onAbandoned?: (
    config: StandaloneConfig,
    schedule: ScheduleConfig,
    abandoned: JobAbandoned
  ) => Promise<void> | void;
  onReload?: (result: ConfigReloadResult) => void;
}

export interface ConfigReloadResult {
  ok: boolean;
  generation: number;
  schedules: string[];
  error?: string;
}

/**
 * How often the manager looks for unfinished occurrences that no live worker
 * owns. Combined with the slot lease TTL (SlotCoordinator), the worst case for a
 * slot stranded by a crash/redeploy is roughly TTL + one sweep.
 */
export const RECOVERY_INTERVAL_MS = 60 * 1000;

/** Narrow a stored trigger_source back to the union it was written from. */
function asTriggerSource(value: string | null): TriggerSource {
  return value === 'cron' || value === 'http' || value === 'manual' || value === 'catchup'
    ? value
    : 'catchup';
}

class SerialJobAdmission implements JobAdmissionController {
  private active = false;
  private readonly pendingIds = new Set<string>();
  private readonly queue: Array<{ scheduleId: string; resolve: (lease: JobLease | null) => void }> = [];

  constructor(private queueLimit: number) {}

  public setQueueLimit(queueLimit: number): void {
    this.queueLimit = Math.max(0, queueLimit);
  }

  public acquire(scheduleId: string): Promise<JobLease | null> {
    if (!this.active) {
      this.active = true;
      return Promise.resolve(this.createLease());
    }

    // A slow task may span multiple cron ticks. Retain at most one pending run
    // for each plan so a temporary outage cannot create an unbounded backlog.
    if (this.pendingIds.has(scheduleId) || this.queue.length >= this.queueLimit) {
      return Promise.resolve(null);
    }

    this.pendingIds.add(scheduleId);
    return new Promise((resolve) => {
      this.queue.push({ scheduleId, resolve });
    });
  }

  private createLease(): JobLease {
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.releaseNext();
      },
    };
  }

  private releaseNext(): void {
    const next = this.queue.shift();
    if (!next) {
      this.active = false;
      return;
    }

    this.pendingIds.delete(next.scheduleId);
    next.resolve(this.createLease());
  }
}

/**
 * Hosts many cron plans in one process. A validated config snapshot replaces
 * the complete cron table at once; invalid updates leave the previous table
 * running. All jobs share one bounded serial admission queue by default.
 */
export class MultiScheduleManager {
  private schedulers = new Map<string, Scheduler>();
  private activeConfig!: StandaloneConfig;
  private generation = 0;
  private reloadTimer: NodeJS.Timeout | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private watching = false;
  private readonly admission = new SerialJobAdmission(8);

  constructor(private readonly options: MultiScheduleManagerOptions) {}

  public start(initialConfig?: StandaloneConfig): ConfigReloadResult {
    const config = initialConfig ?? this.options.loadConfig();
    const result = this.applyConfig(config);
    if (!result.ok) {
      throw new Error(result.error || 'Failed to start scheduler');
    }
    this.updateWatcher(config);
    // Recovery first: it acts on occurrences the ledger already knows about.
    // Catch-up is inference ("cron suggests a fire was missed") and runs after.
    this.recoverInterruptedSlots();
    this.startRecoveryLoop();
    this.catchUpMissedRuns(config);
    return result;
  }

  private startRecoveryLoop(): void {
    if (!this.options.database) return;
    if (this.isExternalMode()) {
      logger.info('External scheduler mode: internal cron disabled, awaiting authenticated schedule triggers', {
        recoveryIntervalMs: RECOVERY_INTERVAL_MS,
      });
    }
    this.recoveryTimer = setInterval(() => {
      try {
        this.recoverInterruptedSlots();
      } catch (error) {
        logger.warn('Slot recovery sweep failed; will retry on the next tick', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, RECOVERY_INTERVAL_MS);
    this.recoveryTimer.unref?.();
  }

  /**
   * Re-dispatch occurrences that the durable ledger says are unfinished but that
   * no live worker owns.
   *
   * This is NOT catch-up: catch-up guesses from cron that a fire was missed, and
   * is therefore disabled in `external` mode where a stopped machine is normal.
   * Recovery instead acts on a slot row that provably exists and has not reached
   * a terminal state — a worker that crashed, was redeployed, or died between
   * "occurrence recorded" and "lease claimed". It must run in EVERY mode, or an
   * autosleep/external deployment silently strands those slots forever.
   *
   * Recovery only DISPATCHES. Clearing the lease here would race a healthy owner
   * that heartbeats between the read and the write; the atomic CAS in
   * `claimSlotLease` elects the single winner, so duplicate clocks, restarts and
   * overlapping sweeps all converge on one worker.
   */
  private recoverInterruptedSlots(): void {
    const database = this.options.database;
    if (!database) return;

    const config = this.activeConfig;
    const plans = new Map(
      resolveSchedules(config)
        .filter((plan) => plan.enabled)
        .map((plan) => [plan.id, plan] as const)
    );

    const recovered = database.slots.recoverableSlots();
    if (recovered.length === 0) return;

    let reclaimed = 0;
    let skipped = 0;
    for (const slot of recovered) {
      const plan = plans.get(slot.scheduleId);
      // A slot whose schedule no longer exists (renamed/disabled) has no plan to
      // run. Report it rather than silently ignoring it, so a config mistake is
      // visible instead of looking like a missing run.
      if (!plan || slot.occurrenceAt === null || slot.occurrenceAt === undefined) {
        skipped++;
        logger.warn('Cannot recover slot: no enabled schedule (or occurrence) for it', {
          slot: slot.id,
          schedule: slot.scheduleId,
          status: slot.status,
        });
        continue;
      }

      // Rebuild the context from the STORED occurrence. Re-resolving "now" would
      // map a stale slot onto a different occurrence (e.g. yesterday's 18:00
      // resuming as today's), which is exactly the silent corruption the ledger
      // exists to prevent.
      const context: SlotContext = {
        slotId: slot.id,
        scheduleId: slot.scheduleId,
        occurrenceAt: slot.occurrenceAt,
        occurrenceDate: slot.occurrenceDate,
        occurrenceLabel: slot.occurrenceLabel,
        timezone: slot.timezone,
        triggerSource: asTriggerSource(slot.triggerSource),
        slotName: slot.slotName || slot.occurrenceLabel,
        slotDate: slot.slotDate || slot.occurrenceDate,
      };

      const admitted = this.triggerSchedule(slot.scheduleId, {
        triggerSource: context.triggerSource,
        slot: context,
      });
      if (admitted) reclaimed++;
      else skipped++;
    }

    logger.info('Recovered interrupted slots', {
      stale_slots_found: recovered.length,
      reclaimed,
      skipped,
    });
  }

  /**
   * Self-healing: if the daemon was down across a cron fire (deploy window,
   * crash, restart), the last recorded execution for a schedule is older than
   * an occurrence of its cron expression that has already passed. Run that
   * schedule once now so the missed window is not silently dropped. Runs only
   * at daemon start; hot reloads never trigger a surprise run.
   */
  private catchUpMissedRuns(config: StandaloneConfig): void {
    if (!this.options.database) return;
    // External mode (Fly autosleep): a stopped machine is the normal saving
    // state, not an outage — never self-trigger historical runs on cold start.
    if (this.isExternalMode(config)) return;
    // Opt-out for internal hosts that do not want startup catch-up.
    if (config.schedulerRuntime?.catchUpMissedRuns === false) return;
    const now = new Date();
    for (const plan of resolveSchedules(config)) {
      if (!plan.enabled) continue;
      const scheduler = this.schedulers.get(plan.id);
      if (!scheduler) continue;
      const lastEnd = this.options.database.getLastSchedulerEnd(plan.id);
      if (!lastEnd) continue; // fresh schedule: nothing was ever missed
      try {
        const interval = cronParser.parseExpression(plan.cron, {
          currentDate: lastEnd,
          tz: plan.timezone ?? config.scheduler?.timezone,
        });
        const nextExpected = interval.next().toDate();
        if (nextExpected.getTime() <= now.getTime()) {
          // Resolve the missed canonical occurrence so catch-up opens the SAME
          // slot a timely cron tick would have (bounded: only the one missed
          // fire, never an unbounded historical replay).
          const missed = resolveOccurrence({ schedule: plan, at: now, triggerSource: 'catchup' });
          logger.warn(
            `Schedule ${plan.id}: cron fire was missed while the daemon was down ` +
              `(next expected after last run ${lastEnd.toISOString()} at ${nextExpected.toISOString()}); running catch-up now`
          );
          scheduler.runNow({ triggerSource: 'catchup', slot: occurrenceToSlotContext(missed) });
        }
      } catch (error) {
        logger.warn('Catch-up check failed for schedule', {
          scheduleId: plan.id,
          cron: plan.cron,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  public reload(): ConfigReloadResult {
    try {
      const nextConfig = this.options.loadConfig();
      const result = this.applyConfig(nextConfig);
      this.updateWatcher(nextConfig);
      this.options.onReload?.(result);
      return result;
    } catch (error) {
      const result: ConfigReloadResult = {
        ok: false,
        generation: this.generation,
        schedules: [...this.schedulers.keys()],
        error: error instanceof Error ? error.message : String(error),
      };
      logger.error('Configuration hot reload rejected; keeping previous schedule snapshot', {
        configPath: this.options.configPath,
        error: result.error,
      });
      this.options.onReload?.(result);
      return result;
    }
  }

  private applyConfig(config: StandaloneConfig): ConfigReloadResult {
    const plans = resolveSchedules(config);
    const enabledPlans = plans.filter((plan) => plan.enabled);
    const queueLimit = config.schedulerRuntime?.queueLimit ?? Math.max(enabledPlans.length, 1);
    const registerCron = !this.isExternalMode(config);

    // loadConfig performs full validation. Stop the previous cron table only
    // after every new definition is available, then publish one snapshot.
    for (const scheduler of this.schedulers.values()) scheduler.stop();
    this.schedulers.clear();
    this.activeConfig = config;
    this.generation++;
    const generation = this.generation;
    this.admission.setQueueLimit(queueLimit);

    for (const plan of enabledPlans) {
      // Watchdog: schedules without an explicit timeout still get a cap so a
      // wedged run cannot hold the shared admission queue forever.
      const schedulerConfig =
        plan.timeout !== undefined ? plan : { ...plan, timeout: DEFAULT_SCHEDULE_TIMEOUT_MS };
      const scheduler = new Scheduler(
        schedulerConfig,
        this.options.database,
        this.options.telemetry,
        plan.id,
        this.admission,
        (failure) => this.options.onFailure?.(config, plan, failure),
        (abandoned) => this.options.onAbandoned?.(config, plan, abandoned)
      );
      scheduler[registerCron ? 'start' : 'init'](async (options?: ScheduleRunOptions) => {
        // The closure keeps the exact validated snapshot for an in-flight run.
        // Cron fires pass no options (runJob resolves the occurrence for now);
        // catch-up and HTTP triggers pass a pre-resolved occurrence / source.
        await this.options.execute(config, plan, options ?? { triggerSource: 'cron' });
      });
      this.schedulers.set(plan.id, scheduler);
    }

    const scheduleIds = enabledPlans.map((plan) => plan.id);
    logger.info('Scheduler configuration snapshot activated', {
      generation,
      schedules: enabledPlans.map((plan) => ({
        id: plan.id,
        name: describeSchedule(plan),
        cron: plan.cron,
        targets: plan.targetIds?.length ?? 'all',
      })),
      queueLimit,
    });

    return { ok: true, generation, schedules: scheduleIds };
  }

  private updateWatcher(config: StandaloneConfig): void {
    const shouldWatch = config.schedulerRuntime?.watchConfig !== false;
    if (!shouldWatch) {
      if (this.watching) unwatchFile(this.options.configPath);
      this.watching = false;
      return;
    }
    if (this.watching) return;

    this.watching = true;
    watchFile(this.options.configPath, { interval: 1000, persistent: false }, (current, previous) => {
      if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) return;
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      const debounceMs = this.activeConfig.schedulerRuntime?.reloadDebounceMs ?? 500;
      this.reloadTimer = setTimeout(() => {
        this.reloadTimer = null;
        this.reload();
      }, Math.max(100, debounceMs));
      this.reloadTimer.unref?.();
    });
  }

  public stop(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = null;
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    this.recoveryTimer = null;
    if (this.watching) unwatchFile(this.options.configPath);
    this.watching = false;
    for (const scheduler of this.schedulers.values()) scheduler.stop();
    this.schedulers.clear();
  }

  /** External scheduler mode: runs are HTTP-triggered, never by internal cron. */
  public isExternalMode(config: StandaloneConfig = this.activeConfig): boolean {
    return config.schedulerRuntime?.mode === 'external';
  }

  /**
   * Trigger one schedule immediately (external HTTP trigger / run-once). Returns
   * false if the schedule id is unknown. Honors Scheduler's running/pending and
   * serial-admission guards, so duplicate triggers never double-run. The trigger
   * adapter pre-resolves the canonical occurrence and passes it as `options.slot`
   * with `triggerSource: 'http'`; admission/ledger idempotency are the safety net.
   */
  public triggerSchedule(scheduleId: string, options?: ScheduleRunOptions): boolean {
    const scheduler = this.schedulers.get(scheduleId);
    if (!scheduler) return false;
    return scheduler.runNow(options);
  }

  /** Enabled schedule ids in the active snapshot (for the trigger API / status). */
  public scheduleIds(): string[] {
    return [...this.schedulers.keys()];
  }

  public getStatus(): ConfigReloadResult {
    return {
      ok: true,
      generation: this.generation,
      schedules: [...this.schedulers.keys()],
    };
  }
}

/** Map a resolved canonical occurrence to the durable SlotContext runJob uses. */
export function occurrenceToSlotContext(o: ResolvedOccurrence): SlotContext {
  return {
    slotId: o.slotId,
    scheduleId: o.scheduleId,
    occurrenceAt: o.occurrenceAt.getTime(),
    occurrenceDate: o.occurrenceDate,
    occurrenceLabel: o.occurrenceLabel,
    timezone: o.timezone,
    triggerSource: o.triggerSource,
    slotName: o.occurrenceLabel,
    slotDate: o.occurrenceDate,
  };
}
