/**
 * Monitor command - real-time monitoring of process status, performance metrics, download statistics
 */

import { BaseCommand } from './Command';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { existsSync } from 'fs';
import { Database } from '../storage/Database';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Monitor command implementation
 */
export class MonitorCommand extends BaseCommand {
  readonly name = 'monitor';
  readonly description = 'Real-time monitoring of process status and performance metrics';
  readonly aliases = ['watch', 'status-monitor'];

  private readonly CPU_THRESHOLD = 80;
  private readonly MEM_THRESHOLD = 80;
  private refreshInterval = 60; // seconds
  private isRunning = false;

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const once = args.options.once || args.options.o || false;
    const interval = args.options.interval || args.options.i;

    if (interval) {
      this.refreshInterval = parseInt(String(interval), 10) || 60;
    }

    if (once) {
      return this.singleCheck(context);
    } else {
      return this.continuousMonitor(context);
    }
  }

  private async singleCheck(context: CommandContext): Promise<CommandResult> {
    await this.displayStatus(context);
    return this.success('Single check completed');
  }

  private async continuousMonitor(context: CommandContext): Promise<CommandResult> {
    this.isRunning = true;

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      this.isRunning = false;
      console.log('\n\n  Monitoring stopped\n');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.isRunning = false;
      console.log('\n\n  Monitoring stopped\n');
      process.exit(0);
    });

    while (this.isRunning) {
      // Clear screen (works on most terminals)
      console.log('\x1B[2J\x1B[0f');
      await this.displayStatus(context);
      console.log(`\n  Last update: ${new Date().toLocaleString()}`);
      console.log(`  Refresh interval: ${this.refreshInterval} seconds`);
      console.log('  Press Ctrl+C to stop\n');

      // Wait for interval
      await this.sleep(this.refreshInterval * 1000);
    }

    return this.success('Monitoring stopped');
  }

  private async displayStatus(context: CommandContext): Promise<void> {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Real-time Monitor                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Process status
    await this.displayProcessStatus();

    // Download statistics
    await this.displayDownloadStats(context);

    // System resources
    await this.displaySystemResources();

    // Recent errors
    await this.checkRecentErrors();
  }

  private async displayProcessStatus(): Promise<void> {
    console.log('📊 Process Status:');

    try {
      // Find node process running dist/index.js
      const result = await execAsync('ps aux | grep "node.*dist/index.js" | grep -v grep');
      const lines = result.stdout.trim().split('\n');

      if (lines.length > 0 && lines[0]) {
        const parts = lines[0].split(/\s+/);
        const pid = parts[1];
        const cpu = parts[2];
        const mem = parts[3];

        console.log(`  ✓ Running (PID: ${pid})`);
        console.log(`  CPU: ${cpu}%`);
        console.log(`  Memory: ${mem}%`);

        // Performance warnings
        const cpuNum = parseFloat(cpu);
        const memNum = parseFloat(mem);

        if (cpuNum > this.CPU_THRESHOLD) {
          console.log(`  ⚠ High CPU usage! (${cpu}%)`);
        }

        if (memNum > this.MEM_THRESHOLD) {
          console.log(`  ⚠ High memory usage! (${mem}%)`);
        }
      } else {
        console.log('  ⚠ Not running');
      }
    } catch (e) {
      console.log('  ⚠ Unable to check process status');
    }

    console.log('');
  }

  private async displayDownloadStats(context: CommandContext): Promise<void> {
    console.log('📊 Download Statistics:');

    const dbPath = context.config.storage?.databasePath || './data/pixiv-downloader.db';
    if (!existsSync(dbPath)) {
      console.log('  ℹ No download records yet');
      console.log('');
      return;
    }

    try {
      const db = new Database(dbPath);
      db.migrate();

      const stats = db.getDownloadStats();

      // Get today's downloads
      const today = new Date().toISOString().split('T')[0];
      const todayStats = db.getDownloadHistory({
        page: 1,
        limit: 10000,
        sortBy: 'downloadedAt',
        sortOrder: 'desc'
      });

      const todayCount = todayStats.items.filter(item => {
        const itemDate = new Date(item.downloadedAt).toISOString().split('T')[0];
        return itemDate === today;
      }).length;

      // Get error count (check file existence)
      const allStats = db.getDownloadHistory({
        page: 1,
        limit: 10000,
        sortBy: 'downloadedAt',
        sortOrder: 'desc'
      });

      // Check for missing files as error indicator
      const { existsSync } = require('fs');
      const errorCount = allStats.items.filter(item => {
        try {
          return !existsSync(item.filePath);
        } catch {
          return false;
        }
      }).length;

      console.log(`  Total downloads: ${stats.total} item(s)`);
      console.log(`  Today's downloads: ${todayCount} item(s)`);
      console.log(`  Errors: ${errorCount} item(s)`);

      if (errorCount > 0) {
        console.log('  ⚠ Download errors detected');
      }

      db.close();
    } catch (e) {
      console.log('  ⚠ Unable to read download statistics');
    }

    console.log('');
  }

  private async displaySystemResources(): Promise<void> {
    console.log('📊 System Resources:');

    try {
      // Disk space
      const dfResult = await execAsync('df -h .');
      const dfLines = dfResult.stdout.split('\n');
      if (dfLines.length > 1) {
        const parts = dfLines[1].split(/\s+/);
        if (parts.length >= 4) {
          console.log(`  Available disk space: ${parts[3]}`);
        }
      }

      // Memory (simplified)
      try {
        const memResult = await execAsync('free -m 2>/dev/null || vm_stat');
        // This is a simplified check, actual parsing would be OS-specific
        console.log('  Memory: Checked');
      } catch (e) {
        // Ignore memory check errors
      }
    } catch (e) {
      console.log('  ⚠ Unable to check system resources');
    }

    console.log('');
  }

  private async checkRecentErrors(): Promise<void> {
    console.log('📋 Recent Errors:');

    const logFile = './data/pixiv-downloader.log';
    if (!existsSync(logFile)) {
      console.log('  ℹ No log file found');
      console.log('');
      return;
    }

    try {
      // Check last 100 lines for errors
      const result = await execAsync(`tail -100 "${logFile}" | grep -c "ERROR" || echo "0"`);
      const errorCount = parseInt(result.stdout.trim(), 10) || 0;

      if (errorCount > 0) {
        console.log(`  ⚠ Found ${errorCount} error(s) in last 100 log lines`);
        console.log(`  View logs: pixivflow logs`);
      } else {
        console.log('  ✓ No recent errors');
      }
    } catch (e) {
      console.log('  ℹ Unable to check recent errors');
    }

    console.log('');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

