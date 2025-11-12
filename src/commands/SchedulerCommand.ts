/**
 * Scheduler command
 */

import { BaseCommand } from './Command';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { getConfigPath, loadConfig } from '../config';
import { Database } from '../storage/Database';
import { PixivAuth } from '../pixiv/AuthClient';
import { PixivClient } from '../pixiv/PixivClient';
import { FileService } from '../download/FileService';
import { DownloadManager } from '../download/DownloadManager';
import { Scheduler } from '../scheduler/Scheduler';
import { createTokenMaintenanceService } from '../utils/token-maintenance';

/**
 * Scheduler command - Start scheduler (default if enabled in config)
 */
export class SchedulerCommand extends BaseCommand {
  readonly name = 'scheduler';
  readonly description = 'Start scheduler (default if enabled in config)';
  readonly aliases: string[] = [];

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const configPath = getConfigPath();
      const config = loadConfig(configPath);

      const database = new Database(config.storage!.databasePath!);
      database.migrate();

      const auth = new PixivAuth(config.pixiv, config.network!, database, configPath);
      const pixivClient = new PixivClient(auth, config);
      const fileService = new FileService(config.storage!);
      const downloadManager = new DownloadManager(config, pixivClient, database, fileService);

      await downloadManager.initialise();

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

      const runJob = async () => {
        // Apply initial delay if configured
        if (config.initialDelay && config.initialDelay > 0) {
          context.logger.info(`Waiting ${config.initialDelay}ms before starting download...`);
          await new Promise(resolve => setTimeout(resolve, config.initialDelay!));
        }
        
        context.logger.info('='.repeat(60));
        context.logger.info('Starting scheduled Pixiv download job');
        context.logger.info('='.repeat(60));
        
        const startTime = Date.now();
        await downloadManager.runAllTargets();
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        context.logger.info('='.repeat(60));
        context.logger.info(`Scheduled download job finished (took ${duration}s)`);
        context.logger.info('='.repeat(60));
      };

      const scheduler = new Scheduler(config.scheduler!);
      scheduler.start(runJob);

      const cleanup = () => {
        context.logger.info('Shutting down PixivFlow');
        scheduler.stop();
        if (tokenMaintenance) {
          tokenMaintenance.stop();
        }
        database.close();
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      // Keep process alive
      return this.success('Scheduler started', { 
        message: 'Scheduler is running. Press Ctrl+C to stop.' 
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

  getUsage(): string {
    return `scheduler

Start the scheduler to run download jobs periodically according to config.

The scheduler will run download jobs based on the cron expression configured
in the config file. If scheduler is not enabled in config, this command will
still start but may not execute jobs.

Examples:
  pixivflow scheduler                          # Start scheduler`;
  }
}





















































