/**
 * Health check command - performs system health diagnostics
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

/**
 * Health check command implementation
 */
export class HealthCommand extends BaseCommand {
  readonly name = 'health';
  readonly description = 'Perform system health check and diagnostics';
  readonly aliases = ['check', 'diagnostic'];
  readonly metadata = {
    category: CommandCategory.MONITORING,
    requiresAuth: false,
    longRunning: false,
  };
  readonly requiresToken = false;

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const issues: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          PixivFlow - Health Check & Diagnostics                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // 1. Check runtime environment
    this.checkRuntimeEnvironment(info, warnings, issues);

    // 2. Check configuration
    await this.checkConfiguration(context, info, warnings, issues);

    // 3. Check database
    await this.checkDatabase(context, info, warnings, issues);

    // 4. Check authentication
    this.checkAuthentication(context, info, warnings, issues);

    // 5. Check network (optional, non-blocking)
    await this.checkNetwork(context, info, warnings);

    // Print summary
    this.printSummary(issues, warnings, info);

    return {
      success: issues.length === 0,
      message: issues.length === 0 
        ? 'Health check passed' 
        : `Found ${issues.length} issue(s)`,
      data: { issues, warnings, info }
    };
  }

  private checkRuntimeEnvironment(
    info: string[],
    warnings: string[],
    issues: string[]
  ): void {
    console.log('📋 Runtime Environment:');
    
    // Node.js version
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    if (nodeMajor >= 18) {
      info.push(`✓ Node.js ${nodeVersion}`);
      console.log(`  ✓ Node.js ${nodeVersion}`);
    } else {
      warnings.push(`Node.js version ${nodeVersion} may be too low, recommended >= 18.0.0`);
      console.log(`  ⚠ Node.js ${nodeVersion} (recommended >= 18.0.0)`);
    }

    // npm version
    try {
      const npmVersion = require('child_process').execSync('npm -v', { encoding: 'utf-8' }).trim();
      info.push(`✓ npm ${npmVersion}`);
      console.log(`  ✓ npm ${npmVersion}`);
    } catch {
      warnings.push('Unable to detect npm version');
      console.log(`  ⚠ Unable to detect npm version`);
    }

    // Platform
    info.push(`✓ OS: ${process.platform}`);
    console.log(`  ✓ OS: ${process.platform}`);
    
    console.log('');
  }

  private async checkConfiguration(
    context: CommandContext,
    info: string[],
    warnings: string[],
    issues: string[]
  ): Promise<void> {
    console.log('📋 Configuration File:');
    
    const configPath = context.configPath;
    
    if (!existsSync(configPath)) {
      issues.push('Configuration file does not exist');
      console.log(`  ✗ Configuration file does not exist: ${configPath}`);
      console.log(`    Run: pixivflow login or pixivflow setup`);
      console.log('');
      return;
    }

    info.push(`✓ Configuration file exists: ${configPath}`);
    console.log(`  ✓ Configuration file exists: ${configPath}`);

    // Check if config is valid JSON
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      JSON.parse(configContent);
      info.push('✓ Configuration file format is valid');
      console.log(`  ✓ Configuration file format is valid`);
    } catch (error) {
      issues.push('Configuration file JSON format error');
      console.log(`  ✗ Configuration file JSON format error`);
      console.log(`    Error: ${error instanceof Error ? error.message : String(error)}`);
      console.log('');
      return;
    }

    // Check required fields
    const config = context.config;
    if (!config.pixiv?.refreshToken || config.pixiv.refreshToken === 'YOUR_REFRESH_TOKEN') {
      warnings.push('Authentication not configured');
      console.log(`  ⚠ Authentication not configured`);
      console.log(`    Run: pixivflow login`);
    } else {
      info.push('✓ Authentication configured');
      console.log(`  ✓ Authentication configured`);
    }

    if (!config.targets || config.targets.length === 0) {
      warnings.push('Download targets not configured');
      console.log(`  ⚠ Download targets not configured`);
    } else {
      info.push(`✓ Download targets configured (${config.targets.length} target(s))`);
      console.log(`  ✓ Download targets configured (${config.targets.length} target(s))`);
    }

    console.log('');
  }

  private async checkDatabase(
    context: CommandContext,
    info: string[],
    warnings: string[],
    issues: string[]
  ): Promise<void> {
    console.log('📋 Database:');
    
    const dbPath = context.config.storage?.databasePath || './data/pixiv-downloader.db';
    
    if (!existsSync(dbPath)) {
      info.push('Database file does not exist (will be created on first run)');
      console.log(`  ℹ Database file does not exist (will be created on first run)`);
      console.log(`    Path: ${dbPath}`);
      console.log('');
      return;
    }

    info.push(`✓ Database file exists: ${dbPath}`);
    console.log(`  ✓ Database file exists: ${dbPath}`);

    // Check database integrity
    try {
      const db = new Database(dbPath);
      db.migrate(); // Ensure migrations are up to date
      
      // Try to query the database
      const downloadStats = db.getDownloadStats();
      info.push(`✓ Database connection OK`);
      console.log(`  ✓ Database connection OK`);
      console.log(`  ✓ Download records: ${downloadStats.total}`);
      
      // Check database file size
      try {
        const fileStats = await fs.stat(dbPath);
        const sizeMB = (fileStats.size / 1024 / 1024).toFixed(2);
        info.push(`✓ Database size: ${sizeMB} MB`);
        console.log(`  ✓ Database size: ${sizeMB} MB`);
      } catch {
        // Ignore stat errors
      }

      db.close();
    } catch (error) {
      issues.push('Database connection failed or corrupted');
      console.log(`  ✗ Database connection failed or corrupted`);
      console.log(`    Error: ${error instanceof Error ? error.message : String(error)}`);
      console.log('');
      return;
    }

    console.log('');
  }

  private checkAuthentication(
    context: CommandContext,
    info: string[],
    warnings: string[],
    issues: string[]
  ): void {
    console.log('📋 Authentication Status:');
    
    const refreshToken = context.config.pixiv?.refreshToken;
    
    if (!refreshToken || refreshToken === 'YOUR_REFRESH_TOKEN') {
      warnings.push('Authentication not configured');
      console.log(`  ⚠ Authentication not configured`);
      console.log(`    Run: pixivflow login`);
    } else {
      info.push('✓ Authentication configured');
      console.log(`  ✓ Authentication configured`);
      
      // Check if token looks valid (basic check)
      if (refreshToken.length < 20) {
        warnings.push('Authentication token may be invalid (unusual length)');
        console.log(`  ⚠ Authentication token may be invalid (unusual length)`);
      } else {
        info.push('✓ Authentication token format OK');
        console.log(`  ✓ Authentication token format OK`);
      }
    }

    console.log('');
  }

  private async checkNetwork(
    context: CommandContext,
    info: string[],
    warnings: string[]
  ): Promise<void> {
    console.log('📋 Network Connection:');
    
    try {
      const timeout = 5000; // 5 seconds
      const testUrl = 'https://www.pixiv.net';

      // Honor network.proxy from the config: the download pipeline routes
      // requests through PixivApiCore with undici ProxyAgent/socks, so the
      // connectivity probe must use the same path — a raw https.get here
      // always reports timeout for proxied setups.
      const proxy = context.config?.network?.proxy;
      const useProxy = !!(proxy?.enabled && proxy.host && proxy.port);

      if (useProxy) {
        const undici = require('undici');
        const protocol = (proxy!.protocol || 'http').toLowerCase();
        const auth =
          proxy!.username && proxy!.password
            ? `${encodeURIComponent(proxy!.username)}:${encodeURIComponent(proxy!.password)}@`
            : '';
        const dispatcher = new undici.ProxyAgent(
          `${protocol}://${auth}${proxy!.host}:${proxy!.port}`
        );
        const res = await undici.request(testUrl, {
          dispatcher,
          headersTimeout: timeout,
          bodyTimeout: timeout,
          maxRedirections: 2,
        });
        if (res.statusCode >= 500) {
          throw new Error(`Unexpected status: ${res.statusCode}`);
        }
      } else {
        const https = require('https');
        await new Promise<void>((resolve, reject) => {
          const req = https.get(testUrl, { timeout }, (res: any) => {
            if (res.statusCode === 200 || res.statusCode === 403) {
              // 403 is expected for pixiv.net (they block direct access)
              resolve();
            } else {
              reject(new Error(`Unexpected status: ${res.statusCode}`));
            }
          });

          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Connection timeout'));
          });

          setTimeout(() => {
            req.destroy();
            reject(new Error('Timeout'));
          }, timeout);
        });
      }
      
      info.push('✓ Can access Pixiv (proxy may be required)');
      console.log(`  ✓ Can access Pixiv (proxy may be required)`);
    } catch (error) {
      warnings.push('Cannot access Pixiv (proxy may be required)');
      console.log(`  ⚠ Cannot access Pixiv (proxy may be required)`);
      console.log(`    Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Check proxy environment variables
    if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
      info.push('Proxy configuration detected');
      console.log(`  ℹ Proxy configuration detected:`);
      if (process.env.HTTP_PROXY) {
        console.log(`    HTTP_PROXY: ${process.env.HTTP_PROXY}`);
      }
      if (process.env.HTTPS_PROXY) {
        console.log(`    HTTPS_PROXY: ${process.env.HTTPS_PROXY}`);
      }
    }

    console.log('');
  }

  private printSummary(issues: string[], warnings: string[], info: string[]): void {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    
    if (issues.length === 0 && warnings.length === 0) {
      console.log('║  ✓ Health check passed! System is running normally          ║');
    } else if (issues.length === 0) {
      console.log(`║  ⚠ Found ${warnings.length} warning(s)                              ║`);
      console.log('║  System can run normally, but please check warnings         ║');
    } else {
      console.log(`║  ✗ Found ${issues.length} issue(s) and ${warnings.length} warning(s)        ║`);
      console.log('║  Please fix issues before using the system                   ║');
    }
    
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  }
}

