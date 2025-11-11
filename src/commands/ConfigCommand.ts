/**
 * Config command - configuration management tool
 */

import { BaseCommand } from './Command';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { ConfigManager } from '../utils/config-manager';

/**
 * Config command implementation
 */
export class ConfigCommand extends BaseCommand {
  readonly name = 'config';
  readonly description = 'Configuration management tool (view/edit/backup/restore)';
  readonly aliases = ['cfg', 'conf'];

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const subcommand = args.positional[0] || 'show';
    const configPath = context.configPath;
    const backupDir = join(resolve('config'), 'backups');

    switch (subcommand) {
      case 'show':
        return this.showConfig(configPath);
      case 'validate':
        return this.validateConfig(configPath);
      case 'backup':
        return this.backupConfig(configPath, backupDir);
      case 'restore':
        return this.restoreConfig(configPath, backupDir, args.positional[1]);
      case 'list':
        return this.listBackups(backupDir);
      case 'diff':
        return this.diffConfig(configPath, backupDir);
      case 'edit':
        return this.editConfig(configPath, backupDir);
      default:
        return this.showHelp();
    }
  }

  private showConfig(configPath: string): CommandResult {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Configuration                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (!existsSync(configPath)) {
      console.log('  ✗ Configuration file not found:', configPath);
      console.log('  Run: pixivflow config edit to create configuration\n');
      return this.failure('Configuration file not found');
    }

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));

      console.log('📌 Basic Settings:');
      console.log('  Log Level:', config.logLevel || 'info');
      console.log('');

      console.log('🔐 Authentication:');
      const token = config.pixiv?.refreshToken || '';
      if (token && token !== 'YOUR_REFRESH_TOKEN') {
        const masked = token.substring(0, 20) + '...' + token.substring(token.length - 10);
        console.log('  Refresh Token:', masked);
      } else {
        console.log('  ⚠ Refresh token not configured');
      }
      console.log('');

      console.log('🌐 Network:');
      console.log('  Timeout:', (config.network?.timeoutMs || 30000) + 'ms');
      console.log('  Retries:', config.network?.retries || 3);
      if (config.network?.proxy?.enabled) {
        const proxy = config.network.proxy;
        console.log('  Proxy:', `${proxy.protocol}://${proxy.host}:${proxy.port}`);
      } else {
        console.log('  Proxy: Not enabled');
      }
      console.log('');

      console.log('💾 Storage:');
      console.log('  Database:', config.storage?.databasePath || './data/pixiv-downloader.db');
      console.log('  Download Directory:', config.storage?.downloadDirectory || './downloads');
      console.log('  Illustration Directory:', config.storage?.illustrationDirectory || '{downloadDirectory}/illustrations');
      console.log('  Novel Directory:', config.storage?.novelDirectory || '{downloadDirectory}/novels');
      console.log('');

      console.log('⏰ Scheduler:');
      console.log('  Enabled:', config.scheduler?.enabled ? '✓ Yes' : '✗ No');
      if (config.scheduler?.enabled) {
        console.log('  Cron:', config.scheduler.cron || 'N/A');
        console.log('  Timezone:', config.scheduler.timezone || 'UTC');
      }
      console.log('');

      const targets = config.targets || [];
      console.log(`🎯 Download Targets (${targets.length}):`);
      targets.forEach((t: any, i: number) => {
        console.log(`  ${i + 1}. ${String(t.type || 'unknown').padEnd(13)} | Tag: ${String(t.tag || '').padEnd(20)} | Limit: ${t.limit || 'N/A'}`);
        if (t.minBookmarks) {
          console.log('     Min Bookmarks:', t.minBookmarks);
        }
        if (t.startDate || t.endDate) {
          console.log('     Date Range:', (t.startDate || 'unlimited') + ' ~ ' + (t.endDate || 'unlimited'));
        }
      });
      console.log('');

      console.log('📄 Configuration file:', configPath);
      console.log('');

      return this.success('Configuration displayed');
    } catch (error) {
      return this.failure(
        error instanceof Error ? error : new Error('Failed to read configuration'),
        { configPath }
      );
    }
  }

  private validateConfig(configPath: string): CommandResult {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Validate Configuration                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (!existsSync(configPath)) {
      console.log('  ✗ Configuration file not found:', configPath);
      return this.failure('Configuration file not found');
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      console.log('  ✓ JSON format is valid');

      let errors = 0;

      // Check refresh token
      const token = config.pixiv?.refreshToken;
      if (!token || token === 'YOUR_REFRESH_TOKEN') {
        console.log('  ⚠ Refresh token not configured');
        errors++;
      } else {
        console.log('  ✓ Authentication configured');
      }

      // Check targets
      const targets = config.targets || [];
      if (targets.length === 0) {
        console.log('  ⚠ Download targets not configured');
        errors++;
      } else {
        console.log('  ✓ Download targets configured');
      }

      console.log('');

      if (errors === 0) {
        console.log('  ✓ Configuration is valid\n');
        return this.success('Configuration is valid');
      } else {
        console.log(`  ⚠ Found ${errors} configuration issue(s)\n`);
        return this.failure(`Found ${errors} configuration issue(s)`);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.log('  ✗ JSON format error:', error.message);
        return this.failure('JSON format error', { error: error.message });
      }
      return this.failure(
        error instanceof Error ? error : new Error('Failed to validate configuration')
      );
    }
  }

  private backupConfig(configPath: string, backupDir: string): CommandResult {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Backup Configuration                  ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (!existsSync(configPath)) {
      console.log('  ✗ Configuration file not found:', configPath);
      return this.failure('Configuration file not found');
    }

    try {
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      const backupFile = join(backupDir, `standalone.config.${timestamp}.json`);

      const content = readFileSync(configPath, 'utf-8');
      writeFileSync(backupFile, content, 'utf-8');

      console.log('  ✓ Configuration backed up successfully');
      console.log('  📄 Backup file:', backupFile);
      console.log('');

      // Clean old backups (keep last 10)
      this.cleanOldBackups(backupDir, 10);

      return this.success('Configuration backed up', { backupFile });
    } catch (error) {
      return this.failure(
        error instanceof Error ? error : new Error('Failed to backup configuration')
      );
    }
  }

  private restoreConfig(configPath: string, backupDir: string, backupName?: string): CommandResult {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Restore Configuration                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (!existsSync(backupDir)) {
      console.log('  ✗ Backup directory not found:', backupDir);
      return this.failure('Backup directory not found');
    }

    try {
      let backupFile: string;

      if (backupName) {
        // Find backup by name or timestamp
        const files = readdirSync(backupDir)
          .filter(f => f.startsWith('standalone.config.') && f.endsWith('.json'))
          .map(f => join(backupDir, f))
          .filter(f => {
            const name = f.toLowerCase();
            return name.includes(backupName.toLowerCase());
          });

        if (files.length === 0) {
          console.log('  ✗ Backup not found:', backupName);
          return this.failure('Backup not found');
        }

        // Sort by modification time (newest first)
        files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
        backupFile = files[0];
      } else {
        // Get latest backup
        const files = readdirSync(backupDir)
          .filter(f => f.startsWith('standalone.config.') && f.endsWith('.json'))
          .map(f => join(backupDir, f))
          .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

        if (files.length === 0) {
          console.log('  ✗ No backups available');
          return this.failure('No backups available');
        }

        backupFile = files[0];
      }

      console.log('  📄 Restoring from:', backupFile);

      // Backup current config first
      if (existsSync(configPath)) {
        this.backupConfig(configPath, backupDir);
      }

      // Restore
      const content = readFileSync(backupFile, 'utf-8');
      writeFileSync(configPath, content, 'utf-8');

      console.log('  ✓ Configuration restored successfully');
      console.log('  📄 Configuration file:', configPath);
      console.log('');

      // Validate restored config
      const validation = this.validateConfig(configPath);
      if (!validation.success) {
        console.log('  ⚠ Restored configuration may need adjustments\n');
      }

      return this.success('Configuration restored', { backupFile });
    } catch (error) {
      return this.failure(
        error instanceof Error ? error : new Error('Failed to restore configuration')
      );
    }
  }

  private listBackups(backupDir: string): CommandResult {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Configuration Backups                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (!existsSync(backupDir)) {
      console.log('  ℹ Backup directory does not exist');
      return this.success('No backups found');
    }

    try {
      const files = readdirSync(backupDir)
        .filter(f => f.startsWith('standalone.config.') && f.endsWith('.json'))
        .map(f => join(backupDir, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

      if (files.length === 0) {
        console.log('  ℹ No backup files found');
        console.log('');
        return this.success('No backups found');
      }

      console.log('No.  Date & Time              Size      Filename');
      console.log('─────────────────────────────────────────────────────────────────');

      files.forEach((file, index) => {
        const stats = statSync(file);
        const size = (stats.size / 1024).toFixed(2) + ' KB';
        const filename = file.split('/').pop() || '';
        const timestamp = filename.replace('standalone.config.', '').replace('.json', '').replace('_', ' ');

        console.log(`${String(index + 1).padEnd(4)} ${timestamp.padEnd(23)} ${size.padEnd(9)} ${filename}`);
      });

      console.log('');
      console.log('📁 Backup directory:', backupDir);
      console.log('');

      return this.success(`Found ${files.length} backup(s)`);
    } catch (error) {
      return this.failure(
        error instanceof Error ? error : new Error('Failed to list backups')
      );
    }
  }

  private diffConfig(configPath: string, backupDir: string): CommandResult {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Configuration Diff                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (!existsSync(configPath)) {
      console.log('  ✗ Configuration file not found');
      return this.failure('Configuration file not found');
    }

    if (!existsSync(backupDir)) {
      console.log('  ✗ Backup directory not found');
      return this.failure('Backup directory not found');
    }

    try {
      const files = readdirSync(backupDir)
        .filter(f => f.startsWith('standalone.config.') && f.endsWith('.json'))
        .map(f => join(backupDir, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

      if (files.length === 0) {
        console.log('  ✗ No backups available');
        return this.failure('No backups available');
      }

      const latestBackup = files[0];
      const current = JSON.parse(readFileSync(configPath, 'utf-8'));
      const backup = JSON.parse(readFileSync(latestBackup, 'utf-8'));

      console.log('  Current:', configPath);
      console.log('  Backup:', latestBackup);
      console.log('');

      // Simple comparison
      const currentStr = JSON.stringify(current, null, 2);
      const backupStr = JSON.stringify(backup, null, 2);

      if (currentStr === backupStr) {
        console.log('  ✓ Configurations are identical\n');
        return this.success('Configurations are identical');
      } else {
        console.log('  ⚠ Configurations differ');
        console.log('  Use a diff tool to see detailed differences\n');
        return this.success('Configurations differ');
      }
    } catch (error) {
      return this.failure(
        error instanceof Error ? error : new Error('Failed to compare configurations')
      );
    }
  }

  private editConfig(configPath: string, backupDir: string): CommandResult {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Edit Configuration                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Backup first
    this.backupConfig(configPath, backupDir);

    const editor = process.env.EDITOR || process.env.VISUAL || 'nano';
    console.log(`  Opening configuration in: ${editor}`);
    console.log('  File:', configPath);
    console.log('');

    // Note: In a real implementation, you might want to use child_process.spawn
    // to open the editor. For now, we'll just inform the user.
    console.log('  ℹ Please edit the file manually and run "pixivflow config validate" to verify');
    console.log('');

    return this.success('Configuration file ready for editing');
  }

  private cleanOldBackups(backupDir: string, keepCount: number): void {
    try {
      const files = readdirSync(backupDir)
        .filter(f => f.startsWith('standalone.config.') && f.endsWith('.json'))
        .map(f => join(backupDir, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

      if (files.length > keepCount) {
        const toDelete = files.slice(keepCount);
        const { unlinkSync } = require('fs');
        toDelete.forEach(f => {
          try {
            unlinkSync(f);
          } catch (e) {
            // Ignore errors
          }
        });
      }
    } catch (error) {
      // Ignore errors
    }
  }

  private showHelp(): CommandResult {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PixivFlow - Configuration Manager                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Commands:');
    console.log('  show         View current configuration (formatted)');
    console.log('  validate     Validate configuration file format');
    console.log('  backup       Backup current configuration');
    console.log('  restore      Restore configuration from latest backup');
    console.log('  list         List all backups');
    console.log('  diff         Compare current config with backup');
    console.log('  edit         Edit configuration file');
    console.log('');

    console.log('💡 Examples:');
    console.log('  pixivflow config show              # View configuration');
    console.log('  pixivflow config validate           # Validate configuration');
    console.log('  pixivflow config backup            # Backup configuration');
    console.log('  pixivflow config restore            # Restore latest backup');
    console.log('  pixivflow config list               # List backups');
    console.log('  pixivflow config diff               # Compare with backup');
    console.log('  pixivflow config edit               # Edit configuration');
    console.log('');

    return this.success('Help displayed');
  }
}

