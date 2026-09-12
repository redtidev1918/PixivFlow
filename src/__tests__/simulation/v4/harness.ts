/**
 * Canonical V4 simulation environment.
 *
 * This is the single harness for the simulation suite. It wires the REAL
 * production components and fakes only the four external boundaries:
 *
 *   fake clock          -> the occurrence instant is passed explicitly
 *   fake Pixiv provider -> FakePixivProvider (IPixivClient)
 *   fake Telegram API   -> FakeTelegramServer (real loopback HTTP)
 *   fake filesystem     -> a temporary root
 *
 * Everything in between is production code: SlotCoordinator, the Slot ledger,
 * DownloadManager, FileService, DeliveryService, the SQLite outbox,
 * OutboxWorker, DeliveryDispatcher, HttpMultipartDelivery, plus the real
 * TelePost HTTP stack and its ReviewService.
 *
 * The wiring mirrors `src/commands/scheduler-runtime.ts` so a passing
 * simulation means the production path passes.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IPixivClient } from '../../../interfaces/IPixivClient';
import type { ScheduleConfig, StandaloneConfig, TargetConfig } from '../../../config';
import { Database } from '../../../storage/Database';
import { SlotCoordinator, type SlotContext } from '../../../scheduler/SlotCoordinator';
import { DownloadManager } from '../../../download/DownloadManager';
import { FileService } from '../../../download/FileService';
import { DeliveryDispatcher } from '../../../delivery/DeliveryDispatcher';
import { OutboxWorker } from '../../../delivery/OutboxWorker';

import { FakeTelegramServer } from './fakeTelegram';
import { FakePixivProvider } from './fake-pixiv-provider';
import { SimTelepost } from './sim-telepost';
import { FlakySubmissionTransport, type SubmissionAttempt } from './flaky-transport';
import { TelepostControl, type TelepostReview } from './telepost-control';
import {
  buildSimConfig,
  buildSimSchedule,
  SIM_OCCURRENCE_AT,
  SIM_DELIVERY_TARGET,
  SIM_SCHEDULE_ID,
  SIM_TARGET_ID,
  type SimPaths,
} from './sim-config';
import {
  describeState,
  type CorrelationIdentity,
  type LedgerSnapshot,
  type ObservabilitySnapshot,
} from './correlation';
import { syntheticChatIds } from './synthetic';

export const DEFAULT_TELEPOST_ROOT = '/Users/hezzn/Documents/code/TelePost';

export interface SimulationOptions {
  /** TelePost checkout that provides `tests/simulation/sim_server.py`. */
  telepostRoot?: string;
  /** Override the interpreter (defaults to `<telepostRoot>/.venv/bin/python`). */
  pythonPath?: string;
  /** Synthetic media size; kept tiny on purpose. */
  mediaWidth?: number;
  mediaHeight?: number;
  /**
   * Route the delivery target through the loopback fault injector instead of
   * talking to TelePost directly. Off by default so the happy path keeps its
   * shortest wiring; the lost-ACK scenario turns it on and arms a drop.
   */
  lossyDeliveryTransport?: boolean;
}

export interface SlotRunResult {
  slotId: string;
  /** Cells the coordinator considered runnable for this occurrence. */
  pendingTargetCount: number;
  /** Whatever `OutboxWorker.drainOnce()` reported, verbatim. */
  drained: Record<string, unknown>;
  /** Terminal per-cell statuses after the run. */
  cells: Array<{ targetId: string; status: string; workId: string | null; error: string | null }>;
  /** Aggregate error from `runAllTargets()`, if the pipeline reported one. */
  runError: string | null;
  /** Durable outbox rows after the drain. */
  outboxRows: Array<Record<string, unknown>>;
}

export interface RunScheduledSlotOptions {
  /**
   * Drain the outbox as part of the run (default). A scenario that needs to
   * observe the outbox between attempts passes `false` and drains explicitly.
   */
  drain?: boolean;
  /** Settle the slot rollup at the end of the run (default). */
  finish?: boolean;
}

/**
 * One simulation instance. `start()` boots the external fakes and the real
 * TelePost stack; `close()` removes the temporary root and stops everything.
 */
