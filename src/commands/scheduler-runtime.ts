/**
 * Shared runtime for scheduler commands.
 *
 * Both the long-running `scheduler` daemon and the one-shot `scheduler
 * run-once` (refetch) command build the exact same download machinery, so a
 * refetch behaves identically to a scheduled run: same config resolution,
 * same token maintenance, same target selection, same dedupe and delivery.
 */

import { getConfigPath, loadConfig, ScheduleConfig, StandaloneConfig } from '../config';
import { Database } from '../storage/Database';
import { PixivAuth } from '../pixiv/AuthClient';
import { PixivClient } from '../pixiv/PixivClient';
import { FileService } from '../download/FileService';
import { DownloadManager } from '../download/DownloadManager';
import { createTokenMaintenanceService } from '../utils/token-maintenance';
import { selectScheduleTargets } from '../scheduler/schedules';
import { processConfigPlaceholders } from '../config/placeholders';
import { logger } from '../logger';

export interface SchedulerRuntime {
  config: StandaloneConfig;
  database: Database;
  pixivClient: PixivClient;
  fileService: FileService;
  tokenMaintenance: ReturnType<typeof createTokenMaintenanceService>;
  /** Run one schedule's enabled targets once (the same job the cron fires). */
  runJob(snapshot: StandaloneConfig, schedule: ScheduleConfig): Promise<void>;
  /** Cancel the in-flight download plan, if any. */
  cancelActive(reason: string): void;
  /** Stop token maintenance, cancel any in-flight download and close the DB. */
  close(): void;
}

export async function createSchedulerRuntime(configPathArg?: string): Promise<SchedulerRuntime> {
  // Keep TODAY/YESTERDAY placeholders intact. They are resolved afresh for
  // every plan execution, not frozen at daemon startup.
  const configPath = getConfigPath(configPathArg);
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

  const runJob = async (snapshot: StandaloneConfig, schedule: ScheduleConfig): Promise<void> => {
    const runtimeConfig = processConfigPlaceholders(snapshot);
    const targets = selectScheduleTargets(runtimeConfig.targets, schedule);
    const scopedConfig: StandaloneConfig = { ...runtimeConfig, targets };

    if (targets.length === 0) {
      logger.warn('Scheduled plan has no selected targets; skipping', {
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
      logger.info(`Waiting ${runtimeConfig.initialDelay}ms before starting download...`, {
        scheduleId: schedule.id,
      });
      await new Promise((resolve) => setTimeout(resolve, runtimeConfig.initialDelay!));
    }

    logger.info('='.repeat(60));
    logger.info('Starting scheduled Pixiv download plan', {
      scheduleId: schedule.id,
      targets: targets.map((target) => target.id ?? target.tag ?? target.filterTag ?? target.type),
    });
    logger.info('='.repeat(60));

    const startTime = Date.now();
    try {
      await downloadManager.runAllTargets();
    } finally {
      if (activeDownloadManager === downloadManager) activeDownloadManager = null;
    }
    const duration = Math.round((Date.now() - startTime) / 1000);

    logger.info('='.repeat(60));
    logger.info(`Scheduled download plan finished (took ${duration}s)`, {
      scheduleId: schedule.id,
    });
    logger.info('='.repeat(60));
  };

  const cancelActive = (reason: string): void => {
    activeDownloadManager?.cancel(reason);
  };

  const close = (): void => {
    cancelActive('process shutdown');
    if (tokenMaintenance) {
      tokenMaintenance.stop();
    }
    database.close();
  };

  return { config, database, pixivClient, fileService, tokenMaintenance, runJob, cancelActive, close };
}
