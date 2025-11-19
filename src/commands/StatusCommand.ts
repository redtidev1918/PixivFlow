/**
 * Status command - shows download statistics and recent records
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import { existsSync } from 'fs';

/**
 * Status command implementation
 */
export class StatusCommand extends BaseCommand {
  readonly name = 'status';
  readonly description = 'Show download statistics and recent records';
  readonly aliases = ['stats', 'info'];
  readonly metadata = {
    category: CommandCategory.MONITORING,
    requiresAuth: false,
    longRunning: false,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const dbPath = context.config.storage?.databasePath || './data/pixiv-downloader.db';
    
    if (!existsSync(dbPath)) {
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║              PixivFlow - Download Status                        ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
      console.log('  ℹ No download records yet');
      console.log('  Run: pixivflow download to start downloading\n');
      return this.success('No download records yet');
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Download Status                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    try {
      const db = new Database(dbPath);
      db.migrate();

      // Get statistics
      const stats = db.getDownloadStats();
      
      console.log('📊 Statistics:');
      console.log(`  Total: ${stats.total} item(s)`);
      console.log(`  Illustrations: ${stats.byType.illustration || 0}`);
      console.log(`  Novels: ${stats.byType.novel || 0}`);
      console.log('');

      // Get recent downloads
      const recent = db.getDownloadHistory({
        page: 1,
        limit: 10,
        sortBy: 'downloadedAt',
        sortOrder: 'desc'
      });

      if (recent.items.length > 0) {
        console.log('📥 Recent Downloads (latest 10):');
        recent.items.forEach((item, index) => {
          const typeIcon = item.type === 'illustration' ? '🖼️' : '📖';
          const date = new Date(item.downloadedAt).toLocaleString();
          const title = item.title.length > 40 
            ? item.title.substring(0, 37) + '...' 
            : item.title;
          console.log(`  ${index + 1}. ${typeIcon} [${item.pixivId}] ${title}`);
          console.log(`     Tag: ${item.tag} | Date: ${date}`);
        });
        console.log('');
      }

      db.close();

      return this.success(`Statistics: ${stats.total} total downloads`);
    } catch (error) {
      return this.failure(
        error instanceof Error ? error : new Error('Failed to read database'),
        { dbPath }
      );
    }
  }
}

