/**
 * Shared runtime for scheduler commands.
 *
 * Both the long-running `scheduler` daemon and the one-shot `scheduler
 * run-once` (refetch) command build the exact same download machinery, so a
 * refetch behaves identically to a scheduled run: same config resolution,
 * same token maintenance, same target selection, same dedupe and delivery.
 */

import { getConfigPath, loadConfig, ScheduleConfig, StandaloneConfig, TargetConfig } from '../config';
import { Database, isolateCorruptDatabase } from '../storage/Database';
import { PixivAuth } from '../auth/PixivAuth';
import { createPixivFlowClient } from '../pixiv-client/createPixivFlowClient';
import type { IPixivClient } from '../interfaces/IPixivClient';
import { FileService } from '../download/FileService';
import { DownloadManager } from '../download/DownloadManager';
import { DeliveryDispatcher } from '../delivery/DeliveryDispatcher';
import { createTokenMaintenanceService } from '../utils/token-maintenance';
import { selectScheduleTargets } from '../scheduler/schedules';
import {
  SLOT_HEARTBEAT_MS,
  SLOT_LEASE_TTL_MS,
  SlotContext,
  SlotCoordinator,
} from '../scheduler/SlotCoordinator';
import { TargetOutcome } from '../scheduler/TargetOutcome';
import { DeliveryService } from '../delivery/DeliveryService';
import { OutboxWorker } from '../delivery/OutboxWorker';
import { migrateLegacyOutbox } from '../delivery/LegacyOutboxMigration';
import { DeliveryAck } from '../delivery/DeliveryAck';
import { NotificationPolicy } from '../notification/NotificationPolicy';
import { randomUUID } from 'node:crypto';
import { ScheduleRunOptions, TriggerSource } from '../scheduler/OccurrenceResolver';
import { JobFailure } from '../scheduler/Scheduler';
import { processConfigPlaceholders } from '../config/placeholders';
import { logger } from '../logger';
import { BUILD } from '../version';

/** Options for a single schedule run; see ScheduleRunOptions for semantics. */
export type RunJobOptions = ScheduleRunOptions;

export interface SchedulerRuntime {
  config: StandaloneConfig;
  database: Database;
  pixivClient: IPixivClient;
  fileService: FileService;
  tokenMaintenance: ReturnType<typeof createTokenMaintenanceService>;
  /** Run one schedule's enabled targets once (the same job the cron fires). */
  runJob(snapshot: StandaloneConfig, schedule: ScheduleConfig, options?: RunJobOptions): Promise<void>;
  /** Cancel the in-flight download plan, if any. */
  cancelActive(reason: string): void;
  /**
   * The active run never settled after its timeout and drain window. Stop
   * renewing its lease and take its Slot terminal so recovery cannot re-dispatch
   * the same occurrence alongside the still-running job.
   */
  abandonActiveRun(reason: string): void;
  /** Notify the affected review group after a failed scheduled run. */
  notifyScheduleFailure(
    snapshot: StandaloneConfig,
    schedule: ScheduleConfig,
    failure: JobFailure
  ): Promise<void>;
  /** Start the independent outbox pump (long-running daemon). */
  startOutboxWorker(): void;
  /** Drain due outbox rows once (run-once / watchdog wake). */
  drainOutbox(): Promise<{ processed: number; done: number; retried: number; dead: number }>;
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
function openDatabaseWithRecovery(databasePath: string): { database: Database; recoveryNote?: string; degraded: boolean } {
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
      recoveryNote: `数据库无法打开（${message}），已隔离损坏文件 ${isolated} 并重建空库；已进入降级模式：自动选择/投递已暂停，请执行 doctor --repair 或确认历史后再恢复，以避免空库重复发布。`,
      degraded: true,
    };
  }

  const check = database.checkIntegrity();
  if (check === 'ok') {
    database.migrate();
    return { database, degraded: false };
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
    recoveryNote: `数据库完整性检查未通过（${message}），已隔离损坏文件 ${isolated} 并重建空库；已进入降级模式：自动选择/投递已暂停，请运行 pixivflow doctor --repair / reconcile 确认历史后再恢复，以避免空库批量重复发布。`,
    degraded: true,
  };
}

