/**
 * Logs command - shows recent log entries
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

/**
 * Logs command implementation
 */
export class LogsCommand extends BaseCommand {
  readonly name = 'logs';
  readonly description = 'Show recent log entries';
  readonly aliases = ['log'];
  readonly metadata = {
    category: CommandCategory.MONITORING,
    requiresAuth: false,
    longRunning: false,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const logPath = './data/pixiv-downloader.log';
    const linesArg = args.options.lines || args.options['--lines'] || args.options.n;
    const lines = linesArg ? parseInt(String(linesArg), 10) : 50;

    if (!existsSync(logPath)) {
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║              PixivFlow - Logs                                 ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
      console.log(`  ℹ Log file does not exist: ${logPath}`);
      console.log('  Logs will be created when you run download commands\n');
      return this.success('Log file does not exist');
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Logs                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`📋 Recent ${lines} lines from: ${logPath}\n`);

    try {
      const logContent = await fs.readFile(logPath, 'utf-8');
      const logLines = logContent.split('\n');
      const recentLines = logLines.slice(-lines);
      
      console.log(recentLines.join('\n'));
      console.log('\n');
      console.log(`📄 Full log file: ${path.resolve(logPath)}\n`);

      return this.success(`Showed ${recentLines.length} log lines`);
    } catch (error) {
      return this.failure(
        error instanceof Error ? error : new Error('Failed to read log file'),
        { logPath }
      );
    }
  }

  getUsage?(): string {
    return `logs [--lines <number>]
    
Show recent log entries.

Options:
  --lines <number>    Number of lines to show (default: 50)`;
  }
}

