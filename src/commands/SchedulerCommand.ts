/**
 * Scheduler command
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { getConfigPath, loadConfig, StandaloneConfig } from '../config';
import { MultiScheduleManager } from '../scheduler/MultiScheduleManager';
import { ScheduleTriggerServer } from '../scheduler/ScheduleTriggerServer';
import { SlotCoordinator } from '../scheduler/SlotCoordinator';
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

      // External mode: expose the authenticated Slot trigger HTTP server. The
      // in-process cron is disabled (manager.init); runs arrive via POST only.
      let triggerServer: ScheduleTriggerServer | null = null;
      if (manager.isExternalMode(runtime.config)) {
        const rt = runtime.config.schedulerRuntime!;
        const coordinator = new SlotCoordinator(runtime.database);
        const resolveConfig = (): StandaloneConfig => manager['activeConfig'] ?? runtime.config;
        triggerServer = new ScheduleTriggerServer(
          ScheduleTriggerServer.resolveToken(rt.trigger?.token),
          {
            resolveSlot: (requested) => coordinator.resolveSlot(requested, resolveConfig()),
            runScheduleSlot: async (scheduleId, slotCtx) => {
              const cfg = resolveConfig();
              const plan = cfg.schedules?.find((s) => s.id === scheduleId);
              if (!plan) {
                return { scheduleId, slotId: slotCtx.slotId, status: 'failed', cells: [], alreadyCompleted: false };
              }
              const slot = { ...slotCtx, triggerSource: 'external' as const };
              const before = coordinator.begin(slot, plan);
              if (before.alreadyCompleted) {
                return coordinator.completedSummary(slot.slotId, plan);
              }
              // runJob performs begin/pendingTargets/finish against the ledger.
              await runtime.runJob(cfg, plan, slot);
              const rec = runtime.database.slots.getSlot(slot.slotId);
              const cells = runtime.database.slots.getCells(slot.slotId).map((c) => ({
                targetId: c.targetId,
                status: c.status,
                workId: c.workId,
                error: c.lastError,
              }));
              return {
                scheduleId,
                slotId: slot.slotId,
                status: rec?.status ?? 'failed',
                alreadyCompleted: false,
                cells,
              };
            },
            status: () => ({
              mode: 'external',
              schedules: manager.scheduleIds(),
            }),
          }
        );
        const port = rt.trigger?.port ?? (Number(process.env.PORT) || 8090);
        triggerServer.start(rt.trigger?.host ?? '0.0.0.0', port);
        context.logger.info('External scheduler mode: internal cron disabled, awaiting authenticated Slot triggers', { port });
      }

      const cleanup = () => {
        context.logger.info('Shutting down PixivFlow');
        triggerServer?.stop();
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