async function notifyDeliveryTargets(
  config: StandaloneConfig,
  database: Database,
  targetNames: Iterable<string>,
  text: string,
  key: string
): Promise<void> {
  const delivery = config.delivery;
  const notifyable = [...new Set(targetNames)].filter(
    (name) => delivery?.targets?.[name]?.notificationUrl?.trim()
  );
  if (notifyable.length === 0) return;

  // Notifications are durable SQLite outbox rows (kind=notification), pumped by
  // the OutboxWorker — never fire-and-forget, never swallowed silently.
  try {
    const { DeliveryService } = await import('../delivery/DeliveryService');
    const service = new DeliveryService(database);
    for (const name of notifyable) {
      service.enqueueNotification(name, text, key);
    }
  } catch (error) {
    logger.warn('Failed to enqueue delivery notification', { error });
  }
}

/** Best-effort: alert every delivery target that exposes a notificationUrl. */
async function notifyRecovery(config: StandaloneConfig, database: Database, note: string): Promise<void> {
  const targetNames = Object.keys(config.delivery?.targets ?? {});
  await notifyDeliveryTargets(
    config,
    database,
    targetNames,
    `⚠️ PixivFlow 数据库自检未通过，已自动隔离并重建\n${note}`,
    `pixivflow:db-recovery:${new Date().toISOString().slice(0, 10)}`
  );
}

export async function notifyScheduleFailure(
    config: StandaloneConfig,
    database: Database,
    schedule: ScheduleConfig,
    failure: JobFailure
  ): Promise<void> {
  const targetNames = selectScheduleTargets(config.targets, schedule)
    .map((target) => target.delivery?.target?.trim())
    .filter((name): name is string => Boolean(name));
  const status = failure.status === 'timeout' ? '超时' : '失败';
  const stopped = failure.stopped
    ? '\n计划已达到连续失败上限并自动停止，请检查后重载配置或重启进程。'
    : '';
  const error = failure.errorMessage ? `\n错误：${failure.errorMessage.slice(0, 500)}` : '';
  await notifyDeliveryTargets(
    config,
    database,
    targetNames,
    `⚠️ PixivFlow 定时任务${status}\n计划：${schedule.name?.trim() || schedule.id}` +
      `\n连续失败：${failure.consecutiveFailures}${error}${stopped}`,
    `pixivflow:schedule-failure:${schedule.id}:${failure.executionNumber}`
  );
}

function buildProxyUrl(network: StandaloneConfig['network']): string | undefined {
  const proxy = network?.proxy;
  if (!proxy?.enabled) return undefined;
  const protocol = proxy.protocol ?? 'http';
  if (protocol !== 'http' && protocol !== 'https') return undefined;
  const auth = proxy.username ? `${proxy.username}:${proxy.password ?? ''}@` : '';
  return `${protocol}://${auth}${proxy.host}:${proxy.port}`;
}

