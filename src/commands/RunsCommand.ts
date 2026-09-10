import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';

/**
 * Read-only observability queries over scheduler occurrences:
 *   pixivflow runs list [--limit 20]
 *   pixivflow runs show <executionId>   (executionId == slot id)
 */
export class RunsCommand extends BaseCommand {
  readonly name = 'runs';
  readonly description = 'List scheduler runs and show one execution summary';
  readonly requiresToken = false;
  readonly metadata = {
    category: CommandCategory.MAINTENANCE,
    requiresAuth: true,
    longRunning: false,
  };

  getUsage(): string {
    return [
      'pixivflow runs list [--limit 20]',
      'pixivflow runs show <executionId>',
    ].join('\n');
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const action = args.positional[0] ?? 'list';
    const db = new Database(
      context.config.storage?.databasePath ?? './data/pixiv-downloader.db'
    );
    try {
      db.migrate();
      if (action === 'list') {
        const limit = Number(args.options.limit ?? 20);
        const rows = db.getRecentSchedulerExecutions(Number.isFinite(limit) ? limit : 20);
        const data = rows.map((r) => ({
          id: r.id,
          number: r.executionNumber,
          scheduleId: r.scheduleId,
          status: r.status,
          start: r.startTime,
          end: r.endTime,
          durationMs: r.duration,
        }));
        for (const row of data) context.logger.info('run', row);
        return this.success(`${data.length} run(s)`, data);
      }
      if (action === 'show') {
        const executionId = args.positional[1];
        if (!executionId) return this.failure('Usage: pixivflow runs show <executionId>');
        const summary = db.outbox.executionSummary(executionId);
        const text = JSON.stringify(summary, null, 2);
        context.logger.info(text);
        return this.success('execution summary', summary);
      }
      return this.failure(this.getUsage());
    } finally {
      db.close();
    }
  }
}
