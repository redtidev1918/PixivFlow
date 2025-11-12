/**
 * Backup command - automatic backup of configuration and data
 */

import { BaseCommand } from './Command';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Backup command implementation
 */
export class BackupCommand extends BaseCommand {
  readonly name = 'backup';
  readonly description = 'Automatic backup of configuration and data';
  readonly aliases = ['backup-data'];

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const outputDir = (typeof args.options.output === 'string' ? args.options.output : null) ||
                      (typeof args.options.o === 'string' ? args.options.o : null) ||
                      './backups';
    const backupDir = resolve(outputDir);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Automatic Backup                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('  Backup time:', new Date().toLocaleString());
    console.log('  Backup directory:', backupDir);
    console.log('');

    try {
      // Ensure backup directory exists
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }

      // Prepare files to backup
      const filesToBackup: string[] = [];
      const configPath = context.configPath;
      const dbPath = context.config.storage?.databasePath || './data/pixiv-downloader.db';
      const dataDir = resolve('data');
      const configDir = resolve('config');

      console.log('📦 Preparing backup...');

      // Configuration file
      if (existsSync(configPath)) {
        filesToBackup.push(configPath);
        console.log('  ✓ Configuration file');
      }

      // Database
      if (existsSync(dbPath)) {
        filesToBackup.push(dbPath);
        console.log('  ✓ Database');
      }

      // Data directory
      if (existsSync(dataDir)) {
        filesToBackup.push(dataDir);
        console.log('  ✓ Data directory');
      }

      // Config directory
      if (existsSync(configDir)) {
        filesToBackup.push(configDir);
        console.log('  ✓ Config directory');
      }

      if (filesToBackup.length === 0) {
        console.log('  ⚠ No files to backup');
        console.log('');
        return this.success('No files to backup');
      }

      console.log('');

      // Create backup file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      const backupFile = join(backupDir, `pixivflow_backup_${timestamp}.tar.gz`);

      console.log('  Creating backup archive...');

      // Create tar.gz archive
      await this.createArchive(backupFile, filesToBackup);

      const stats = statSync(backupFile);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      console.log('  ✓ Backup completed successfully');
      console.log('  📄 Backup file:', backupFile);
      console.log('  📊 Backup size:', sizeMB, 'MB');
      console.log('');

      // Clean old backups (keep last 7)
      this.cleanOldBackups(backupDir, 7);

      return this.success('Backup completed', { backupFile, size: stats.size });
    } catch (error) {
      return this.failure(
        error instanceof Error ? error : new Error('Failed to create backup'),
        { backupDir }
      );
    }
  }

  private async createArchive(backupFile: string, files: string[]): Promise<void> {
    // Use tar command if available, otherwise just copy files
    try {
      // Try using tar command
      const fileArgs = files.map(f => `"${f}"`).join(' ');
      const cwd = process.cwd();
      await execAsync(`cd "${cwd}" && tar -czf "${backupFile}" ${fileArgs}`, {
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (error) {
      // Fallback: create a simple directory backup
      const backupDir = backupFile.replace('.tar.gz', '');
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }

      const { copyFileSync, mkdirSync: mkdir } = require('fs');
      const { dirname } = require('path');

      for (const file of files) {
        const dest = join(backupDir, file);
        const destDir = dirname(dest);
        if (!existsSync(destDir)) {
          mkdir(destDir, { recursive: true });
        }
        if (statSync(file).isFile()) {
          copyFileSync(file, dest);
        }
      }

      // Rename directory to .tar.gz for consistency
      // In practice, user would need to manually compress
      throw new Error('tar command not available, files copied to directory (manual compression needed)');
    }
  }

  private cleanOldBackups(backupDir: string, keepCount: number): void {
    try {
      const files = readdirSync(backupDir)
        .filter(f => f.startsWith('pixivflow_backup_') && f.endsWith('.tar.gz'))
        .map(f => join(backupDir, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

      if (files.length > keepCount) {
        const toDelete = files.slice(keepCount);
        const { unlinkSync } = require('fs');
        let deleted = 0;
        toDelete.forEach(f => {
          try {
            unlinkSync(f);
            deleted++;
          } catch (e) {
            // Ignore errors
          }
        });
        if (deleted > 0) {
          console.log(`  ℹ Cleaned ${deleted} old backup(s), kept last ${keepCount}`);
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  getUsage(): string {
    return `backup [options]

Automatic backup of configuration and data.

Options:
  -o, --output <path>    Output directory for backups (default: ./backups)

Examples:
  pixivflow backup                    # Create backup in ./backups
  pixivflow backup --output /path/to/backups  # Custom backup location`;
  }
}

