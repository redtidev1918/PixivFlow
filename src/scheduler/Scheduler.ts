import cron, { ScheduledTask } from 'node-cron';

import { SchedulerConfig } from '../config';
import { logger } from '../logger';
import { isOperationCancelled } from '../utils/errors';
import { Database } from '../storage/Database';

/**
 * Watchdog fallback: a schedule without an explicit `timeout` still gets this
 * cap so a wedged download run cannot occupy the scheduler queue forever.
 */
export const DEFAULT_SCHEDULE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Optional integration hooks allowing the host command to provide real
 * accounting data and cooperative cancellation to the scheduler.
 */
export interface JobTelemetry {
  /** Called right before each run; returns a baseline (e.g. total downloads so far). */
  beginRun(): Promise<number> | number;
  /** Called after a successful/failed-but-not-timed-out run; derives items from the baseline. */
  endRun(baseline: number): Promise<number> | number;
  /** Called when the configured timeout fires; should abort the in-flight job. */
  requestCancel?(reason: string): void;
}

export interface JobLease {
  release(): void;
}

export interface JobFailure {
  scheduleId: string;
  executionNumber: number;
  status: 'failed' | 'timeout';
  errorMessage: string | null;
  consecutiveFailures: number;
  stopped: boolean;
}

/** Admission is acquired before timeout/accounting starts. */
export interface JobAdmissionController {
  acquire(scheduleId: string): Promise<JobLease | null>;
}

export class Scheduler {
  private task: ScheduledTask | null = null;
  private job: (() => Promise<void>) | null = null;
  private running = false;
  private lastExecutionTime: number = 0;
  private executionCount: number = 0;
  private consecutiveFailures: number = 0;
  private timeoutHandle: NodeJS.Timeout | null = null;
  private stopped: boolean = false;
  private pending: boolean = false;

  constructor(
    private readonly config: SchedulerConfig,
    private readonly database?: Database,
    private readonly telemetry?: JobTelemetry,
    private readonly scheduleId: string = 'default',
    private readonly admission?: JobAdmissionController,
    private readonly onFailure?: (failure: JobFailure) => Promise<void> | void
  ) {}

  public start(job: () => Promise<void>) {
    if (!cron.validate(this.config.cron)) {
      throw new Error(`Invalid cron expression: ${this.config.cron}`);
    }

    // Load initial execution count from database
    if (this.database) {
      const stats = this.database.getSchedulerStats(this.scheduleId);
      this.executionCount = stats.totalExecutions;
      this.consecutiveFailures = this.database.getConsecutiveFailures(this.scheduleId);
    }

    logger.info('Scheduler initialised', {
      cron: this.config.cron,
      timezone: this.config.timezone ?? 'system',
      maxExecutions: this.config.maxExecutions ?? 'unlimited',
      minInterval: this.config.minInterval ? `${this.config.minInterval}ms` : 'none',
      timeout: this.config.timeout ? `${this.config.timeout}ms` : 'none',
      maxConsecutiveFailures: this.config.maxConsecutiveFailures ?? 'unlimited',
      currentExecutionCount: this.executionCount,
      currentConsecutiveFailures: this.consecutiveFailures,
      scheduleId: this.scheduleId,
    });

    this.task = cron.schedule(
      this.config.cron,
      async () => {
        await this.executeJob(job);
      },
      {
        timezone: this.config.timezone,
      }
    );
    this.job = job;
  }

  /**
   * Trigger one execution immediately (e.g. catch-up for a missed cron fire).
   * Honors the same guards as a cron firing; no-op if already running.
   */
  public runNow(): void {
    if (!this.job) return;
    void this.executeJob(this.job);
  }

