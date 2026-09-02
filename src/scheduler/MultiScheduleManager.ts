import { watchFile, unwatchFile } from 'node:fs';

import cronParser from 'cron-parser';

import { Database } from '../storage/Database';
import { logger } from '../logger';
import { ScheduleConfig, StandaloneConfig } from '../config';
import {
  DEFAULT_SCHEDULE_TIMEOUT_MS,
  JobAdmissionController,
  JobLease,
  JobTelemetry,
  Scheduler,
} from './Scheduler';
import { describeSchedule, resolveSchedules } from './schedules';

export interface MultiScheduleManagerOptions {
  configPath: string;
  loadConfig: () => StandaloneConfig;
  execute: (config: StandaloneConfig, schedule: ScheduleConfig) => Promise<void>;
  database?: Database;
  telemetry?: JobTelemetry;
  onReload?: (result: ConfigReloadResult) => void;
}

export interface ConfigReloadResult {
  ok: boolean;
  generation: number;
  schedules: string[];
  error?: string;
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
    this.catchUpMissedRuns(config);
    return result;
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
          tz: plan.timezone ?? 'Asia/Shanghai',
        });
        const nextExpected = interval.next().toDate();
        if (nextExpected.getTime() <= now.getTime()) {
          logger.warn(
            `Schedule ${plan.id}: cron fire was missed while the daemon was down ` +
              `(next expected after last run ${lastEnd.toISOString()} at ${nextExpected.toISOString()}); running catch-up now`
          );
          scheduler.runNow();
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
        this.admission
      );
      scheduler.start(async () => {
        // The closure keeps the exact validated snapshot for an in-flight run.
        // Later runs are attached to the replacement cron table.
        await this.options.execute(config, plan);
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
    if (this.watching) unwatchFile(this.options.configPath);
    this.watching = false;
    for (const scheduler of this.schedulers.values()) scheduler.stop();
    this.schedulers.clear();
  }

  public getStatus(): ConfigReloadResult {
    return {
      ok: true,
      generation: this.generation,
      schedules: [...this.schedulers.keys()],
    };
  }
}
