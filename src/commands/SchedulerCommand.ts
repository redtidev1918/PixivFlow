/**
 * Scheduler command
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { getConfigPath, loadConfig, ScheduleConfig, StandaloneConfig } from '../config';
import { Database } from '../storage/Database';
import { PixivAuth } from '../pixiv/AuthClient';
import { PixivClient } from '../pixiv/PixivClient';
import { FileService } from '../download/FileService';
import { DownloadManager } from '../download/DownloadManager';
import { createTokenMaintenanceService } from '../utils/token-maintenance';
import { MultiScheduleManager } from '../scheduler/MultiScheduleManager';
import { selectScheduleTargets } from '../scheduler/schedules';
import { processConfigPlaceholders } from '../config/placeholders';

/**
 * Scheduler command - Start scheduler (default if enabled in config)
 */
export class SchedulerCommand extends BaseCommand {
  readonly name = 'scheduler';
  readonly description = 'Start scheduler (default if enabled in config)';
  readonly aliases: string[] = ['run', 's'];
  readonly metadata = {
    category: CommandCategory.DOWNLOAD,
    requiresAuth: true,
    longRunning: true,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const configPath = getConfigPath(args.options.config as string | undefined);
      // Keep TODAY/YESTERDAY placeholders intact. They are resolved afresh for
      // every plan execution, not frozen at daemon startup.
      const config = loadConfig(configPath, false, false);

      const database = new Database(config.storage!.databasePath!);
      database.migrate();

      const auth = new PixivAuth(config.pixiv, config.network!, database, configPath);
      const pixivClient = new PixivClient(auth, config);
      const fileService = new FileService(config.storage!);
      await fileService.initialise();

      // Start token maintenance service for automatic token refresh
      const tokenMaintenance = createTokenMaintenanceService(
        auth,
        config.pixiv,
        config.network!,
        config
      );
      if (tokenMaintenance) {
        tokenMaintenance.start();
      }

      let activeDownloadManager: DownloadManager | null = null;
      const immutableFingerprint = this.getImmutableFingerprint(config);

      const runJob = async (snapshot: StandaloneConfig, schedule: ScheduleConfig) => {
        const runtimeConfig = processConfigPlaceholders(snapshot);
        const targets = selectScheduleTargets(runtimeConfig.targets, schedule);
        const scopedConfig: StandaloneConfig = { ...runtimeConfig, targets };

        if (targets.length === 0) {
          context.logger.warn('Scheduled plan has no selected targets; skipping', {
            scheduleId: schedule.id,
            targetIds: schedule.targetIds,
          });
          return;
        }

        const downloadManager = new DownloadManager(scopedConfig, pixivClient, database, fileService);
        activeDownloadManager = downloadManager;
        await downloadManager.initialise();

        // Apply initial delay if configured
        if (runtimeConfig.initialDelay && runtimeConfig.initialDelay > 0) {
          context.logger.info(`Waiting ${runtimeConfig.initialDelay}ms before starting download...`, {
            scheduleId: schedule.id,
          });
          await new Promise(resolve => setTimeout(resolve, runtimeConfig.initialDelay!));
        }
        
        context.logger.info('='.repeat(60));
        context.logger.info('Starting scheduled Pixiv download plan', {
          scheduleId: schedule.id,
          targets: targets.map(target => target.id ?? target.tag ?? target.filterTag ?? target.type),
        });
        context.logger.info('='.repeat(60));
        
        const startTime = Date.now();
        try {
          await downloadManager.runAllTargets();
        } finally {
          if (activeDownloadManager === downloadManager) activeDownloadManager = null;
        }
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        context.logger.info('='.repeat(60));
        context.logger.info(`Scheduled download plan finished (took ${duration}s)`, {
          scheduleId: schedule.id,
        });
        context.logger.info('='.repeat(60));
      };

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
        execute: runJob,
        database,
        telemetry: {
        beginRun: () => database.getOverviewStats().totalDownloads,
          endRun: () => database.getOverviewStats().totalDownloads,
          requestCancel: (reason) => activeDownloadManager?.cancel(reason),
        },
      });
      const status = manager.start(config);

      const cleanup = () => {
        context.logger.info('Shutting down PixivFlow');
        manager.stop();
        activeDownloadManager?.cancel('process shutdown');
        if (tokenMaintenance) {
          tokenMaintenance.stop();
        }
        database.close();
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



















