export class V4Simulation {
  private constructor(
    private readonly options: Required<Pick<SimulationOptions, 'telepostRoot'>> & SimulationOptions,
    readonly paths: SimPaths,
    readonly telegram: FakeTelegramServer,
    readonly telepost: SimTelepost,
    readonly control: TelepostControl,
    readonly db: Database,
    readonly coordinator: SlotCoordinator,
    readonly pixiv: FakePixivProvider,
    readonly transport: FlakySubmissionTransport | null,
    config: StandaloneConfig,
    schedule: ScheduleConfig,
  ) {
    this.config = config;
    this.schedule = schedule;
  }

  readonly config: StandaloneConfig;
  readonly schedule: ScheduleConfig;

  private closed = false;
  private lastSlot: SlotContext | null = null;
  private lastRunError: string | null = null;

  static async start(options: SimulationOptions = {}): Promise<V4Simulation> {
    const telepostRoot = options.telepostRoot ?? DEFAULT_TELEPOST_ROOT;
    const root = mkdtempSync(join(tmpdir(), 'v4sim-'));
    const paths: SimPaths = {
      root,
      download: join(root, 'downloads'),
      illustration: join(root, 'downloads', 'illustrations'),
      novel: join(root, 'downloads', 'novels'),
      database: join(root, 'pixivflow.sqlite'),
    };
    for (const dir of [paths.download, paths.illustration, paths.novel]) {
      mkdirSync(dir, { recursive: true });
    }

    const telegram = new FakeTelegramServer();
    await telegram.start(0);

    const telepost = new SimTelepost({
      telepostRoot,
      pythonPath: options.pythonPath,
      dbPath: join(root, 'telepost.sqlite'),
      handshakePath: join(root, 'telepost-handshake.json'),
      telegramBaseUrl: telegram.baseUrl,
      telegramFileBaseUrl: telegram.fileBaseUrl,
    });

    try {
      const handle = await telepost.start();
      const control = new TelepostControl(handle.apiBase, handle.apiToken, handle.reviewToken);
      // The control plane always talks to TelePost directly: reads must never be
      // affected by the delivery fault injector.
      const transport = options.lossyDeliveryTransport
        ? new FlakySubmissionTransport(handle.apiBase)
        : null;
      if (transport) await transport.start(0);
      const config = buildSimConfig(paths, {
        telepostBaseUrl: transport ? transport.baseUrl : handle.apiBase,
        telepostApiToken: handle.apiToken,
      });
      const db = new Database(paths.database);
      db.migrate();
      const coordinator = new SlotCoordinator(db);
      const pixiv = new FakePixivProvider({
        width: options.mediaWidth,
        height: options.mediaHeight,
      });

      return new V4Simulation(
        { telepostRoot, ...options },
        paths,
        telegram,
        telepost,
        control,
        db,
        coordinator,
        pixiv,
        transport,
        config,
        buildSimSchedule(),
      );
    } catch (error) {
      await telepost.stop().catch(() => undefined);
      await telegram.stop().catch(() => undefined);
      rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }

  get slotId(): string {
    if (!this.lastSlot) throw new Error('no slot has been resolved yet');
    return this.lastSlot.slotId;
  }

  /** Resolve the canonical occurrence for the synthetic cron and instant. */
  resolveSlot(triggerSource: 'cron' | 'http' | 'manual' = 'cron'): SlotContext {
    const resolved = this.coordinator.resolveOccurrence(
      this.schedule,
      this.config,
      triggerSource,
      SIM_OCCURRENCE_AT,
    );
    if (!resolved.context) {
      throw new Error(`occurrence not resolved: ${resolved.error ?? 'unknown error'}`);
    }
    return resolved.context;
  }

  /**
   * Execute one scheduled occurrence end-to-end through production code.
   *
   * This is the harness's single entry point for "run the schedule": resolve ->
   * prepare -> lease -> markRunning -> real download pipeline -> real outbox ->
   * real multipart delivery -> real TelePost.
   */
  async runScheduledSlot(options: RunScheduledSlotOptions = {}): Promise<SlotRunResult> {
    const drain = options.drain ?? true;
    const finish = options.finish ?? true;
    const slot = this.resolveSlot('cron');
    this.lastSlot = slot;

    this.coordinator.prepare(slot, this.schedule, this.config.targets);
    const owner = `v4sim-${process.pid}`;
    this.coordinator.claimRunLease(slot.slotId, owner, 300_000);
    this.coordinator.markRunning(slot.slotId);

    const pending = this.coordinator.pendingTargets(slot.slotId, this.config.targets);
    const runTargets: TargetConfig[] = pending.map((entry) => entry.target);

    const executionContext = {
      slotId: slot.slotId,
      slotName: slot.slotName,
      slotDate: slot.slotDate,
      scheduleId: slot.scheduleId,
      occurrenceAt: slot.occurrenceAt,
      occurrenceAtIso: new Date(slot.occurrenceAt).toISOString(),
      triggerSource: slot.triggerSource,
    };

    const scopedConfig: StandaloneConfig = {
      ...this.config,
      targets: runTargets.map((target) => ({
        ...target,
        delivery: target.delivery
          ? { ...target.delivery, slotContext: slot, executionContext }
          : target.delivery,
      })),
    };

    const manager = new DownloadManager(
      scopedConfig,
      this.pixiv as unknown as IPixivClient,
      this.db,
      new FileService(scopedConfig.storage ?? this.config.storage!),
    );
    manager.setTargetOutcomeHook((target, outcome) => {
      if (!target.id) return;
      this.coordinator.applyOutcome(slot.slotId, target.id, outcome);
    });
    manager.slotContext = {
      slotId: slot.slotId,
      scheduleId: slot.scheduleId,
      occurrenceAtIso: new Date(slot.occurrenceAt).toISOString(),
      triggerSource: slot.triggerSource,
      slotName: slot.slotName,
      slotDate: slot.slotDate,
    };

    await manager.initialise();
    let runError: string | null = null;
    try {
      await manager.runAllTargets();
    } catch (error) {
      // A target may legitimately terminate as failed/no_candidate, but the
      // aggregate reason is what tells a maintainer which stage diverged, so it
      // is recorded and reported rather than swallowed.
      runError = (error as Error).message ?? String(error);
    }
    this.lastRunError = runError;

    const drained = drain ? await this.drainOutbox() : {};
    if (finish) this.coordinator.finish(slot, this.schedule, this.config.targets);
    this.coordinator.releaseRunLease(slot.slotId, owner);

    return {
      slotId: slot.slotId,
      pendingTargetCount: runTargets.length,
      drained,
      cells: this.cells(slot.slotId),
      runError,
      outboxRows: this.outboxRows(),
    };
  }

  /**
   * Drain the durable outbox with the real dispatcher, exactly as production
   * does.
   *
   * `maxRounds` is passed straight through to `OutboxWorker.drainOnce()`. The
   * default lets the worker run until the queue is empty; a scenario that needs
   * to inspect the outbox *between* two attempts caps it at 1.
   */
  async drainOutbox(maxRounds?: number): Promise<Record<string, unknown>> {
    const dispatcher = new DeliveryDispatcher(this.config.delivery);
    const worker = new OutboxWorker(this.db, dispatcher, {
      retryBaseMs: this.config.delivery?.outboxRetryBaseMs,
      retryMaxMs: this.config.delivery?.outboxRetryMaxMs,
      onDeliveryTerminal: (deliveryId: string, ack: { kind: string }) => {
        const row = this.db.deliveries.getById(deliveryId);
        if (!row || !row.slotId || !row.targetId) return;
        if (ack.kind === 'duplicate_existing') {
          this.coordinator.applyOutcome(row.slotId, row.targetId, {
            kind: 'duplicate',
            workId: row.pixivId,
            reason: 'downstream attested historical duplicate',
          });
          return;
        }
        this.coordinator.markDelivered(
          row.slotId,
          row.targetId,
          row.pixivId,
          row.workType as 'illustration' | 'novel',
        );
      },
    } as never);
    // Readiness is the first thing a drain consults; surfacing it turns a
    // silent "processed: 0" into an actionable fact.
    let readiness: unknown = 'unknown';
    try {
      const probe = dispatcher as unknown as {
        readinessProbe?: (name: string) => Promise<unknown>;
      };
      readiness = probe.readinessProbe
        ? await probe.readinessProbe(SIM_DELIVERY_TARGET)
        : 'unsupported';
    } catch (error) {
      readiness = `error: ${(error as Error).message}`;
    }
    let rawHealth: unknown;
    try {
      const response = await fetch(`${this.telepost.require().apiBase}/health`);
      rawHealth = { status: response.status };
    } catch (error) {
      const cause = (error as { cause?: { message?: string } }).cause;
      rawHealth = `error: ${(error as Error).message} / ${cause?.message ?? 'no cause'}`;
    }
    const result = maxRounds === undefined ? await worker.drainOnce() : await worker.drainOnce(maxRounds);
    return { ...((result ?? {}) as Record<string, unknown>), readiness, rawHealth };
  }

  /** Settle the last slot rollup, as the scheduler does after the outbox drains. */
  finishSlot(): void {
    if (!this.lastSlot) throw new Error('no slot has been resolved yet');
    this.coordinator.finish(this.lastSlot, this.schedule, this.config.targets);
  }

  /** Durable slot status, for terminal-state assertions. */
  slotStatus(slotId: string = this.slotId): string {
    const row = this.db.slots.getSlot(slotId) as unknown as Record<string, unknown> | null;
    return String(row?.status ?? 'unknown');
  }

  cells(slotId: string): SlotRunResult['cells'] {
    return this.db.slots.getCells(slotId).map((cell) => {
      const row = cell as unknown as Record<string, unknown>;
      return {
        targetId: String(row.targetId ?? row.target_id ?? ''),
        status: String(row.status ?? 'unknown'),
        workId: (row.workId ?? row.pixivId ?? row.pixiv_id ?? null) as string | null,
        error: (row.error ?? row.lastError ?? row.last_error ?? null) as string | null,
      };
    });
  }

  /** Durable delivery rows grouped by status. */
  deliveryCounts(): Record<string, number> {
    return this.db.deliveries.countByStatus() as unknown as Record<string, number>;
  }

  /** Durable outbox rows with the fields that explain a stalled drain. */
  outboxRows(): Array<Record<string, unknown>> {
    return this.db.outbox.list().map((row) => {
      const r = row as unknown as Record<string, unknown>;
      return {
        id: r.id,
        kind: r.kind,
        status: r.status,
        deliveryId: r.deliveryId ?? r.delivery_id,
        deliveryTarget: r.deliveryTarget ?? r.delivery_target,
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt ?? r.next_attempt_at,
        // Negative means due. Reported so a stalled drain explains itself.
        dueInMs: Number(r.nextAttemptAt ?? r.next_attempt_at ?? 0) - Date.now(),
        lastError: r.lastError ?? r.last_error,
        leaseOwner: r.leaseOwner ?? r.lease_owner,
      };
    });
  }

  /**
   * Durable delivery rows.
   *
   * `countByStatus()` only aggregates, so the concrete rows are resolved through
   * the outbox rows (which name their delivery id); terminal rows are included,
   * unlike `pending()` alone.
   */
  deliveryRows(): Array<Record<string, unknown>> {
    const rows = new Map<string, Record<string, unknown>>();
    const add = (candidate: unknown): void => {
      if (!candidate) return;
      const r = candidate as unknown as Record<string, unknown>;
      const id = String(r.id ?? '');
      if (!id) return;
      rows.set(id, {
        id,
        status: r.status,
        idempotency_key: r.idempotencyKey ?? r.idempotency_key,
        remote_status: r.remoteStatus ?? r.remote_status,
        attempts: r.attempts,
        slot_id: r.slotId ?? r.slot_id,
        target_id: r.targetId ?? r.target_id,
        pixiv_id: r.pixivId ?? r.pixiv_id,
      });
    };
    for (const outbox of this.outboxRows()) {
      const deliveryId = outbox.deliveryId;
      if (typeof deliveryId === 'string' && deliveryId) add(this.db.deliveries.getById(deliveryId));
    }
    for (const pending of this.db.deliveries.pending(200)) add(pending);
    return [...rows.values()];
  }

  /**
   * Durable delivery events, oldest first. This is where the *classification*
   * of a response lives (`delivery.duplicate` carries the reason PixivFlow
   * derived from the downstream ACK).
   */
  deliveryEvents(outboxId?: string): Array<Record<string, unknown>> {
    const events = outboxId
      ? this.db.outbox.listEvents({ outboxId, limit: 200 })
      : this.db.outbox.listEvents({ limit: 200 });
    return events
      .slice()
      .reverse()
      .map((event) => {
        const e = event as unknown as Record<string, unknown>;
        const detail = e.detail;
        return {
          event: e.event,
          errorClass: e.errorClass ?? e.error_class,
          retryable: e.retryable,
          countsAsAttempt: e.countsAsAttempt ?? e.counts_as_attempt,
          detail: typeof detail === 'string' ? safeJson(detail) : detail,
        };
      });
  }

  /** Reviews as the real control plane reports them (the pending queue). */
  async reviews(): Promise<TelepostReview[]> {
    return this.control.listReviews();
  }

  /**
   * A single review by id. `/api/v1/reviews` is the queue view, so a review
   * leaves it once it is published or rejected; the terminal state has to be
   * read from the review resource itself.
   */
  async review(id: number | string): Promise<TelepostReview | null> {
    return this.control.getReview(id);
  }

  /** Approve through the real review endpoint; this is what triggers publish. */
  async approve(reviewId: number | string): Promise<{ status: number; json: Record<string, unknown> }> {
    return this.control.approve(reviewId);
  }

  /** Calls the fake Telegram server observed for the publish channel only. */
  publishesToChannel(): ReturnType<FakeTelegramServer['publishCalls']> {
    const { channelId } = syntheticChatIds();
    return this.telegram.publishCalls().filter((call) => String(call.chatId) === String(channelId));
  }

  /** One-shot observability view: the whole chain for a readable failure. */
  async snapshot(identity: Partial<CorrelationIdentity> = {}): Promise<ObservabilitySnapshot> {
    const slotId = identity.slotId ?? this.lastSlot?.slotId ?? undefined;
    const ledger: LedgerSnapshot = {
      slots: slotId ? ([this.db.slots.getSlot(slotId)].filter(Boolean) as unknown as Array<Record<string, unknown>>) : [],
      // `describeState` reads snake_case ledger keys, while the repositories
      // return camelCase objects; both shapes are exposed so a failure names the
      // concrete cell instead of printing `undefined`.
      slotItems: slotId
        ? this.db.slots.getCells(slotId).map((cell) => {
            const row = cell as unknown as Record<string, unknown>;
            return {
              ...row,
              target_id: row.target_id ?? row.targetId,
              work_id: row.work_id ?? row.workId,
            };
          })
        : [],
      downloads: slotId
        ? (this.cells(slotId)
            .filter((cell) => cell.workId)
            .map((cell) => ({
              pixiv_id: cell.workId,
              type: 'illustration',
              status: cell.status,
            })) as unknown as Array<Record<string, unknown>>)
        : [],
      // Concrete rows rather than counts: `describeState` renders
      // `id`/`status`/`idempotency_key`, and an aggregate has none of them.
      deliveries: this.deliveryRows(),
      outbox: this.outboxRows(),
    };

    const reviews = await this.reviews().catch(() => [] as TelepostReview[]);
    return {
      identity: { scheduleId: SIM_SCHEDULE_ID, ...identity, slotId },
      pixivFlow: ledger,
      telepost: { reviews: reviews as unknown as Array<Record<string, unknown>> },
      telegram: { publishes: this.publishesToChannel() as unknown as Array<Record<string, unknown>> },
    };
  }

  /** Renders `snapshot()` for a self-explanatory assertion failure. */
  async describe(label: string, identity: Partial<CorrelationIdentity> = {}): Promise<string> {
    return describeState(label, await this.snapshot(identity));
  }

  /**
   * Submission attempts observed at the delivery boundary. Empty unless the
   * simulation was started with `lossyDeliveryTransport`.
   */
  submissionAttempts(): SubmissionAttempt[] {
    return this.transport ? this.transport.submissionAttempts() : [];
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
    await this.transport?.stop().catch(() => undefined);
    await this.telepost.stop().catch(() => undefined);
    await this.telegram.stop().catch(() => undefined);
    rmSync(this.paths.root, { recursive: true, force: true });
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export { SIM_TARGET_ID, SIM_SCHEDULE_ID, SIM_OCCURRENCE_AT };
export type { SubmissionAttempt };
