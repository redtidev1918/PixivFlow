import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import type { DeliveryRow, DeliveryStatus } from '../storage/repositories/DeliveryRepository';
import type { OutboxRow } from '../storage/repositories/OutboxRepository';
import { configuredGateways } from '../delivery/gatewayRoutes';

const DELIVERY_STATUSES = new Set<DeliveryStatus>(['pending', 'delivered', 'duplicate', 'failed']);
/** Outbox states that mean "the worker will not try this again on its own". */
const TERMINAL_OUTBOX = new Set(['dead', 'cancelled', 'done']);

function openDb(context: CommandContext): Database {
  const db = new Database(context.config.storage?.databasePath ?? './data/pixiv-downloader.db');
  db.migrate();
  return db;
}

function integerOption(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function stringOption(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * The delivery LEDGER, per route — the operator view of "what did we promise
 * each gateway, and did it happen".
 *
 * `retry` re-arms only the routes that are still owed. It never re-sends a
 * route whose ledger already says delivered/duplicate (that is the whole point
 * of the per-target ledger), and it refuses outright when the outbox row for a
 * failed route is still actionable (the worker is already going to retry; a
 * manual re-arm would double-send).
 */
export class DeliveryCommand extends BaseCommand {
  readonly name = 'delivery';
  readonly description = 'Inspect per-gateway delivery state and re-arm failed routes';
  readonly requiresToken = false;
  readonly metadata = {
    category: CommandCategory.MONITORING,
    requiresAuth: true,
    longRunning: false,
  };

  getUsage(): string {
    return [
      'pixivflow delivery status [--target <name>] [--status failed] [--limit 25] [--json]',
      'pixivflow delivery status --id <deliveryId> [--json]',
      'pixivflow delivery retry --target <name> [--status failed] [--limit 25] [--dry-run] [--yes]',
      'pixivflow delivery retry --id <deliveryId> [--yes]',
      'pixivflow delivery retry --all [--limit 25] [--yes]',
    ].join('\n');
  }

  validate(args: CommandArgs): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const action = args.positional[0] ?? 'status';
    if (!['status', 'retry'].includes(action)) {
      errors.push(`Unknown delivery action: ${action}. Expected status or retry.`);
    }
    const status = stringOption(args.options.status);
    if (status && !DELIVERY_STATUSES.has(status as DeliveryStatus)) {
      errors.push(
        `Unknown delivery status: ${status}. Expected ${[...DELIVERY_STATUSES].join(', ')}.`
      );
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const action = args.positional[0] ?? 'status';
    return action === 'retry' ? this.retry(context, args) : this.status(context, args);
  }

  private async status(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const limit = integerOption(args.options.limit, 25, 1, 200);
    const db = openDb(context);
    try {
      const id = stringOption(args.options.id);
      if (id) {
        const row = db.deliveries.getById(id);
        if (!row) return this.failure(`No delivery intent with id ${id}.`);
        const data = { delivery: this.describe(row, db.outbox.listForDeliveryIds([row.id]).get(row.id)) };
        if (args.options.json === true) return this.success(undefined, data);
        return this.success(this.formatRows([data.delivery]), data);
      }

      const target = stringOption(args.options.target);
      const status = stringOption(args.options.status) as DeliveryStatus | undefined;
      if (target) {
        const rows = db.deliveries.listRecentByTarget(target, { limit, status });
        const outbox = db.outbox.listForDeliveryIds(rows.map((row) => row.id));
        const deliveries = rows.map((row) => this.describe(row, outbox.get(row.id)));
        const counts = db.deliveries.countByStatusForTarget(target);
        const data = { target, counts, deliveries };
        if (args.options.json === true) return this.success(undefined, data);
        const header = `gateway ${target}: ${counts.delivered ?? 0} delivered, ${counts.failed ?? 0} failed, ` +
          `${counts.pending ?? 0} pending, ${counts.duplicate ?? 0} duplicate`;
        return this.success(
          deliveries.length ? `${header}\n${this.formatRows(deliveries)}` : `${header}\n(no matching delivery intents)`,
          data
        );
      }

      // No target: the whole configured plane at once, including routes no
      // download target enables any more (their ledger rows still exist).
      const names = configuredGateways(context.config).map((route) => route.name);
      const counts = Object.fromEntries(
        names.map((name) => [name, db.deliveries.countByStatusForTarget(name)])
      );
      const data = { counts, gateways: names };
      if (args.options.json === true) return this.success(undefined, data);
      if (names.length === 0) {
        return this.success('No delivery targets are configured; nothing is ever delivered.', data);
      }
      const lines = [['GATEWAY'.padEnd(20), 'DELIVERED'.padEnd(10), 'FAILED'.padEnd(8), 'PENDING'].join(' ')];
      for (const name of names) {
        const c = counts[name] ?? {};
        lines.push(
          [
            name.padEnd(20),
            String(c.delivered ?? 0).padEnd(10),
            String(c.failed ?? 0).padEnd(8),
            String(c.pending ?? 0),
          ].join(' ')
        );
      }
      lines.push('');
      lines.push('Use `--target <name>` for recent intents, `--id <id>` for one intent.');
      return this.success(lines.join('\n'), data);
    } finally {
      db.close();
    }
  }

  private async retry(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const limit = integerOption(args.options.limit, 25, 1, 200);
    const apply = args.options.yes === true;
    const where = args.options['dry-run'] === true ? 'dry-run requested' : apply ? 'apply requested' : 'preview';
    const db = openDb(context);
    try {
      const ids = this.selectRetryCandidates(context, db, args, limit);
      if (ids.length === 0) {
        return this.success('Nothing to retry: no failed delivery intent is owed a resend.', {
          retried: [],
          skipped: [],
          where,
        });
      }

      const retried: Record<string, unknown>[] = [];
      const skipped: Record<string, unknown>[] = [];
      for (const row of ids) {
        const outbox = db.outbox.listForDeliveryIds([row.id]).get(row.id);
        // The ledger owns the promise; the outbox row owns the attempt. A
        // failed ledger row whose outbox row is still actionable means a worker
        // is (or will be) retrying it — a manual re-arm would double-deliver.
        if (outbox && !TERMINAL_OUTBOX.has(outbox.status)) {
          skipped.push(this.describe(row, outbox, 'outbox still actionable; the worker will retry it'));
          continue;
        }
        retried.push(this.describe(row, outbox, apply ? 're-armed for delivery' : 'would be re-armed'));
        if (!apply) continue;

        const outboxId = outbox?.id ?? row.id;
        if (!db.outbox.revive(outboxId)) db.outbox.requeue(outboxId);
        db.outbox.recordEvent({
          event: 'outbox.replay_requested',
          actor: 'cli',
          countsAsAttempt: 0,
          deliveryId: row.id,
          outboxId,
          deliveryTarget: row.deliveryTarget,
          slotId: row.slotId ?? undefined,
          pixivId: row.pixivId,
          detail: { source: 'delivery retry', deliveryStatus: row.status },
        });
      }

      const data = { where, retried, skipped, applied: apply };
      if (args.options.json === true) return this.success(undefined, data);
      const lines: string[] = [];
      lines.push(
        `${apply ? 'Re-armed' : 'Would re-arm'} ${retried.length} delivery intent(s); ` +
          `${skipped.length} skipped.`
      );
      if (retried.length) lines.push(this.formatRows(retried));
      if (skipped.length) {
        lines.push('');
        lines.push('SKIPPED (not safe to re-arm):');
        lines.push(this.formatRows(skipped));
      }
      if (!apply) lines.push('');
      lines.push(
        apply
          ? 'The outbox worker will pick these up on its next tick; the gateway sees the same idempotency key.'
          : 'Nothing was changed. Re-run with --yes to apply.'
      );
      return this.success(lines.join('\n'), data);
    } finally {
      db.close();
    }
  }

  /**
   * Which ledger rows may be re-armed.
   *
   * Explicit `--id` wins; then `--target`; then `--all`. Without `--all` a bare
   * `retry` is a preview of the failed rows of every configured gateway, which
   * is the safe default for a destructive action.
   */
  private selectRetryCandidates(
    context: CommandContext,
    db: Database,
    args: CommandArgs,
    limit: number
  ): DeliveryRow[] {
    const id = stringOption(args.options.id);
    if (id) {
      const row = db.deliveries.getById(id);
      if (!row) return [];
      return row.status === 'failed' ? [row] : [];
    }
    const target = stringOption(args.options.target);
    const explicitStatus = stringOption(args.options.status) as DeliveryStatus | undefined;
    // `retry` is about owed work, so `failed` is the default; an operator may
    // widen it deliberately (`--status pending`) but never to delivered work.
    const status = explicitStatus ?? 'failed';
    if (status === 'delivered' || status === 'duplicate') return [];
    if (target) return db.deliveries.listRecentByTarget(target, { limit, status });

    const names = configuredGateways(context.config).map((route) => route.name);
    const rows: DeliveryRow[] = [];
    for (const name of names) {
      rows.push(...db.deliveries.listRecentByTarget(name, { limit, status }));
    }
    return rows
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
      .slice(0, limit);
  }

  private describe(row: DeliveryRow, outbox: OutboxRow | undefined, note?: string): Record<string, unknown> {
    return {
      id: row.id,
      deliveryTarget: row.deliveryTarget,
      workType: row.workType,
      pixivId: row.pixivId,
      status: row.status,
      attempts: row.attempts,
      lastError: row.lastError,
      remoteId: row.remoteId,
      remoteStatus: row.remoteStatus,
      slotId: row.slotId,
      targetId: row.targetId,
      idempotencyKey: row.idempotencyKey,
      outboxId: outbox?.id ?? null,
      outboxStatus: outbox?.status ?? null,
      outboxAttempts: outbox?.attempts ?? null,
      nextAttemptAt: outbox?.nextAttemptAt ?? null,
      updatedAt: row.updatedAt,
      note: note ?? null,
    };
  }

  private formatRows(rows: unknown[]): string {
    const lines = [
      ['TARGET'.padEnd(18), 'WORK'.padEnd(24), 'LEDGER'.padEnd(11), 'OUTBOX'.padEnd(10), 'ATT', 'DETAIL'].join(' '),
    ];
    for (const row of rows as Record<string, unknown>[]) {
      lines.push(
        [
          String(row.deliveryTarget).padEnd(18),
          `${row.workType}:${row.pixivId}`.padEnd(24),
          String(row.status).padEnd(11),
          String(row.outboxStatus ?? '-').padEnd(10),
          String(row.attempts),
          String(row.lastError ?? row.note ?? ''),
        ].join(' ')
      );
    }
    return lines.join('\n');
  }
}
