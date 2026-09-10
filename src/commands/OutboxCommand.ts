import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import { OutboxRow, OutboxStatus } from '../storage/repositories/OutboxRepository';

const STATUSES = new Set<OutboxStatus>([
  'pending', 'processing', 'retry_wait', 'done', 'dead', 'cancelled',
]);

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
        return row ? this.success('outbox row', row) : this.failure(`outbox row not found: ${id}`);
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
        for (const row of rows) db.outbox.requeue(row.id);
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
