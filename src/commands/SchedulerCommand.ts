/**
 * Scheduler command
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { getConfigPath, loadConfig, StandaloneConfig } from '../config';
import { MultiScheduleManager } from '../scheduler/MultiScheduleManager';
import { createSchedulerRuntime } from './scheduler-runtime';

/**
 * Scheduler command - Start scheduler (default if enabled in config)
 */
export class SchedulerCommand extends BaseCommand {
  readonly name = 'scheduler';
  readonly description = 'Start scheduler (default if enabled in config)';
  readonly aliases: string[] = ['s'];
  readonly metadata = {
    category: CommandCategory.DOWNLOAD,
    requiresAuth: true,
    longRunning: true,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const configPath = getConfigPath(args.options.config as string | undefined);
      const runtime = await createSchedulerRuntime(args.options.config as string | undefined);
      const immutableFingerprint = this.getImmutableFingerprint(runtime.config);

      const manager = new MultiScheduleManager({
        configPath,
        loadConfig: () => {
          const next = loadConfig(configPath, false, false);
          if (this.getImmutableFingerprint(next) !== immutableFingerprint) {
            throw new Error(
              'pixiv/network/storage changes require a process restart; schedules, targets, delivery and download settings can be hot-reloaded'
            );
          }
          return next;
        },
        execute: runtime.runJob,
        database: runtime.database,
        onFailure: runtime.notifyScheduleFailure,
        telemetry: {
          beginRun: () => runtime.database.getOverviewStats().totalDownloads,
          endRun: () => runtime.database.getOverviewStats().totalDownloads,
          requestCancel: (reason) => runtime.cancelActive(reason),
        },
      });
      const status = manager.start(runtime.config);

      const cleanup = () => {
        context.logger.info('Shutting down PixivFlow');
        manager.stop();
        runtime.close();
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      process.on('SIGHUP', () => {
        context.logger.info('Received SIGHUP; reloading scheduler configuration');
        manager.reload();
      });

      // Keep process alive
      return this.success('Scheduler started', {
        message: 'Multi-plan scheduler is running with atomic config hot reload. Press Ctrl+C to stop.',
        schedules: status.schedules,
      });
    } catch (error) {
      context.logger.error('Fatal error while starting scheduler', {
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      return this.failure(
        error instanceof Error ? error.message : String(error),
        { error }
      );
    }
  }

  private getImmutableFingerprint(config: StandaloneConfig): string {
    return JSON.stringify({
      pixiv: config.pixiv,
      network: config.network,
      storage: config.storage,
    });
  }

  getUsage(): string {
    return `scheduler

Start the scheduler to run download jobs periodically according to config.

The scheduler hosts all enabled schedules in one process. Valid changes to
schedules, targets, delivery and download settings are loaded automatically.
Pixiv credentials, network and storage changes require a restart.

Examples:
  pixivflow scheduler                          # Start scheduler`;
  }
}
