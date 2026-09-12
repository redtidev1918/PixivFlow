import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { Database } from '../storage/Database';
import { OutboxRow, OutboxStatus, RecordEventInput } from '../storage/repositories/OutboxRepository';
import { DeliveryDispatcher } from './DeliveryDispatcher';
import { DeliveryRequest } from './types';
import { DeliveryAck } from './DeliveryAck';
import { classifyError, DeliveryErrorClass } from './errorClass';
import { redactError } from '../utils/redact';
import { logger } from '../logger';

export interface OutboxWorkerOptions {
  /** How often to scan for due rows. */
  pollIntervalMs?: number;
  /** Row lease duration while one attempt is in flight. */
  leaseMs?: number;
  /** Rows claimed per scan. */
  batchSize?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  /** Fired when a delivery reaches a terminal business state (for the Slot ledger). */
  onDeliveryTerminal?: (deliveryId: string, ack: DeliveryAck, payload: DeliveryPayload) => void;
  /** Fired when a delivery is permanently dead (for notifications/doctor). */
  onDead?: (row: OutboxRow, error: string) => void;
}

/** Delivery side-effect payload (frozen at enqueue time). */
export interface DeliveryPayload {
  files: string[];
  previewFiles?: string[];
  /** Sidecars + cached media removed after confirmed delivery (cache mode). */
  cleanupFiles?: string[];
  deleteAfterDelivery?: boolean;
  fields?: Record<string, unknown>;
  context: Record<string, unknown>;
}

/** Notification side-effect payload. */
export interface NotificationPayload {
  text: string;
}

/** Exponential backoff with jitter, capped. */
export function backoffDelayMs(attempt: number, base: number, max: number): number {
  const exp = base * 2 ** Math.min(Math.max(0, attempt - 1), 18);
  const capped = Math.min(max, exp);
  // Full jitter: 0.5..1.0 of the delay spreads synchronized workers/retries.
  return Math.round(capped * (0.5 + Math.random() * 0.5));
}

/**
 * Independently pumps the SQLite outbox so deliveries and notifications retry
 * promptly instead of piggy-backing on the next scheduled download run.
 * Survives crashes: an in-flight row keeps an expiring lease; a restart claims
 * it once the lease is stale and retries the SAME idempotent intent.
 */
