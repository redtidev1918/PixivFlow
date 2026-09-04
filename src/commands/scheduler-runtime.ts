/**
 * Shared runtime for scheduler commands.
 *
 * Both the long-running `scheduler` daemon and the one-shot `scheduler
 * run-once` (refetch) command build the exact same download machinery, so a
 * refetch behaves identically to a scheduled run: same config resolution,
 * same token maintenance, same target selection, same dedupe and delivery.
 */

import { dirname, join } from 'node:path';

import { getConfigPath, loadConfig, ScheduleConfig, StandaloneConfig, TargetConfig } from '../config';
import { Database, isolateCorruptDatabase } from '../storage/Database';
import { PixivAuth } from '../pixiv/AuthClient';
import { PixivClient } from '../pixiv/PixivClient';
import { FileService } from '../download/FileService';
import { DownloadManager } from '../download/DownloadManager';
import { DeliveryDispatcher } from '../delivery/DeliveryDispatcher';
import { DeliveryOutbox } from '../delivery/DeliveryOutbox';
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
  runJob(snapshot: StandaloneConfig, schedule: ScheduleConfig, targetFilter?: string): Promise<void>;
  /** Cancel the in-flight download plan, if any. */
  cancelActive(reason: string): void;
  /** Stop token maintenance, cancel any in-flight download and close the DB. */
  close(): void;
}

/**
 * Open the pixivflow database with a startup integrity check. A structurally
 * corrupt file (quick_check failure) is isolated aside and replaced with a
 * fresh database so the daemon keeps serving — download history resets, which
 * the caller surfaces to the review group. Schema/migration errors are NOT
 * treated as corruption and propagate normally.
 */
function openDatabaseWithRecovery(databasePath: string): { database: Database; recoveryNote?: string } {
  const openFresh = (): Database => {
    const db = new Database(databasePath);
    db.migrate();
    return db;
  };

  let database: Database;
  try {
    database = new Database(databasePath);
  } catch (error) {
    // Cannot even open the file (e.g. corrupt header). Isolate and recreate.
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Database failed to open; isolating file and recreating', { databasePath, error: message });
    const isolated = isolateCorruptDatabase(databasePath);
    database = openFresh();
    return {
      database,
      recoveryNote: `数据库无法打开（${message}），已隔离损坏文件 ${isolated} 并重建空库；下载去重记录已重置，将重新下载近期作品。`,
    };
  }

  const check = database.checkIntegrity();
  if (check === 'ok') {
    database.migrate();
    return { database };
  }

  // Structurally corrupt: isolate (preserving evidence) and recreate fresh.
  const message = check.slice(0, 200);
  logger.error('Database integrity check failed; isolating corrupt file and recreating', {
    databasePath,
    error: message,
  });
  database.close();
  let isolated = `${databasePath}.corrupt`;
  try {
    isolated = isolateCorruptDatabase(databasePath);
  } catch (isolateError) {
    logger.error('Failed to isolate corrupt database file', { error: isolateError });
  }
  database = openFresh();
  return {
    database,
    recoveryNote: `数据库完整性检查未通过（${message}），已隔离损坏文件 ${isolated} 并重建空库；下载去重记录已重置，将重新下载近期作品。`,
  };
}

/** Best-effort: alert every delivery target that exposes a notificationUrl. */
async function notifyRecovery(config: StandaloneConfig, databasePath: string, note: string): Promise<void> {
  const delivery = config.delivery;
  const targets = delivery?.targets ?? {};
  const notifyable = Object.entries(targets).filter(([, t]) => t.notificationUrl?.trim());
  if (notifyable.length === 0) return;

  try {
    const dispatcher = new DeliveryDispatcher(delivery, undefined);
    const outbox = new DeliveryOutbox(
      join(dirname(databasePath), 'delivery-outbox'),
      dispatcher,
      delivery?.deleteAfterDelivery !== false
    );
    const text = `⚠️ PixivFlow 数据库自检未通过，已自动隔离并重建\n${note}`;
    const key = `pixivflow:db-recovery:${new Date().toISOString().slice(0, 10)}`;
    for (const [name] of notifyable) {
      try {
        const syntheticTarget = { type: 'novel', delivery: { target: name } } as unknown as TargetConfig;
        await outbox.notifyNoMatch(syntheticTarget, text, key);
      } catch (error) {
        logger.warn('Recovery notification failed for delivery target', { target: name, error });
      }
    }
  } catch (error) {
    logger.warn('Failed to build recovery notification', { error });
  }
}

export async function createSchedulerRuntime(configPathArg?: string): Promise<SchedulerRuntime> {
  // Keep TODAY/YESTERDAY placeholders intact. They are resolved afresh for
  // every plan execution, not frozen at daemon startup.
  const configPath = getConfigPath(configPathArg);
  const config = loadConfig(configPath, false, false);

  const databasePath = config.storage!.databasePath!;
  const { database, recoveryNote } = openDatabaseWithRecovery(databasePath);
  if (recoveryNote) {
    await notifyRecovery(config, databasePath, recoveryNote);
  }

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

  const runJob = async (snapshot: StandaloneConfig, schedule: ScheduleConfig, targetFilter?: string): Promise<void> => {
    const runtimeConfig = processConfigPlaceholders(snapshot);
    let targets = selectScheduleTargets(runtimeConfig.targets, schedule);
    if (targetFilter) {
      // "重抓/换一张" 只重跑产生该审核的那一个 target。
      targets = targets.filter((t) => t.id === targetFilter);
    }
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

/**
 * Watchdog for a single plan run (used by `run-once`; the daemon's cron runs
 * are already guarded by the Scheduler timeout). On expiry the in-flight
 * download is cancelled and the run rejects so the caller can report failure
 * instead of hanging forever.
 */
export function runWithTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  label: string
): Promise<T> {
  // If the watchdog wins the race, the original task settles later (after the
  // cancellation drains); swallow that rejection so it is not unhandled.
  task.catch(() => undefined);
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`${label}: run exceeded ${timeoutMs}ms watchdog; download cancelled`));
    }, timeoutMs);
  });
  return Promise.race([task, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
