/**
 * Scheduler command
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { getConfigPath, loadConfig, StandaloneConfig } from '../config';
import { MultiScheduleManager } from '../scheduler/MultiScheduleManager';
import { ScheduleTriggerServer, TriggerRunResult } from '../scheduler/ScheduleTriggerServer';
import { SlotCoordinator } from '../scheduler/SlotCoordinator';
import { selectScheduleTargets } from '../scheduler/schedules';
import { createSchedulerRuntime } from './scheduler-runtime';
import { SchedulerIdleLifecycle } from './SchedulerIdleLifecycle';

/**
 * Decide whether the authenticated HTTP trigger server should be mounted. It is
 * always up in `external` mode (the external clock needs it); in `internal`
 * mode it is opt-in via `schedulerRuntime.trigger.enabled` for manual/ops
 * triggers. HTTP trigger is an independent adapter from wall-clock ownership.
 */
function triggerEnabled(config: StandaloneConfig): boolean {
  if (config.schedulerRuntime?.mode === 'external') return true;
  return config.schedulerRuntime?.trigger?.enabled === true;
}

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
        onAbandoned: (_config, _schedule, abandoned) =>
          runtime.abandonActiveRun(abandoned.errorMessage ?? 'abandoned after timeout'),
        telemetry: {
          beginRun: () => runtime.database.getOverviewStats().totalDownloads,
          endRun: () => runtime.database.getOverviewStats().totalDownloads,
          // `timeout`: the daemon stays alive, so the run's Slot must be taken
          // terminal (the abort path does that) instead of staying recoverable.
          requestCancel: (reason) => runtime.cancelActive(reason, 'timeout'),
        },
      });
      const status = manager.start(runtime.config);

      // Independent outbox pump: deliveries/notifications retry promptly on a
      // timer and resume after crash/machine-stop without waiting for the next
      // scheduled run. It never gates Telegram/scheduler readiness.
      runtime.startOutboxWorker();

      // Authenticated HTTP trigger. Mounted in external mode (the external clock
      // wakes the machine here) and, opt-in, in internal mode for manual/ops
      // triggers. Business logic lives in runJob/SlotCoordinator; this handler
      // only authenticates, records the occurrence durably and hands it to the
      // shared scheduler, then answers. It deliberately does not await the run:
      // the open request is NOT an activity lease, and a 10-40 minute download
      // would outlive the clock/proxy/client timeout carrying it.
      let triggerServer: ScheduleTriggerServer | null = null;
      if (triggerEnabled(runtime.config)) {
        const rt = runtime.config.schedulerRuntime!;
        const coordinator = new SlotCoordinator(runtime.database);
        const resolveConfig = (): StandaloneConfig => manager['activeConfig'] ?? runtime.config;
        const findPlan = (cfg: StandaloneConfig, scheduleId: string) =>
          cfg.schedules?.find((s) => s.id === scheduleId && s.enabled !== false);

        // Durable dispatch. The trigger endpoint records the occurrence FIRST,
        // then hands it to the shared scheduler and answers immediately. It must
        // never await the download itself: a 10-40 minute run outlives the
        // router/proxy/clock timeouts, and a request that dies mid-run used to
        // take the occurrence with it. Idempotency comes from the slot ledger and
        // the cross-process lease, so concurrent clocks (Cloudflare + watchdog +
        // manual) converge on one worker instead of needing an in-process
        // singleflight map.
        triggerServer = new ScheduleTriggerServer(
          ScheduleTriggerServer.resolveToken(rt.trigger?.token),
          {
            listSchedules: () => manager.scheduleIds(),
            resolve: (scheduleId, source, at, label) => {
              const cfg = resolveConfig();
              const plan = findPlan(cfg, scheduleId);
              if (!plan) return { error: `unknown schedule: ${scheduleId}`, status: 404 };
              const resolved = coordinator.resolveOccurrence(plan, cfg, source, at, label);
              if (!resolved.context) return { error: resolved.error ?? 'could not resolve occurrence', status: resolved.status ?? 400 };
              return { context: resolved.context };
            },
            run: async (scheduleId, context): Promise<TriggerRunResult> => {
              const cfg = resolveConfig();
              const plan = findPlan(cfg, scheduleId);
              if (!plan) {
                return { scheduleId, slotId: context.slotId, disposition: 'rejected', status: 'failed' };
              }
              const targets = selectScheduleTargets(cfg.targets, plan);
              if (targets.length === 0) {
                return { scheduleId, slotId: context.slotId, disposition: 'rejected', status: 'pending' };
              }

              // Step 1: make the occurrence durable BEFORE answering. A crash
              // between here and the claim leaves a `pending`, lease-less row that
              // the recovery loop re-dispatches, so an accepted trigger can never
              // be silently dropped.
              const prepared = coordinator.prepare(context, plan, targets);
              if (prepared.alreadyCompleted) {
                return {
                  ...coordinator.completedSummary(context.slotId, plan),
                  disposition: 'already_completed',
                };
              }

              // Step 2: admit to the scheduler. Fire-and-forget by contract — the
              // boolean only reports whether this process took the work.
              const admitted = manager.triggerSchedule(scheduleId, {
                triggerSource: 'http',
                slot: context,
              });
              const rec = runtime.database.slots.getSlot(context.slotId);

              if (admitted) {
                return {
                  scheduleId,
                  slotId: context.slotId,
                  disposition: 'accepted',
                  status: rec?.status ?? 'pending',
                };
              }

              // Not admitted locally. A live lease means another worker already
              // owns the occurrence; anything else is a refusal this process could
              // not take (busy/stopped/limit), which the clock may retry and the
              // recovery loop will also pick up.
              const lease = runtime.database.slots.getSlotLease(context.slotId);
              if (lease.owner && lease.until && lease.until > Date.now()) {
                return {
                  scheduleId,
                  slotId: context.slotId,
                  disposition: 'already_running',
                  status: 'running',
                };
              }
              return {
                scheduleId,
                slotId: context.slotId,
                disposition: 'rejected',
                status: rec?.status ?? 'pending',
              };
            },
            drainOutbox: () => runtime.drainOutbox(),
            status: (scheduleId) => {
              const cfg = resolveConfig();
              const plan = findPlan(cfg, scheduleId);
              const resolved = plan ? coordinator.resolveOccurrence(plan, cfg, 'manual', new Date()) : null;
              const ctx = resolved && 'context' in resolved ? resolved.context : null;
              return {
                scheduleId,
                mode: rt.mode ?? 'internal',
                occurrence: ctx?.slotId ?? null,
              };
            },
          }
        );
        const port = rt.trigger?.port ?? (Number(process.env.PORT) || 8090);
        triggerServer.start(rt.trigger?.host ?? '0.0.0.0', port);
        context.logger.info(
          rt.mode === 'external'
            ? 'External scheduler mode: internal cron disabled, awaiting authenticated schedule triggers'
            : 'Internal scheduler mode with authenticated HTTP trigger enabled',
          { port }
        );
      }

      // Run-to-completion lifecycle for the external clock. The machine was woken
      // by a trigger and has to return to `stopped` by itself. Platform-side
      // auto-stop cannot decide that: the trigger answers long before the run
      // finishes, so the proxy sees an idle socket while downloads are still in
      // flight. The worker therefore reads its OWN durable ledger (see
      // SchedulerIdleLifecycle). Wired after the trigger server so the port is
      // already being served when the first idle probe runs.
      let idleLifecycle: SchedulerIdleLifecycle | null = null;

      const shutdown = (reason: string, code = 0) => {
        context.logger.info('Shutting down PixivFlow', { reason });
        idleLifecycle?.stop();
        triggerServer?.stop();
        manager.stop();
        runtime.close();
        process.exit(code);
      };

      const scheduling = runtime.config.schedulerRuntime;
      if (scheduling?.mode === 'external' && scheduling.exitWhenIdle) {
        idleLifecycle = new SchedulerIdleLifecycle({
          snapshot: () => {
            const outbox = runtime.database.outbox.counts();
            return {
              activeSlots: runtime.database.slots.countActiveSlots(),
              processingOutbox: outbox.processing,
              // `pending` covers pending + retry_wait: a delivery still backing
              // off is active work. Backoff is bounded (rows flip to `dead` once
              // attempts are exhausted, which does not block exit), so this
              // cannot hold the machine open indefinitely.
              pendingOutbox: outbox.pending,
            };
          },
          idleGraceMs: scheduling.idleGraceMs,
          maxLifetimeMs: scheduling.maxLifetimeMs,
          onExit: (reason) =>
            shutdown(
              reason === 'idle'
                ? 'external worker idle: slot ledger and outbox are both empty'
                : 'external worker exceeded the maxLifetimeMs backstop',
            ),
        });
        idleLifecycle.start();
      }

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
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