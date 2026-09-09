import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { Database } from '../storage/Database';
import { OutboxRow, OutboxStatus } from '../storage/repositories/OutboxRepository';
import { DeliveryDispatcher } from './DeliveryDispatcher';
import { DeliveryRequest } from './types';
import { DeliveryAck } from './DeliveryAck';
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
      for (const row of rows) {
        processed++;
        const result = await this.process(row);
        if (result === 'done') done++;
        else if (result === 'dead') dead++;
        else retried++;
      }
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
        await this.process(row);
      }
    } catch (error) {
      logger.warn('Outbox pump failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.running = false;
    }
  }

  private async process(row: OutboxRow): Promise<OutboxStatus> {
    try {
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
          fields: payload.fields as DeliveryRequest['fields'],
          context: payload.context as unknown as DeliveryRequest['context'],
        });
        const ack: DeliveryAck = result.ack ?? {
          kind: result.status && result.status >= 200 && result.status < 300 ? 'accepted' : 'retryable_failure',
          error: `no ack (HTTP ${result.status})`,
        };
        await this.handleDeliveryAck(row, ack, payload);
      }
      this.database.outbox.markDone(row.id);
      return 'done';
    } catch (error) {
      // Transport-level error (fetch threw): retryable.
      const message = error instanceof Error ? error.message : String(error);
      const delay = backoffDelayMs(row.attempts + 1, this.retryBaseMs, this.retryMaxMs);
      const status = this.database.outbox.markRetry(row.id, Date.now() + delay, message);
      if (status === 'dead') {
        logger.error('Outbox item dead after max attempts', { outboxId: row.id, kind: row.kind, error: message });
        this.onDead?.(row, message);
        if (row.deliveryId) {
          this.database.deliveries.recordAck(row.deliveryId, { status: 'failed', error: message });
        }
      } else {
        logger.warn('Outbox item will retry', { outboxId: row.id, kind: row.kind, attempt: row.attempts + 1, delayMs: delay });
      }
      return status;
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
    const files = [...(payload.files ?? []), ...(payload.cleanupFiles ?? [])];
    await Promise.all(
      [...new Set(files)].map((file) =>
        unlink(file).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') logger.debug('cache cleanup failed', { file, error: error.message });
        })
      )
    );
  }
}