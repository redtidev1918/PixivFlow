/**
 * Maintain command - automatic maintenance (cleanup logs, optimize database, etc.)
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { existsSync, readdirSync, statSync, unlinkSync, chmodSync } from 'fs';
import { join, resolve } from 'path';
import { Database } from '../storage/Database';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getConfigPath } from '../config';

const execAsync = promisify(exec);

/**
 * Maintain command implementation
 */
export class MaintainCommand extends BaseCommand {
  readonly name = 'maintain';
  readonly description = 'Automatic maintenance (cleanup logs, optimize database, etc.)';
  readonly aliases = ['maintenance', 'cleanup'];
  readonly metadata = {
    category: CommandCategory.MAINTENANCE,
    requiresAuth: false,
    longRunning: false,
  };

  private readonly LOG_RETENTION_DAYS = 30;
  private readonly BACKUP_RETENTION_DAYS = 7;
  private readonly MAX_LOG_SIZE_MB = 100;

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Automatic Maintenance                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('  Start time:', new Date().toLocaleString());
    console.log('');

    try {
      await this.cleanupLogs();
      await this.cleanupBackups();
      await this.cleanupTemp();
      await this.cleanupCache(context);
      await this.optimizeDatabase(context);
      await this.fixPermissions();
      await this.checkDiskSpace();

      console.log('════════════════════════════════════════════════════════════════');
      console.log('  ✓ Maintenance completed');
      console.log('  Completion time:', new Date().toLocaleString());
      console.log('════════════════════════════════════════════════════════════════\n');

      return this.success('Maintenance completed');
    } catch (error) {
      return this.failure(
        error instanceof Error ? error : new Error('Maintenance failed')
      );
    }
  }

  private async cleanupLogs(): Promise<void> {
    console.log('📋 Cleaning old logs...');

    const logDir = resolve('logs');
    if (!existsSync(logDir)) {
      console.log('  ℹ Log directory does not exist, skipping');
      console.log('');
      return;
    }

    const files = readdirSync(logDir)
      .map(f => join(logDir, f))
      .filter(f => {
        try {
          return statSync(f).isFile() && f.endsWith('.log');
        } catch {
          return false;
        }
      });

    if (files.length === 0) {
      console.log('  ℹ No log files found');
      console.log('');
      return;
    }

    console.log(`  Current log files: ${files.length}`);

    // Delete logs older than retention period
    const now = Date.now();
    const retentionMs = this.LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const file of files) {
      try {
        const stats = statSync(file);
        const age = now - stats.mtimeMs;
        if (age > retentionMs) {
          unlinkSync(file);
          deleted++;
        }
      } catch (e) {
        // Ignore errors
      }
    }

    if (deleted > 0) {
      console.log(`  ✓ Deleted ${deleted} expired log file(s) (>${this.LOG_RETENTION_DAYS} days)`);
    } else {
      console.log('  ℹ No logs to clean');
    }

    // Compress large log files
    let compressed = 0;
    for (const file of files) {
      try {
        if (existsSync(file) && !file.endsWith('.gz')) {
          const stats = statSync(file);
          const sizeMB = stats.size / (1024 * 1024);
          if (sizeMB > this.MAX_LOG_SIZE_MB) {
            try {
              await execAsync(`gzip "${file}"`);
              compressed++;
              console.log(`  ✓ Compressed: ${file.split('/').pop()} (${sizeMB.toFixed(2)}MB)`);
            } catch (e) {
              // gzip not available, skip
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }

    if (compressed > 0) {
      console.log(`  ✓ Compressed ${compressed} large log file(s) (>${this.MAX_LOG_SIZE_MB}MB)`);
    }

    console.log('');
  }

  private async cleanupBackups(): Promise<void> {
    console.log('📋 Cleaning old backups...');

    const backupDir = resolve('config/backups');
    if (!existsSync(backupDir)) {
      console.log('  ℹ Backup directory does not exist, skipping');
      console.log('');
      return;
    }

    const files = readdirSync(backupDir)
      .map(f => join(backupDir, f))
      .filter(f => {
        try {
          return statSync(f).isFile() && f.endsWith('.json');
        } catch {
          return false;
        }
      });

    if (files.length === 0) {
      console.log('  ℹ No backup files found');
      console.log('');
      return;
    }

    console.log(`  Current backup files: ${files.length}`);

    // Delete backups older than retention period
    const now = Date.now();
    const retentionMs = this.BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const file of files) {
      try {
        const stats = statSync(file);
        const age = now - stats.mtimeMs;
        if (age > retentionMs) {
          unlinkSync(file);
          deleted++;
        }
      } catch (e) {
        // Ignore errors
      }
    }

    if (deleted > 0) {
      console.log(`  ✓ Deleted ${deleted} expired backup(s) (>${this.BACKUP_RETENTION_DAYS} days)`);
    } else {
      console.log('  ℹ No backups to clean');
    }

    console.log('');
  }

  private async cleanupTemp(): Promise<void> {
    console.log('📋 Cleaning temporary files...');

    let cleaned = 0;

    // Clean .tmp directory
    const tmpDir = resolve('.tmp');
    if (existsSync(tmpDir)) {
      try {
        const { rmSync } = require('fs');
        rmSync(tmpDir, { recursive: true, force: true });
        cleaned++;
        console.log('  ✓ Cleaned .tmp directory');
      } catch (e) {
        // Ignore errors
      }
    }

    // Clean root temp files
    const rootDir = process.cwd();
    const tempFiles = readdirSync(rootDir)
      .map(f => join(rootDir, f))
      .filter(f => {
        try {
          return statSync(f).isFile() && (f.endsWith('.tmp') || f.endsWith('.log'));
        } catch {
          return false;
        }
      });

    for (const file of tempFiles) {
      try {
        unlinkSync(file);
        cleaned++;
      } catch (e) {
        // Ignore errors
      }
    }

    // Clean npm cache
    const npmDir = resolve('.npm');
    if (existsSync(npmDir)) {
      try {
        const { rmSync } = require('fs');
        rmSync(npmDir, { recursive: true, force: true });
        cleaned++;
        console.log('  ✓ Cleaned npm cache');
      } catch (e) {
        // Ignore errors
      }
    }

    if (cleaned === 0) {
      console.log('  ℹ No temporary files to clean');
    } else {
      console.log(`  ✓ Cleaned ${cleaned} temporary file(s)/directory(ies)`);
    }

    console.log('');
  }

  /**
   * Prune downloaded cache by age and/or aggregate size, then drop matching
   * DB records. Files are grouped by complete Pixiv work so a multi-page
   * illustration is never left partially cached.
   */
  private async cleanupCache(context: CommandContext): Promise<void> {
    console.log('📋 Cleaning old download cache...');

    const storage = context.config.storage ?? {};
    const retentionDays = storage.cacheRetentionDays
      ?? Number(process.env.CACHE_RETENTION_DAYS || 14);
    const configuredMaxSizeMB = storage.cacheMaxSizeMB
      ?? Number(process.env.CACHE_MAX_SIZE_MB || 0);
    const maxBytes = Number.isFinite(configuredMaxSizeMB) && configuredMaxSizeMB > 0
      ? Math.floor(configuredMaxSizeMB * 1024 * 1024)
      : 0;
    if (!(retentionDays > 0) && maxBytes === 0) {
      console.log('  ℹ Cache pruning disabled');
      console.log('');
      return;
    }

    const dirs = [
      { path: storage.illustrationDirectory, type: 'illustration' as const },
      { path: storage.novelDirectory, type: 'novel' as const },
      { path: storage.downloadDirectory, type: undefined },
    ].filter((entry): entry is { path: string; type: 'illustration' | 'novel' | undefined } => Boolean(entry.path));

    const cutoff = Date.now() - retentionDays * 86400_000;
    let prunedFiles = 0;
    let prunedRecords = 0;
    let reclaimedBytes = 0;
    const seenFiles = new Set<string>();
    type CacheFile = {
      path: string;
      size: number;
      mtimeMs: number;
      pixivId?: string;
      type?: 'illustration' | 'novel';
    };
    type CacheGroup = {
      key: string;
      files: CacheFile[];
      bytes: number;
      newestMtimeMs: number;
      pixivId?: string;
      type?: 'illustration' | 'novel';
    };
    const groups = new Map<string, CacheGroup>();

    const addFile = (file: CacheFile): void => {
      const key = file.pixivId && file.type
        ? `${file.type}:${file.pixivId}`
        : `file:${file.path}`;
      const group = groups.get(key) ?? {
        key,
        files: [],
        bytes: 0,
        newestMtimeMs: 0,
        pixivId: file.pixivId,
        type: file.type,
      };
      group.files.push(file);
      group.bytes += file.size;
      group.newestMtimeMs = Math.max(group.newestMtimeMs, file.mtimeMs);
      groups.set(key, group);
    };

    const walk = (dir: string, typeHint?: 'illustration' | 'novel'): void => {
      if (!existsSync(dir)) return;
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, typeHint);
        } else if (entry.isFile()) {
          try {
            const normalized = resolve(full);
            if (seenFiles.has(normalized)) continue;
            seenFiles.add(normalized);
            const stats = statSync(normalized);
            const idMatch = /^(\d+)/.exec(entry.name);
            addFile({
              path: normalized,
              size: stats.size,
              mtimeMs: stats.mtimeMs,
              pixivId: idMatch?.[1],
              type: idMatch ? (typeHint ?? (normalized.includes('novel') ? 'novel' : 'illustration')) : undefined,
            });
          } catch {
            // Ignore files that disappear while the maintenance scan runs.
          }
        }
      }
    };

    for (const dir of dirs) walk(dir.path, dir.type);

    let totalBytes = [...groups.values()].reduce((sum, group) => sum + group.bytes, 0);
    if (groups.size === 0) {
      console.log('  ℹ Download cache is empty');
      console.log('');
      return;
    }

    const db = new Database(storage.databasePath || './data/pixiv-downloader.db');
    db.migrate();
    const removeGroup = (group: CacheGroup): boolean => {
      let allRemoved = true;
      let removedBytes = 0;
      let removedFiles = 0;
      for (const file of group.files) {
        try {
          unlinkSync(file.path);
          removedBytes += file.size;
          removedFiles++;
        } catch {
          allRemoved = false;
        }
      }
      if (!allRemoved) return false;
      if (group.pixivId && group.type) {
        prunedRecords += db.deleteDownloadByPixivId(group.pixivId, group.type);
      }
      groups.delete(group.key);
      totalBytes -= removedBytes;
      reclaimedBytes += removedBytes;
      prunedFiles += removedFiles;
      return true;
    };

    try {
      if (retentionDays > 0) {
        for (const group of [...groups.values()]) {
          if (group.newestMtimeMs < cutoff) removeGroup(group);
        }
      }

      if (maxBytes > 0 && totalBytes > maxBytes) {
        const oldestFirst = [...groups.values()]
          .sort((a, b) => a.newestMtimeMs - b.newestMtimeMs);
        for (const group of oldestFirst) {
          if (totalBytes <= maxBytes) break;
          removeGroup(group);
        }
      }
    } finally {
      db.close();
    }

    if (prunedFiles === 0) {
      const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1);
      console.log(`  ℹ Cache within policy (${sizeMB} MiB)`);
    } else {
      console.log(
        `  ✓ Pruned ${prunedFiles} cache file(s), ${prunedRecords} DB record(s), ` +
        `reclaimed ${(reclaimedBytes / (1024 * 1024)).toFixed(1)} MiB`
      );
    }
    console.log('');
  }

  private async optimizeDatabase(context: CommandContext): Promise<void> {
    console.log('📋 Optimizing database...');

    const dbPath = context.config.storage?.databasePath || './data/pixiv-downloader.db';
    if (!existsSync(dbPath)) {
      console.log('  ℹ Database does not exist, skipping');
      console.log('');
      return;
    }

    try {
      const statsBefore = statSync(dbPath);
      const sizeBefore = (statsBefore.size / (1024 * 1024)).toFixed(2);

      console.log(`  Database size: ${sizeBefore} MB`);
      console.log('  Optimizing...');

      const db = new Database(dbPath);
      db.migrate();

      // Run VACUUM
      const dbDriver = (db as any).db;
      if (dbDriver) {
        dbDriver.exec('VACUUM;');
        dbDriver.exec('ANALYZE;');
        dbDriver.exec('REINDEX;');
      }

      db.close();

      const statsAfter = statSync(dbPath);
      const sizeAfter = (statsAfter.size / (1024 * 1024)).toFixed(2);

      console.log('  ✓ Database optimization completed');
      console.log(`  Optimized size: ${sizeAfter} MB`);

      // Integrity check
      try {
        const db2 = new Database(dbPath);
        const dbDriver2 = (db2 as any).db;
        if (dbDriver2) {
          const result = dbDriver2.prepare('PRAGMA integrity_check;').get() as { 'integrity_check': string };
          if (result && result.integrity_check === 'ok') {
            console.log('  ✓ Database integrity check passed');
          } else {
            console.log('  ⚠ Database integrity check failed');
          }
        }
        db2.close();
      } catch (e) {
        // Ignore integrity check errors
      }

      console.log('');
    } catch (error) {
      console.log('  ✗ Database optimization failed:', error instanceof Error ? error.message : String(error));
      console.log('');
    }
  }

  private async fixPermissions(): Promise<void> {
    console.log('📋 Checking file permissions...');

    let fixed = 0;
    const dirs = ['data', 'downloads', 'logs', 'config'];

    for (const dir of dirs) {
      const dirPath = resolve(dir);
      if (existsSync(dirPath)) {
        try {
          const stats = statSync(dirPath);
          // Check if writable (simplified check)
          chmodSync(dirPath, 0o755);
          fixed++;
        } catch (e) {
          // Ignore errors
        }
      }
    }

    // Check config file
    // Use getConfigPath to ensure we use the same config path resolution logic
    const configPath = getConfigPath();
    if (existsSync(configPath)) {
      try {
        chmodSync(configPath, 0o644);
        fixed++;
      } catch (e) {
        // Ignore errors
      }
    }

    if (fixed === 0) {
      console.log('  ℹ File permissions are normal');
    } else {
      console.log(`  ✓ Fixed ${fixed} permission issue(s)`);
    }

    console.log('');
  }

  private async checkDiskSpace(): Promise<void> {
    console.log('📋 Checking disk space...');

    try {
      const result = await execAsync('df -h .');
      const lines = result.stdout.split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        if (parts.length >= 4) {
          const available = parts[3];
          console.log(`  Available disk space: ${available}`);

          // Try to parse and check if less than 1GB
          const availableNum = parseFloat(available);
          if (!isNaN(availableNum) && availableNum < 1 && available.includes('G')) {
            console.log('  ⚠ Disk space is low (<1GB), consider cleaning');
          } else {
            console.log('  ✓ Disk space is sufficient');
          }
        }
      }
    } catch (e) {
      console.log('  ℹ Unable to check disk space');
    }

    console.log('');
  }

  getUsage(): string {
    return `maintain [options]

Automatic maintenance (cleanup logs, optimize database, etc.).

This command performs:
  - Cleanup old logs (older than 30 days)
  - Compress large log files (>100MB)
  - Cleanup old backups (older than 7 days)
  - Clean temporary files
  - Optimize database (VACUUM, ANALYZE, REINDEX)
  - Fix file permissions
  - Check disk space

Examples:
  pixivflow maintain                 # Run maintenance tasks`;
  }
}
