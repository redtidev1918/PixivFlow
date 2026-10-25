import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import { queryRecoveryStatus } from '../scheduler/RecoveryStatusQuery';

/**
 * Read-only recovery ledger query, keyed the same way the execution owner
 * (and TelePost's reconciliation sweep) keys it:
 *
 *   pixivflow recovery-status <targetId> <requestId>
 *
 * Shares ONE implementation with the authenticated HTTP handler
 * `GET /internal/targets/:targetId/recover/:requestId` — an operator on the
 * CLI and a consumer over HTTP can never see two different answers.
 */
export class RecoveryStatusCommand extends BaseCommand {
  readonly name = 'recovery-status';
  readonly description = 'Show one manual recovery request by targetId + requestId';
  readonly requiresToken = false;
  readonly metadata = {
    category: CommandCategory.MAINTENANCE,
    requiresAuth: true,
    longRunning: false,
    rendersResult: true,
  };

  getUsage(): string {
    return 'pixivflow recovery-status <targetId> <requestId>';
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const targetId = args.positional[0];
    const requestId = args.positional[1];
    if (!targetId || !requestId) return this.failure(this.getUsage());
    const db = new Database(
      context.config.storage?.databasePath ?? './data/pixiv-downloader.db'
    );
    try {
      db.migrate();
      const status = queryRecoveryStatus(db, targetId, requestId);
      if (!status) {
        return this.failure(
          `no durable recovery ledger row for target=${targetId} requestId=${requestId}`
        );
      }
      context.logger.info(JSON.stringify(status, null, 2));
      return this.success(`recovery ${status.state}`, status);
    } finally {
      db.close();
    }
  }
}
