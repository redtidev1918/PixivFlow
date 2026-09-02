/**
 * Scheduler run-once command
 *
 * Runs every enabled schedule's download plan exactly once, then exits.
 * This is the backend for the review-group "重抓/换一张" refetch button:
 * a second scheduler daemon would never exit (and would double-fire cron),
 * so refetch needs a bounded one-shot invocation instead.
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { resolveSchedules } from '../scheduler/schedules';
import { createSchedulerRuntime } from './scheduler-runtime';

export class SchedulerRunOnceCommand extends BaseCommand {
  readonly name = 'run-once';
  readonly description = 'Run all enabled schedules once immediately, then exit';
  readonly aliases: string[] = ['refetch', 'now'];
  readonly metadata = {
    category: CommandCategory.DOWNLOAD,
    requiresAuth: true,
    longRunning: false,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const runtime = await createSchedulerRuntime(args.options.config as string | undefined);
    try {
      const plans = resolveSchedules(runtime.config).filter((plan) => plan.enabled);
      if (plans.length === 0) {
        context.logger.warn('No enabled schedules; nothing to run');
        return this.success('No enabled schedules to run');
      }

      context.logger.info('Running all enabled schedules once', {
        schedules: plans.map((plan) => plan.id),
      });
      // Sequential: plans share one database and delivery outbox, and the
      // scheduler daemon's per-plan concurrency is not needed for a refetch.
      for (const plan of plans) {
        await runtime.runJob(runtime.config, plan);
      }

      return this.success('Scheduled plans completed', {
        schedules: plans.map((plan) => plan.id),
      });
    } catch (error) {
      context.logger.error('Fatal error while running schedules once', {
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      return this.failure(
        error instanceof Error ? error.message : String(error),
        { error }
      );
    } finally {
      runtime.close();
    }
  }

  getUsage(): string {
    return `run-once

Run every enabled schedule's download plan once immediately, then exit.
Already-downloaded works are skipped and the next candidate is selected,
matching a normal scheduled run. Exits on completion (bounded process).

Examples:
  pixivflow run-once                        # Run all schedules once
  pixivflow run-once --config /path/config.json`;
  }
}