export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private readonly owner = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  private readonly pollIntervalMs: number;
  private readonly leaseMs: number;
  private readonly batchSize: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  /** outboxId -> last deferred-event ts; bounds readiness defer flooding. */
  private readonly lastDeferred = new Map<string, number>();

  constructor(
    private readonly database: Database,
    private readonly dispatcher: DeliveryDispatcher,
    options: OutboxWorkerOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 10_000;
    this.leaseMs = options.leaseMs ?? 120_000;
    this.batchSize = options.batchSize ?? 4;
    this.retryBaseMs = options.retryBaseMs ?? 30_000;
    this.retryMaxMs = options.retryMaxMs ?? 6 * 60 * 60_000;
    if (options.onDeliveryTerminal) this.onDeliveryTerminal = options.onDeliveryTerminal;
    if (options.onDead) this.onDead = options.onDead;
  }

  private onDeliveryTerminal: OutboxWorkerOptions['onDeliveryTerminal'] = undefined;
  private onDead: OutboxWorkerOptions['onDead'] = undefined;

  start(): void {
    if (this.timer) return;
    logger.info('Outbox worker started', { pollMs: this.pollIntervalMs, owner: this.owner });
    // Pump immediately on start so a crash-resume drains without waiting.
    void this.pump();
    this.timer = setInterval(() => void this.pump(), this.pollIntervalMs);
    // Don't keep the event loop alive solely for the pump during shutdown.
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Drain all currently-due rows once (used by CLI / watchdog wake). */
  async drainOnce(maxRounds = 50): Promise<{ processed: number; done: number; retried: number; dead: number }> {
    let processed = 0;
    let done = 0;
    let retried = 0;
    let dead = 0;
    for (let round = 0; round < maxRounds; round++) {
      const rows = this.database.outbox.claimDue(this.owner, this.leaseMs, this.batchSize);
      if (rows.length === 0) break;
      let deferred = false;
      for (const row of rows) {
        const readiness = await this.checkReadiness(row);
        if (!readiness.ready) {
          this.database.outbox.release(row.id);
          this.recordDeferred(row, readiness);
          deferred = true;
          continue;
        }
        processed++;
        const result = await this.process(row);
        if (result === 'done') done++;
        else if (result === 'dead') dead++;
        else retried++;
      }
      if (deferred) break;
    }
    return { processed, done, retried, dead };
  }

  private async pump(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const rows = this.database.outbox.claimDue(this.owner, this.leaseMs, this.batchSize);
      for (const row of rows) {
        if (this.stopped) {
          this.database.outbox.release(row.id);
          continue;
        }
        const readiness = await this.checkReadiness(row);
        if (!readiness.ready) {
          this.database.outbox.release(row.id);
          this.recordDeferred(row, readiness);
          continue;
        }
        await this.process(row);
      }
    } catch (error) {
      logger.warn('Outbox pump failed', { error: redactError(error) });
    } finally {
      this.running = false;
    }
  }

  /** Probe via structured readinessProbe when available; boolean fallback stays compatible. */
  private async checkReadiness(row: OutboxRow): Promise<{ ready: boolean; reason?: string; status?: number }> {
    const dispatcher = this.dispatcher as unknown as {
      readinessProbe?: (name: string) => Promise<{ ready: boolean; reason?: string; status?: number }>;
    };
    if (typeof dispatcher.readinessProbe === 'function') {
      return dispatcher.readinessProbe(row.deliveryTarget);
    }
    return { ready: await this.dispatcher.isReady(row.deliveryTarget) };
  }

  /** Record at most one deferral per outbox row per 60s (cold-start poll guard). */
  private recordDeferred(row: OutboxRow, probe: { reason?: string; status?: number }): void {
    const now = Date.now();
    const last = this.lastDeferred.get(row.id) ?? 0;
    if (now - last < 60_000) return;
    this.lastDeferred.set(row.id, now);
    this.recordEvent(row, {
      event: 'outbox.deferred',
      errorClass: 'dependency_not_ready',
      retryable: true,
      countsAsAttempt: 0,
      detail: { reason: probe.reason ?? 'not_ready', status: probe.status ?? null },
    });
  }

  /** Pull correlation fields out of payload.context without trusting its shape. */
  private contextCorrelation(row: OutboxRow): Pick<
    RecordEventInput, 'executionId' | 'slotId' | 'pixivId'
  > {
    try {
      const payload = JSON.parse(row.payloadJson) as DeliveryPayload;
      const c = (payload.context ?? {}) as Record<string, unknown>;
      const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
      return {
        executionId: str(c.executionId) ?? str(c.slotId),
        slotId: str(c.slotId),
        pixivId: str(c.pixivId),
      };
    } catch {
      return {};
    }
  }

  /**
   * Record media.fallback only when the provider ack explicitly attests one
   * (TelePost envelope may carry media_fallback/document_fallback flags).
   */
  private recordMediaFallback(row: OutboxRow, ack: DeliveryAck): void {
    const raw = 'raw' in ack ? ack.raw : undefined;
    const data = raw && typeof raw === 'object'
      ? (raw as { data?: Record<string, unknown> }).data
      : undefined;
    const rec = data && typeof data === 'object' ? data : undefined;
    if (!rec) return;
    const reason = rec.media_fallback_reason ?? rec.document_fallback_reason;
    const fellBack = rec.media_fallback === true || rec.document_fallback === true ||
      (typeof rec.fallback === 'string' && /document/i.test(rec.fallback));
    if (!fellBack) return;
    this.recordEvent(row, {
      event: 'media.fallback',
      countsAsAttempt: 0,
      detail: { reason: typeof reason === 'string' ? reason : 'document' },
    });
  }

  private recordEvent(row: OutboxRow, input: Omit<RecordEventInput, 'deliveryId' | 'outboxId' | 'deliveryTarget' | 'executionId' | 'slotId' | 'pixivId'>): void {
    try {
      this.database.outbox.recordEvent({
        ...this.contextCorrelation(row),
        deliveryId: row.deliveryId,
        outboxId: row.id,
        deliveryTarget: row.deliveryTarget,
        ...input,
      });
    } catch (error) {
      logger.debug('Failed to record delivery event', { event: input.event, error: redactError(error) });
    }
  }

  private async process(row: OutboxRow): Promise<OutboxStatus> {
    this.recordEvent(row, { event: 'outbox.claimed', countsAsAttempt: 0 });
    try {
      let reused: DeliveryAck | undefined;
      if (row.kind === 'notification') {
        const payload = JSON.parse(row.payloadJson) as NotificationPayload;
        await this.dispatcher.notify(row.deliveryTarget, {
          text: payload.text,
          idempotencyKey: row.idempotencyKey ?? row.id,
        });
      } else {
        const payload = JSON.parse(row.payloadJson) as DeliveryPayload;
        const result = await this.dispatcher.deliver(row.deliveryTarget, {
          files: payload.files,
          previewFiles: payload.previewFiles,
          fields: payload.fields as DeliveryRequest['fields'],
          context: payload.context as unknown as DeliveryRequest['context'],
        });
        const ack: DeliveryAck = result.ack ?? {
          kind: result.status && result.status >= 200 && result.status < 300 ? 'accepted' : 'retryable_failure',
          error: `no ack (HTTP ${result.status})`,
        };
        if (ack.kind === 'idempotent_replay' || ack.kind === 'duplicate_existing') reused = ack;
        this.recordMediaFallback(row, ack);
        await this.handleDeliveryAck(row, ack, payload);
      }
      this.database.outbox.markDone(row.id);
      this.recordEvent(row, { event: 'outbox.delivered', countsAsAttempt: 0 });
      if (reused) {
        const remoteId = 'remoteId' in reused ? reused.remoteId : undefined;
        this.recordEvent(row, {
          event: 'delivery.duplicate',
          errorClass: 'duplicate',
          retryable: false,
          countsAsAttempt: 0,
          detail: { reason: reused.kind, remoteId },
        });
      }
      return 'done';
    } catch (error) {
      const message = redactError(error).slice(0, 1000);
      const { errorClass } = classifyError(error);

      // A local configuration error is deterministic: every attempt re-reads the
      // same config, so retrying only parks the row in `retry_wait` until its
      // attempt budget runs out. Dead-letter it now so it is visible instead.
      if (errorClass === 'configuration_error') {
        this.database.outbox.markDead(row.id, message);
        this.deadLetter(row, `${message} (configuration error)`, errorClass);
        return 'dead';
      }

      // Transport-level error (fetch threw) or ack-classified failure: retryable.
      const delay = backoffDelayMs(row.attempts + 1, this.retryBaseMs, this.retryMaxMs);
      const status = this.database.outbox.markRetry(row.id, Date.now() + delay, message);
      if (status === 'dead') {
        this.deadLetter(row, message, errorClass);
      } else {
        logger.warn('Outbox item will retry', { outboxId: row.id, kind: row.kind, attempt: row.attempts + 1, delayMs: delay });
        this.recordEvent(row, {
          event: 'outbox.retry_scheduled',
          errorClass,
          retryable: true,
          countsAsAttempt: 1,
          detail: { attempt: row.attempts + 1, nextInMs: delay },
        });
      }
      return status;
    }
  }

  /** Terminal delivery failure: audit it, release the delivery, notify the hooks. */
  private deadLetter(row: OutboxRow, message: string, errorClass: DeliveryErrorClass): void {
    logger.error('Outbox item dead', { outboxId: row.id, kind: row.kind, errorClass, error: message });
    this.recordEvent(row, {
      event: 'outbox.dead',
      errorClass,
      retryable: false,
      countsAsAttempt: 1,
      detail: { attempt: row.attempts + 1 },
    });
    this.onDead?.(row, message);
    if (row.deliveryId) {
      this.database.deliveries.recordAck(row.deliveryId, { status: 'failed', error: message });
    }
  }

  private async handleDeliveryAck(row: OutboxRow, ack: DeliveryAck, payload: DeliveryPayload): Promise<void> {
    if (!row.deliveryId) return;
    switch (ack.kind) {
      case 'accepted':
      case 'idempotent_replay':
        this.database.deliveries.recordAck(row.deliveryId, {
          status: 'delivered',
          remoteId: ack.remoteId,
          remoteStatus: ack.remoteStatus ?? (ack.kind === 'idempotent_replay' ? 'idempotent_replay' : 'accepted'),
        });
        this.onDeliveryTerminal?.(row.deliveryId, ack, payload);
        await this.cleanup(payload);
        break;
      case 'duplicate_existing':
        this.database.deliveries.recordAck(row.deliveryId, {
          status: 'duplicate',
          remoteId: ack.remoteId,
          remoteStatus: ack.remoteStatus ?? 'duplicate_existing',
          reuseReason: 'historical_duplicate',
        });
        this.onDeliveryTerminal?.(row.deliveryId, ack, payload);
        break;
      case 'permanent_failure':
        // Deterministic rejection: still retry a couple times to survive a
        // misconfigured blip, the outbox max-attempts then dead-letters it.
        throw new Error(`permanent delivery failure: ${ack.error}`);
      case 'retryable_failure':
        throw new Error(`retryable delivery failure: ${ack.error}`);
    }
  }

  private async cleanup(payload: DeliveryPayload): Promise<void> {
    if (payload.deleteAfterDelivery === false) return;
    const files = [
      ...(payload.files ?? []),
      ...(payload.previewFiles ?? []),
      ...(payload.cleanupFiles ?? []),
    ];
    await Promise.all(
      [...new Set(files)].map((file) =>
        unlink(file).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') logger.debug('cache cleanup failed', { file, error: error.message });
        })
      )
    );
  }
}