  private async executeJob(job: () => Promise<void>) {
    // Check if already running
    if (this.running || this.pending) {
      logger.warn('Skipping scheduled job because previous run is still in progress');
      return;
    }

    // Check if stopped
    if (this.stopped) {
      logger.info('Scheduler is stopped, skipping execution');
      return;
    }

    // Check minimum interval
    const now = Date.now();
    if (this.config.minInterval && this.lastExecutionTime > 0) {
      const timeSinceLastExecution = now - this.lastExecutionTime;
      if (timeSinceLastExecution < this.config.minInterval) {
        logger.warn(
          `Skipping scheduled job: minimum interval not met (${timeSinceLastExecution}ms < ${this.config.minInterval}ms)`
        );
        return;
      }
    }

    // Check max executions
    if (this.config.maxExecutions && this.executionCount >= this.config.maxExecutions) {
      logger.info(
        `Maximum executions reached (${this.executionCount}/${this.config.maxExecutions}), stopping scheduler`
      );
      this.stop();
      return;
    }

    // Check consecutive failures
    if (
      this.config.maxConsecutiveFailures &&
      this.consecutiveFailures >= this.config.maxConsecutiveFailures
    ) {
      logger.error(
        `Maximum consecutive failures reached (${this.consecutiveFailures}/${this.config.maxConsecutiveFailures}), stopping scheduler`
      );
      this.stop();
      return;
    }

    // Apply failure retry delay if needed
    if (this.config.failureRetryDelay && this.consecutiveFailures > 0) {
      logger.info(
        `Waiting ${this.config.failureRetryDelay}ms before retry after ${this.consecutiveFailures} consecutive failures`
      );
      await new Promise((resolve) => setTimeout(resolve, this.config.failureRetryDelay!));
    }

    this.pending = true;
    const lease = this.admission ? await this.admission.acquire(this.scheduleId) : null;
    this.pending = false;

    if (this.stopped) {
      lease?.release();
      return;
    }
    if (this.admission && !lease) {
      logger.warn('Skipping scheduled job because the shared scheduler queue is full', {
        scheduleId: this.scheduleId,
      });
      return;
    }

    this.running = true;
    this.lastExecutionTime = now;
    this.executionCount++;

    const executionNumber = this.database?.getNextExecutionNumber(this.scheduleId) ?? this.executionCount;
    const startTime = new Date();
    let status: 'success' | 'failed' | 'timeout' | 'skipped' = 'success';
    let errorMessage: string | null = null;
    let itemsDownloaded = 0;
    let timeoutOccurred = false;

    let baseline = 0;
    let baselineValid = false;
    const accountItems = async (): Promise<number> => {
      if (!this.telemetry || !baselineValid) return 0;
      try {
        const after = Number(await this.telemetry.endRun(baseline)) || 0;
        return after > baseline ? after - baseline : 0;
      } catch (error) {
        logger.debug('Telemetry endRun failed; keeping previous item count', { error });
        return itemsDownloaded;
      }
    };

    if (this.telemetry) {
      try {
        baseline = Number(await this.telemetry.beginRun()) || 0;
        baselineValid = true;
      } catch (error) {
        logger.warn('Telemetry beginRun failed; item counting disabled for this run', { error });
      }
    }

    logger.info(`Starting scheduled Pixiv download job (execution #${executionNumber})`, {
      scheduleId: this.scheduleId,
    });

    // Set up timeout if configured
    if (this.config.timeout) {
      this.timeoutHandle = setTimeout(() => {
        if (this.running) {
          logger.error(`Job execution timeout after ${this.config.timeout}ms, requesting cancellation`);
          timeoutOccurred = true;
          status = 'timeout';
          errorMessage = `Execution timeout after ${this.config.timeout}ms`;
          try {
            this.telemetry?.requestCancel?.('scheduler timeout');
          } catch (cancelError) {
            logger.warn('Failed to request job cancellation', { error: cancelError });
          }
          // Keep running=true until the aborted job actually settles so the
          // concurrent-run guard stays correct during the drain window.
        }
      }, this.config.timeout);
    }

    try {
      await this.executeWithTracking(job, (count) => {
        itemsDownloaded = count;
      });

      if (timeoutOccurred) {
        status = 'timeout';
        this.consecutiveFailures++;
      } else {
        status = 'success';
        this.consecutiveFailures = 0;
        itemsDownloaded = await accountItems();
        logger.info(`Scheduled Pixiv download job completed (execution #${executionNumber})`, {
          itemsDownloaded,
        });
      }
    } catch (error) {
      if (isOperationCancelled(error)) {
        // Cancelled via telemetry.requestCancel (scheduler timeout or user).
        // Keep the timeout accounting intact instead of reporting a failure.
        if (timeoutOccurred) {
          this.consecutiveFailures++;
        } else {
          errorMessage = error instanceof Error ? error.message : String(error);
        }
        logger.warn('Scheduled job was cancelled', { executionNumber, reason: errorMessage });
        itemsDownloaded = await accountItems();
      } else {
        status = 'failed';
        errorMessage = error instanceof Error ? error.message : String(error);
        this.consecutiveFailures++;
        logger.error(`Scheduled Pixiv download job failed (execution #${executionNumber})`, {
          error: errorMessage,
          consecutiveFailures: this.consecutiveFailures,
        });
      }
    } finally {
      // Clear timeout
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Log to database if available
      if (this.database) {
        this.database.logSchedulerExecution(
          executionNumber,
          status,
          startTime,
          endTime,
          duration,
          errorMessage,
          itemsDownloaded
          ,this.scheduleId
        );
      }

      this.running = false;
      lease?.release();

      const failureLimitReached = Boolean(
        this.config.maxConsecutiveFailures &&
          this.consecutiveFailures >= this.config.maxConsecutiveFailures
      );
      if (
        (this.config.maxExecutions && this.executionCount >= this.config.maxExecutions) ||
        failureLimitReached
      ) {
        logger.info('Stopping scheduler due to limit reached');
        this.stop();
      }

      if ((status === 'failed' || status === 'timeout') && this.onFailure) {
        try {
          await this.onFailure({
            scheduleId: this.scheduleId,
            executionNumber,
            status,
            errorMessage,
            consecutiveFailures: this.consecutiveFailures,
            stopped: failureLimitReached,
          });
        } catch (error) {
          logger.warn('Failed to report scheduled job failure', {
            scheduleId: this.scheduleId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Execute the job. Item counting happens via JobTelemetry in executeJob,
   * which queries a durable baseline before/after the run instead of trying
   * to intercept individual download events.
   */
  private async executeWithTracking(
    job: () => Promise<void>,
    onItemsDownloaded: (count: number) => void
  ) {
    await job();
  }

  public stop() {
    this.stopped = true;
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    logger.info('Scheduler stopped', {
      totalExecutions: this.executionCount,
      consecutiveFailures: this.consecutiveFailures,
    });
  }

  public getStats() {
    return {
      executionCount: this.executionCount,
      consecutiveFailures: this.consecutiveFailures,
      running: this.running,
      stopped: this.stopped,
      pending: this.pending,
      scheduleId: this.scheduleId,
      lastExecutionTime: this.lastExecutionTime,
    };
  }
}
