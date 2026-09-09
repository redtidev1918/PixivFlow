/**
 * reconcile: accept a downstream-confirmed historical duplicate as fact.
 *
 * This is the ONLY way a post-lock historical duplicate enters the ledger.
 * Default mode is a dry-run (prints what would change); --repair applies it.
 *
 *   pixivflow reconcile --target bot1 --type illustration --pixiv-id 123 \
 *       --remote-id 987 --reason "found in channel history" [--repair]
 */
import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import { DeliveryService } from '../delivery/DeliveryService';

export class ReconcileCommand extends BaseCommand {
  readonly name = 'reconcile';
  readonly description = 'Reconcile a downstream-confirmed historical duplicate (dry-run unless --repair)';
  readonly metadata = { category: CommandCategory.MONITORING, requiresAuth: true, longRunning: false };
  readonly requiresToken = false;

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const target = String(args.options.target ?? '').trim();
    const workType = String(args.options.type ?? '').trim();
    const pixivId = String(args.options['pixiv-id'] ?? args.options.pixivId ?? '').trim();
    const remoteId = args.options['remote-id'] ? String(args.options['remote-id']) : undefined;
    const reason = String(args.options.reason ?? 'manual reconciliation').trim();
    const repair = Boolean(args.options.repair);

    if (!target || !workType || !pixivId) {
      return this.failure('Usage: reconcile --target <name> --type <illustration|novel> --pixiv-id <id> [--remote-id <id>] [--reason <text>] [--repair]');
    }
    if (workType !== 'illustration' && workType !== 'novel') {
      return this.failure('--type must be illustration or novel');
    }

    const dbPath = context.config.storage?.databasePath ?? './data/pixiv-downloader.db';
    const db = new Database(dbPath);
    try {
      db.migrate();
      const service = new DeliveryService(db);
      const already = service.isAlreadyDelivered(target, workType, pixivId);
      if (already) {
        context.logger.info('Already recorded as delivered/duplicate; nothing to reconcile', { target, workType, pixivId });
        return this.success('already reconciled', { target, workType, pixivId, noop: true });
      }

      if (!repair) {
        context.logger.info('DRY RUN (pass --repair to apply)', { target, workType, pixivId, remoteId, reason });
        return this.success('dry-run: would record historical duplicate', { dryRun: true, target, workType, pixivId, remoteId, reason });
      }

      const res = service.reconcileHistoricalDuplicate({
        deliveryTarget: target,
        workType,
        pixivId,
        remoteId,
        reason,
      });
      return this.success('historical duplicate reconciled into ledger', {
        deliveryId: res.deliveryId,
        created: res.created,
        target,
        workType,
        pixivId,
      });
    } finally {
      db.close();
    }
  }
}
