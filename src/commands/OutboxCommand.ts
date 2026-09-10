import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import { OutboxRow, OutboxStatus } from '../storage/repositories/OutboxRepository';

const STATUSES = new Set<OutboxStatus>([
  'pending', 'processing', 'retry_wait', 'done', 'dead', 'cancelled',
]);

/** Operator-initiated audit event (never counts as an attempt). */
function recordCliEvent(db: Database, row: OutboxRow, event: string): void {
  let executionId: string | undefined;
  let slotId: string | undefined;
  let pixivId: string | undefined;
  try {
    const c = (JSON.parse(row.payloadJson) as { context?: Record<string, unknown> }).context ?? {};
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    executionId = str(c.executionId) ?? str(c.slotId);
    slotId = str(c.slotId);
    pixivId = str(c.pixivId);
  } catch { /* payload without context (e.g. notification) */ }
  db.outbox.recordEvent({
    event,
    actor: 'cli',
    countsAsAttempt: 0,
    deliveryId: row.deliveryId,
    outboxId: row.id,
    deliveryTarget: row.deliveryTarget,
    executionId, slotId, pixivId,
  });
}

export class OutboxCommand extends BaseCommand {
  readonly name = 'outbox';
  readonly description = 'List, inspect, retry or cancel durable delivery intents';
  readonly requiresToken = false;
  readonly metadata = {
    category: CommandCategory.MAINTENANCE,
    requiresAuth: true,
    longRunning: false,
  };

  getUsage(): string {
    return [
      'pixivflow outbox list [--status dead] [--limit 100]',
      'pixivflow outbox inspect <id>',
      'pixivflow outbox retry <id>',
      'pixivflow outbox retry --dead',
      'pixivflow outbox cancel <id>',
    ].join('\n');
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const action = args.positional[0] ?? 'list';
    const id = args.positional[1];
    const db = new Database(
      context.config.storage?.databasePath ?? './data/pixiv-downloader.db'
    );
    try {
      db.migrate();
      if (action === 'list') {
        const rawStatus = typeof args.options.status === 'string'
          ? args.options.status as OutboxStatus : undefined;
        if (rawStatus && !STATUSES.has(rawStatus)) {
          return this.failure(`unknown outbox status: ${rawStatus}`);
        }
        const limit = Number(args.options.limit ?? 100);
        const rows = db.outbox.list(rawStatus, Number.isFinite(limit) ? limit : 100);
        for (const row of rows) context.logger.info('outbox', this.summary(row));
        return this.success(`${rows.length} outbox row(s)`, rows.map((row) => this.summary(row)));
      }
      if (action === 'inspect') {
        if (!id) return this.failure('Usage: pixivflow outbox inspect <id>');
        const row = db.outbox.get(id);
        if (!row) return this.failure(`outbox row not found: ${id}`);
        const events = db.outbox.listEvents({ outboxId: id, limit: 20 });
        const deferred = events.filter((e) => e.event === 'outbox.deferred');
        const failures = events.filter((e) => e.countsAsAttempt === 1);
        for (const e of deferred) {
          context.logger.info('not ready (deferred, no attempt consumed)', {
            ts: e.ts, errorClass: e.errorClass, detail: e.detail,
          });
        }
        for (const e of failures) {
          context.logger.info('attempt-consuming event', {
            event: e.event, ts: e.ts, errorClass: e.errorClass, retryable: e.retryable, detail: e.detail,
          });
        }
        return this.success('outbox row', {
          row,
          events: events.map((e) => ({
            ts: e.ts, event: e.event, errorClass: e.errorClass,
            countsAsAttempt: e.countsAsAttempt, retryable: e.retryable, actor: e.actor, detail: e.detail,
          })),
        });
      }
      if (action === 'retry') {
        const rows = args.options.dead ? db.outbox.list('dead', 500) : [];
        if (!args.options.dead) {
          if (!id) return this.failure('Usage: pixivflow outbox retry <id> | --dead');
          const row = db.outbox.get(id);
          if (!row) return this.failure(`outbox row not found: ${id}`);
          if (row.status !== 'dead') {
            return this.failure(`outbox row is not dead: ${id}`);
          }
          rows.push(row);
        }
        for (const row of rows) {
          db.outbox.requeue(row.id);
          recordCliEvent(db, row, 'outbox.replay_requested');
        }
        return this.success(`requeued ${rows.length} outbox row(s)`, { ids: rows.map((row) => row.id) });
      }
      if (action === 'cancel') {
        if (!id) return this.failure('Usage: pixivflow outbox cancel <id>');
        const row = db.outbox.get(id);
        if (!row || !db.outbox.cancel(id)) {
          return this.failure(`outbox row is missing, processing or already terminal: ${id}`);
        }
        if (row.deliveryId) {
          db.deliveries.recordAck(row.deliveryId, {
            status: 'failed', remoteStatus: 'cancelled', error: 'cancelled by operator',
          });
        }
        recordCliEvent(db, row, 'outbox.cancelled');
        return this.success('outbox row cancelled', { id });
      }
      return this.failure(this.getUsage());
    } finally {
      db.close();
    }
  }

  private summary(row: OutboxRow) {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      deliveryTarget: row.deliveryTarget,
      attempts: row.attempts,
      nextAttemptAt: row.nextAttemptAt,
      lastError: row.lastError,
    };
  }
}