export async function createSchedulerRuntime(configPathArg?: string): Promise<SchedulerRuntime> {
  logger.info('PixivFlow runtime starting', { component: 'pixivflow', version: BUILD.version, commit: BUILD.commit });
  // Keep TODAY/YESTERDAY placeholders intact. They are resolved afresh for
  // every plan execution, not frozen at daemon startup.
  const configPath = getConfigPath(configPathArg);
  const config = loadConfig(configPath, false, false);

  const databasePath = config.storage!.databasePath!;
  const { database, recoveryNote, degraded } = openDatabaseWithRecovery(databasePath);
  // One-time, idempotent import of any file-based outbox manifests. Safe to run
  // every start: committed rows are archived; a crash mid-way resumes here.
  migrateLegacyOutbox(database);
  if (recoveryNote) {
    await notifyRecovery(config, database, recoveryNote);
  }

  const auth = new PixivAuth(config.pixiv, config.network!, database, configPath);
  const pixivClient = createPixivFlowClient(auth, config, database);
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
  /**
   * Lease bookkeeping of the run that currently owns a Slot, exposed to
   * cancelActive()/abandonActiveRun() (defined below, outside runJob's closure).
   * Set while a lease is held and cleared as soon as it is released.
   */
  let activeLeaseHooks: { stopHeartbeat(): void; abandon(reason: string): void } | null = null;

  // Independently-pumped durable outbox (content + notifications). Started in
  // the long-running scheduler daemon; run-once drains explicitly before exit.
  const deliveryDispatcher = new DeliveryDispatcher(config.delivery, buildProxyUrl(config.network));
  const outboxWorker = new OutboxWorker(database, deliveryDispatcher, {
    retryBaseMs: config.delivery?.outboxRetryBaseMs,
    retryMaxMs: config.delivery?.outboxRetryMaxMs,
    // A confirmed ACK promotes the delivery_pending cell to submitted.
    onDeliveryTerminal: (deliveryId, ack) => {
      const row = database.deliveries.getById(deliveryId);
      if (!row || !row.slotId || !row.targetId) return;
      if (ack.kind === 'duplicate_existing') {
        const coord = new SlotCoordinator(database);
        coord.applyOutcome(row.slotId, row.targetId, {
          kind: 'duplicate',
          workId: row.pixivId,
          reason: 'downstream attested historical duplicate',
        });
        return;
      }
      const coord = new SlotCoordinator(database);
      coord.markDelivered(row.slotId, row.targetId, row.pixivId, row.workType as 'illustration' | 'novel');
    },
  });
  const notificationPolicy = new NotificationPolicy(database, config);

  const runJob = async (
    snapshot: StandaloneConfig,
    schedule: ScheduleConfig,
    options: RunJobOptions = {}
  ): Promise<void> => {
    const { onlyTarget, adhoc = false, slot: providedSlot } = options;
    // A scheduled run is cron by default; an HTTP/manual trigger passes its own.
    const triggerSource: TriggerSource = options.triggerSource ?? 'cron';

    const runtimeConfig = processConfigPlaceholders(snapshot);
    let targets = selectScheduleTargets(runtimeConfig.targets, schedule);
    if (onlyTarget) {
      // "重抓/换一张" 只重跑产生该审核的那一个 target。
      targets = targets.filter((t) => t.id === onlyTarget);
    }

    if (targets.length === 0) {
      logger.warn('Scheduled plan has no selected targets; skipping', {
        scheduleId: schedule.id,
        targetIds: schedule.targetIds,
      });
      return;
    }

    const coordinator = new SlotCoordinator(database);

    // Ad-hoc/manual execution (run-once / explicit refetch) runs the download
    // plan WITHOUT a scheduled Slot: it can never mark a scheduled occurrence
    // complete or be resumed as one. Scheduled runs (cron/http/catchup) always
    // resolve a canonical occurrence and converge on one durable Slot.
    let slotCtx: SlotContext | null = null;
    let varReleaseLease: (() => void) | null = null;
    /**
     * Set when the run was abandoned past its drain window. A wedged job can
     * still return much later; it must not roll the slot up again (which would
     * overwrite the terminal `failed` record the abandon path wrote).
     */
    let slotAbandoned = false;
    if (!adhoc) {
      if (providedSlot) {
        slotCtx = providedSlot;
      } else {
        // Internal cron tick / catch-up: resolve the canonical occurrence from
        // the schedule's own cron + timezone (never the server local tz).
        const resolved = coordinator.resolveOccurrence(schedule, runtimeConfig, triggerSource);
        if (!resolved.context) {
          logger.warn('Skipping scheduled run: occurrence not resolvable', {
            scheduleId: schedule.id,
            error: resolved.error,
          });
          return;
        }
        slotCtx = resolved.context;
      }

      const activeSlot = slotCtx!;
      const runOwner = `run-${process.pid}-${randomUUID().slice(0, 8)}`;
      const prepared = coordinator.prepare(slotCtx, schedule, targets);
      if (prepared.alreadyCompleted && !onlyTarget) {
        logger.info('Slot already terminal; nothing to do', {
          slot: activeSlot.slotId,
          status: prepared.slotRec.status,
        });
        return;
      }
      // Cross-process lease: a concurrent Cloudflare + watchdog + manual
      // trigger on a SECOND process sees an active lease and converges instead
      // of running the same targets in parallel. The lease TTL bounds how long a
      // DEAD worker blocks its slot; it is intentionally independent of
      // schedule.timeout (which bounds how long a live run may take).
      const claimed = coordinator.claimRunLease(activeSlot.slotId, runOwner, SLOT_LEASE_TTL_MS);
      if (!claimed) {
        const lease = database.slots.getSlotLease(activeSlot.slotId);
        logger.info('Slot run already leased by another worker; converging', {
          slot: activeSlot.slotId,
          leaseOwner: lease.owner,
        });
        // Resume-only: the OutboxWorker drains pending deliveries; do not run
        // candidate selection again. Drain due rows and return.
        await outboxWorker.drainOnce(1);
        return;
      }
      // Only the process that actually owns the lease may report the slot as
      // running; the accepting adapter records it as pending instead.
      coordinator.markRunning(activeSlot.slotId);
      let cancelled = false;
      const heartbeat = setInterval(() => {
        // A cancelled/timed-out run must stop renewing its lease. An infinitely
        // renewed lease is precisely what made a wedged run unrecoverable: the
        // heartbeat outlived the scheduler timeout, so no other worker could ever
        // claim the slot and the occurrence stayed stuck in `running` forever.
        if (cancelled) {
          clearInterval(heartbeat);
          return;
        }
        coordinator.heartbeatLease(activeSlot.slotId, runOwner, SLOT_LEASE_TTL_MS);
      }, SLOT_HEARTBEAT_MS);
      heartbeat.unref?.();
      varReleaseLease = () => {
        clearInterval(heartbeat);
        activeLeaseHooks = null;
        coordinator.releaseRunLease(activeSlot.slotId, runOwner);
      };
      activeLeaseHooks = {
        stopHeartbeat: () => {
          cancelled = true;
          clearInterval(heartbeat);
        },
        /**
         * The run will never settle: stop heart-beating AND leave the ledger
         * terminal, so the recovery sweep (which only acts on `pending`/`running`
         * slots with no live lease) cannot re-dispatch this occurrence next to a
         * still-running job. Merely dropping the lease would be wrong here —
         * unlike a crash, this worker is alive.
         */
        abandon: (reason: string) => {
          cancelled = true;
          slotAbandoned = true;
          clearInterval(heartbeat);
          database.slots.markSlotStatus(
            activeSlot.slotId,
            'failed',
            `abandoned after scheduler timeout; no delivery (${reason})`
          );
          coordinator.releaseRunLease(activeSlot.slotId, runOwner);
          activeLeaseHooks = null;
        },
      };
    }

    // For a scheduled run, skip cells already in a terminal state (resume never
    // re-runs a finished cell — that is what prevents a second post). Membership
    // comes from the materialized snapshot, so a config reload cannot add cells.
    const pending = slotCtx ? coordinator.pendingTargets(slotCtx.slotId, targets) : targets.map((target) => ({ target, cell: null }));
    let runTargets = (onlyTarget ? pending.filter((p) => p.target.id === onlyTarget) : pending).map((p) => p.target);

    if (slotCtx && runTargets.length === 0) {
      logger.info('All slot cells already complete', { slot: slotCtx.slotId });
      coordinator.finish(slotCtx, schedule, targets);
      // Release LAST: the slot must stay owned until its aggregate state has
      // been rolled up, otherwise a concurrent trigger could claim and re-run it
      // against a half-finished ledger.
      varReleaseLease?.();
      return;
    }
    // Ad-hoc refetch with a filter that matched no target (or all filtered out):
    // nothing to do; no Slot to finish.
    if (runTargets.length === 0) return;

    const executionContext = slotCtx
      ? {
          slotId: slotCtx.slotId,
          slotName: slotCtx.slotName,
          slotDate: slotCtx.slotDate,
          scheduleId: slotCtx.scheduleId,
          occurrenceAt: slotCtx.occurrenceAt,
          occurrenceAtIso: new Date(slotCtx.occurrenceAt).toISOString(),
          triggerSource: slotCtx.triggerSource,
        }
      : undefined;

    const scopedConfig: StandaloneConfig = {
      ...runtimeConfig,
      targets: runTargets.map((t) => ({
        ...t,
        delivery: t.delivery
          ? { ...t.delivery, slotContext: slotCtx ?? undefined, executionContext }
          : t.delivery,
      })),
    };
    const downloadManager = new DownloadManager(scopedConfig, pixivClient, database, fileService);
    activeDownloadManager = downloadManager;
    await downloadManager.initialise();

    if (slotCtx) {
      const slot = slotCtx; // stable for callbacks
      // TYPED outcome -> explicit FSM transition. No message regex, no
      // "no throw => submitted". Only a confirmed ACK yields 'submitted'.
      downloadManager.setTargetOutcomeHook((target, outcome: TargetOutcome) => {
        if (!target.id) return;
        coordinator.applyOutcome(slot.slotId, target.id, outcome);
        notificationPolicy.noteOutcome(slot.slotId, slot, schedule, target, outcome);
      });
      downloadManager.slotContext = {
        slotId: slot.slotId,
        scheduleId: slot.scheduleId,
        occurrenceAtIso: new Date(slot.occurrenceAt).toISOString(),
        triggerSource: slot.triggerSource,
        slotName: slot.slotName,
        slotDate: slot.slotDate,
      };
    }

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
      slot: slotCtx?.slotId ?? '(ad-hoc)',
      trigger: triggerSource,
      targets: runTargets.map((target) => target.id ?? target.tag ?? target.filterTag ?? target.type),
    });
    logger.info('='.repeat(60));

    const startTime = Date.now();
    let allTargetsFailed: Error | undefined;
    let releaseLease: () => void = () => undefined;
    if (slotCtx && varReleaseLease) releaseLease = varReleaseLease;
    try {
      await downloadManager.runAllTargets();
    } catch (error) {
      if (!slotCtx || !(error instanceof Error) || !/^All \d+ target\(s\) failed\./.test(error.message)) {
        // Abnormal abort: no roll-up is possible, so hand the slot back now
        // instead of holding it until the lease TTL expires. Recovery sees a
        // non-terminal slot with no live lease and resumes the SAME occurrence.
        releaseLease?.();
        throw error;
      }
      // Scheduled Slots treat terminal target failures (failed/no_candidate) as
      // a finished partial/failed aggregate. Finish before returning so the HTTP
      // trigger can report the durable state instead of 500 and never roll up.
      allTargetsFailed = error;
    } finally {
      if (activeDownloadManager === downloadManager) activeDownloadManager = null;
    }
    const duration = Math.round((Date.now() - startTime) / 1000);

    if (slotCtx && !slotAbandoned) {
      const summary = coordinator.finish(slotCtx, schedule, targets);
      notificationPolicy.sendSlotSummary(
        slotCtx,
        schedule,
        summary.cells.map((c) => {
          const t = targets.find((x) => x.id === c.targetId);
          return {
            targetId: c.targetId,
            label: c.targetId,
            workType: t?.type ?? 'unknown',
            status: c.status,
            workId: c.workId,
            error: c.error ?? null,
          };
        })
      );
      releaseLease();
    }
    if (!slotCtx && allTargetsFailed) throw allTargetsFailed;

    logger.info('='.repeat(60));
    logger.info(`Scheduled download plan finished (took ${duration}s)`, {
      scheduleId: schedule.id,
      slot: slotCtx?.slotId ?? '(ad-hoc)',
    });
    logger.info('='.repeat(60));
  };

  const cancelActive = (reason: string): void => {
    activeDownloadManager?.cancel(reason);
    // Scheduler timeout / process shutdown also stop the lease heartbeat. The run
    // is on its way out (or about to be killed with the process), so it must not
    // keep the slot locked while it unwinds. A shutdown deliberately leaves the
    // slot NON-terminal: recovery resumes the same occurrence after restart.
    activeLeaseHooks?.stopHeartbeat();
  };

  const abandonActiveRun = (reason: string): void => {
    // Cancellation did not take effect inside the drain window — a request that
    // ignores the abort. This run will never settle, so finish the lease
    // bookkeeping it cannot do itself.
    activeLeaseHooks?.abandon(reason);
  };

  const close = (): void => {
    outboxWorker.stop();
    cancelActive('process shutdown');
    if (tokenMaintenance) {
      tokenMaintenance.stop();
    }
    database.close();
  };

  return {
    config,
    database,
    pixivClient,
    fileService,
    tokenMaintenance,
    runJob,
    cancelActive,
    abandonActiveRun,
    startOutboxWorker: () => outboxWorker.start(),
    drainOutbox: () => outboxWorker.drainOnce(),
    notifyScheduleFailure: (snapshot, schedule, failure) =>
      notifyScheduleFailure(snapshot, database, schedule, failure),
    close,
  };
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
