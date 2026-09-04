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
import { DEFAULT_SCHEDULE_TIMEOUT_MS } from '../scheduler/Scheduler';
import { createSchedulerRuntime, runWithTimeout } from './scheduler-runtime';

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
    const targetFilter = (args.options.target as string | undefined)?.trim();
    try {
      let plans = resolveSchedules(runtime.config).filter((plan) => plan.enabled);
      if (targetFilter) {
        // "重抓/换一张" 只重跑产生该审核的那一个 target 所在的 schedule。
        plans = plans.filter((plan) => (plan.targetIds ?? []).includes(targetFilter));
        if (plans.length === 0) {
          context.logger.warn(`No enabled schedule contains target: ${targetFilter}`);
          return this.failure(`No enabled schedule contains target: ${targetFilter}`);
        }
      }
      if (plans.length === 0) {
        context.logger.warn('No enabled schedules; nothing to run');
        return this.success('No enabled schedules to run');
      }

      context.logger.info(
        targetFilter
          ? `Running schedule(s) for target ${targetFilter} once`
          : 'Running all enabled schedules once',
        { schedules: plans.map((plan) => plan.id) },
      );
      // Sequential: plans share one database and delivery outbox, and the
      // scheduler daemon's per-plan concurrency is not needed for a refetch.
      // Each plan runs under a watchdog so a wedged download cannot hang the
      // refetch subprocess past TelePost's timeout.
      for (const plan of plans) {
        const timeoutMs = plan.timeout ?? DEFAULT_SCHEDULE_TIMEOUT_MS;
        await runWithTimeout(
          runtime.runJob(runtime.config, plan, targetFilter),
          timeoutMs,
          () => runtime.cancelActive(`run timeout after ${timeoutMs}ms`),
          `plan ${plan.id}`
        );
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

Options:
  --target <id>   Only run the target with this id (and its schedule). Used by
                  the review-group "重抓/换一张" button to re-fetch just the
                  one target instead of every schedule.

Examples:
  pixivflow run-once                        # Run all schedules once
  pixivflow run-once --target bot1-illust-tag-a
  pixivflow run-once --config /path/config.json`;
  }
}
