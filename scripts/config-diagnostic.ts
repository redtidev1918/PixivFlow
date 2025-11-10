#!/usr/bin/env node

/**
 * Configuration Diagnostic and Repair Tool
 * 
 * This tool helps diagnose and fix configuration issues:
 * - Reads and validates configuration files
 * - Fixes common issues (missing targets, invalid structure, etc.)
 * - Shows detailed configuration information
 * - Repairs corrupted or incomplete configurations
 * 
 * Usage:
 *   npm run build && node dist/scripts/config-diagnostic.js [options]
 * 
 * Options:
 *   --file <path>     Specific config file to check (default: current active config)
 *   --list            List all available config files
 *   --fix             Automatically fix common issues
 *   --validate        Only validate, don't fix
 *   --info            Show detailed configuration information
 *   --repair          Repair corrupted configuration
 *   --backup          Create backup before making changes
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, dirname, basename, relative } from 'path';
import { StandaloneConfig, TargetConfig } from '../src/config';
import { validateConfig } from '../src/webui/utils/config-validator';
import { getConfigManager } from '../src/utils/config-manager';
import { logger } from '../src/logger';

interface DiagnosticResult {
  file: string;
  exists: boolean;
  readable: boolean;
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: string[];
  fixed: boolean;
  config?: Partial<StandaloneConfig>;
}

interface RepairOptions {
  fixMissingTargets?: boolean;
  fixInvalidStructure?: boolean;
  fixMissingFields?: boolean;
  createBackup?: boolean;
}

class ConfigDiagnostic {
  private configDir: string;
  private configManager: ReturnType<typeof getConfigManager>;

  constructor(configDir: string = 'config') {
    this.configDir = resolve(configDir);
    this.configManager = getConfigManager(configDir);
  }

  /**
   * List all available configuration files
   */
  listConfigFiles(): Array<{
    filename: string;
    path: string;
    isActive: boolean;
    modifiedTime: Date;
    size: number;
  }> {
    const files = this.configManager.listConfigFiles();
    return files.map(file => ({
      filename: file.filename,
      path: file.path,
      isActive: file.isActive,
      modifiedTime: file.modifiedTime,
      size: file.size,
    }));
  }

  /**
   * Read and parse a configuration file
   */
  readConfigFile(filePath: string): Partial<StandaloneConfig> | null {
    try {
      if (!existsSync(filePath)) {
        return null;
      }
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as Partial<StandaloneConfig>;
    } catch (error) {
      logger.error('Failed to read config file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Diagnose a configuration file
   */
  diagnose(filePath?: string): DiagnosticResult {
    const targetFile = filePath || this.configManager.getCurrentConfigFile() || 
      join(this.configDir, 'standalone.config.json');
    
    const result: DiagnosticResult = {
      file: targetFile,
      exists: existsSync(targetFile),
      readable: false,
      valid: false,
      errors: [],
      warnings: [],
      issues: [],
      fixed: false,
    };

    if (!result.exists) {
      result.errors.push(`Configuration file does not exist: ${targetFile}`);
      return result;
    }

    // Try to read the file
    const config = this.readConfigFile(targetFile);
    if (!config) {
      result.errors.push('Failed to read or parse configuration file');
      return result;
    }

    result.readable = true;
    result.config = config;

    // Check for common issues
    this.checkCommonIssues(config, result);

    // Validate configuration
    try {
      const validation = validateConfig(config as StandaloneConfig);
      result.valid = validation.valid;
      
      if (!validation.valid) {
        validation.errors.forEach(err => {
          const errorMsg = this.formatValidationError(err);
          result.errors.push(errorMsg);
        });
      }
    } catch (error) {
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Check for common configuration issues
   */
  private checkCommonIssues(config: Partial<StandaloneConfig>, result: DiagnosticResult): void {
    // Check for missing targets field
    if (!config.targets) {
      result.issues.push('Missing "targets" field (should be an array, even if empty)');
    } else if (!Array.isArray(config.targets)) {
      result.issues.push('"targets" field is not an array');
    } else if (config.targets.length === 0) {
      result.warnings.push('"targets" array is empty (no download targets configured)');
    }

    // Check for missing required fields
    if (!config.pixiv) {
      result.issues.push('Missing "pixiv" configuration section');
    } else {
      if (!config.pixiv.clientId) {
        result.issues.push('Missing "pixiv.clientId"');
      }
      if (!config.pixiv.refreshToken) {
        result.issues.push('Missing "pixiv.refreshToken"');
      } else if (config.pixiv.refreshToken === 'YOUR_REFRESH_TOKEN') {
        result.warnings.push('"pixiv.refreshToken" is still a placeholder');
      }
    }

    if (!config.storage) {
      result.issues.push('Missing "storage" configuration section');
    } else {
      if (!config.storage.downloadDirectory) {
        result.issues.push('Missing "storage.downloadDirectory"');
      }
      if (!config.storage.databasePath) {
        result.warnings.push('Missing "storage.databasePath" (will use default)');
      }
    }

    // Check targets structure
    if (config.targets && Array.isArray(config.targets)) {
      config.targets.forEach((target, index) => {
        if (!target.type) {
          result.issues.push(`Target ${index + 1}: Missing "type" field`);
        } else if (target.type !== 'illustration' && target.type !== 'novel') {
          result.issues.push(`Target ${index + 1}: Invalid "type" value: ${target.type}`);
        }
        if (target.mode === 'search' && !target.tag && !target.seriesId && !target.novelId) {
          result.warnings.push(`Target ${index + 1}: Search mode but no tag/seriesId/novelId specified`);
        }
      });
    }
  }

  /**
   * Format validation error for display
   */
  private formatValidationError(error: { code: string; params?: Record<string, any> }): string {
    const code = error.code;
    const params = error.params || {};

    // Map error codes to readable messages
    const errorMessages: Record<string, string> = {
      'CONFIG_VALIDATION_PIXIV_REQUIRED': 'Pixiv configuration is required',
      'CONFIG_VALIDATION_PIXIV_CLIENT_ID_REQUIRED': 'Pixiv client ID is required',
      'CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED': 'Pixiv refresh token is required',
      'CONFIG_VALIDATION_TARGETS_REQUIRED': 'At least one download target is required',
      'CONFIG_VALIDATION_TARGET_TYPE_REQUIRED': `Target ${params.index || '?'}: Type is required`,
      'CONFIG_VALIDATION_TARGET_TYPE_INVALID': `Target ${params.index || '?'}: Invalid type`,
      'CONFIG_VALIDATION_TARGET_LIMIT_INVALID': `Target ${params.index || '?'}: Invalid limit`,
      'CONFIG_VALIDATION_STORAGE_REQUIRED': 'Storage configuration is required',
      'CONFIG_VALIDATION_DOWNLOAD_DIRECTORY_REQUIRED': 'Download directory is required',
      'CONFIG_VALIDATION_CRON_REQUIRED': 'Cron expression is required when scheduler is enabled',
      'CONFIG_VALIDATION_CRON_INVALID': 'Invalid cron expression format',
    };

    return errorMessages[code] || `Validation error: ${code}`;
  }

  /**
   * Repair configuration file
   */
  repair(filePath: string, options: RepairOptions = {}): DiagnosticResult {
    const result = this.diagnose(filePath);
    
    if (!result.readable || !result.config) {
      result.errors.push('Cannot repair: file is not readable or config is invalid');
      return result;
    }

    const config = { ...result.config };
    let fixed = false;

    // Create backup if requested
    if (options.createBackup) {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      try {
        copyFileSync(filePath, backupPath);
        console.log(`✓ Backup created: ${backupPath}`);
      } catch (error) {
        result.warnings.push(`Failed to create backup: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Fix missing targets
    if (options.fixMissingTargets && !config.targets) {
      config.targets = [];
      fixed = true;
      result.issues = result.issues.filter(issue => !issue.includes('targets'));
    }

    // Fix invalid targets structure
    if (options.fixInvalidStructure && config.targets && !Array.isArray(config.targets)) {
      config.targets = [];
      fixed = true;
      result.issues = result.issues.filter(issue => !issue.includes('targets'));
    }

    // Fix missing required fields with defaults
    if (options.fixMissingFields) {
      // Ensure pixiv section exists
      if (!config.pixiv) {
        config.pixiv = {
          clientId: '',
          refreshToken: '',
          userAgent: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 5)',
        };
        fixed = true;
      }

      // Ensure storage section exists
      if (!config.storage) {
        config.storage = {
          downloadDirectory: './downloads',
          databasePath: './data/pixivflow.db',
        };
        fixed = true;
      }

      // Ensure download section exists
      if (!config.download) {
        config.download = {
          concurrency: 3,
          maxRetries: 3,
          retryDelay: 1000,
          timeout: 30000,
        };
        fixed = true;
      }

      // Ensure network section exists
      if (!config.network) {
        config.network = {
          timeoutMs: 30000,
          retries: 3,
          retryDelay: 1000,
        };
        fixed = true;
      }
    }

    // Write repaired config
    if (fixed) {
      try {
        const content = JSON.stringify(config, null, 2);
        writeFileSync(filePath, content, 'utf-8');
        result.fixed = true;
        console.log(`✓ Configuration repaired: ${filePath}`);
      } catch (error) {
        result.errors.push(`Failed to write repaired config: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Re-diagnose after repair
    if (fixed) {
      return this.diagnose(filePath);
    }

    return result;
  }

  /**
   * Print diagnostic results
   */
  printResults(result: DiagnosticResult, showInfo: boolean = false): void {
    console.log('\n' + '='.repeat(80));
    console.log(`Configuration Diagnostic: ${result.file}`);
    console.log('='.repeat(80));

    console.log(`\n📁 File Status:`);
    console.log(`   Exists: ${result.exists ? '✓' : '✗'}`);
    console.log(`   Readable: ${result.readable ? '✓' : '✗'}`);
    console.log(`   Valid: ${result.valid ? '✓' : '✗'}`);

    if (result.errors.length > 0) {
      console.log(`\n❌ Errors (${result.errors.length}):`);
      result.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }

    if (result.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
      result.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
    }

    if (result.issues.length > 0) {
      console.log(`\n🔧 Issues Found (${result.issues.length}):`);
      result.issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
    }

    if (showInfo && result.config) {
      console.log(`\n📋 Configuration Information:`);
      this.printConfigInfo(result.config);
    }

    if (result.fixed) {
      console.log(`\n✅ Configuration has been repaired!`);
    }

    console.log('\n' + '='.repeat(80) + '\n');
  }

  /**
   * Print detailed configuration information
   */
  private printConfigInfo(config: Partial<StandaloneConfig>): void {
    console.log(`   Pixiv:`);
    console.log(`      Client ID: ${config.pixiv?.clientId ? '✓ Set' : '✗ Missing'}`);
    console.log(`      Refresh Token: ${config.pixiv?.refreshToken ? (config.pixiv.refreshToken === 'YOUR_REFRESH_TOKEN' ? '⚠ Placeholder' : '✓ Set') : '✗ Missing'}`);

    console.log(`   Storage:`);
    console.log(`      Download Directory: ${config.storage?.downloadDirectory || '✗ Missing'}`);
    console.log(`      Database Path: ${config.storage?.databasePath || '✗ Missing'}`);

    console.log(`   Targets: ${config.targets ? `${config.targets.length} configured` : '✗ Missing'}`);
    if (config.targets && Array.isArray(config.targets) && config.targets.length > 0) {
      config.targets.forEach((target, index) => {
        console.log(`      ${index + 1}. Type: ${target.type}, Mode: ${target.mode || 'search'}, Tag: ${target.tag || target.seriesId || target.novelId || 'N/A'}`);
      });
    }

    console.log(`   Scheduler: ${config.scheduler?.enabled ? '✓ Enabled' : '✗ Disabled'}`);
    if (config.scheduler?.enabled) {
      console.log(`      Cron: ${config.scheduler.cron || '✗ Missing'}`);
    }

    console.log(`   Download:`);
    console.log(`      Concurrency: ${config.download?.concurrency || 'N/A'}`);
    console.log(`      Max Retries: ${config.download?.maxRetries || 'N/A'}`);
  }
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  
  const options = {
    file: args.includes('--file') ? args[args.indexOf('--file') + 1] : undefined,
    list: args.includes('--list'),
    fix: args.includes('--fix'),
    validate: args.includes('--validate'),
    info: args.includes('--info'),
    repair: args.includes('--repair'),
    backup: args.includes('--backup'),
  };

  const diagnostic = new ConfigDiagnostic();

  if (options.list) {
    console.log('\n📂 Available Configuration Files:\n');
    const files = diagnostic.listConfigFiles();
    if (files.length === 0) {
      console.log('   No configuration files found.');
    } else {
      files.forEach(file => {
        const status = file.isActive ? '✓ ACTIVE' : '  ';
        const size = (file.size / 1024).toFixed(2);
        const modified = file.modifiedTime.toLocaleString();
        console.log(`   ${status} ${file.filename}`);
        console.log(`      Path: ${relative(process.cwd(), file.path)}`);
        console.log(`      Size: ${size} KB`);
        console.log(`      Modified: ${modified}`);
        console.log();
      });
    }
    return;
  }

  const targetFile = options.file;
  let result: DiagnosticResult;

  if (options.repair || options.fix) {
    result = diagnostic.repair(targetFile || '', {
      fixMissingTargets: true,
      fixInvalidStructure: true,
      fixMissingFields: options.fix,
      createBackup: options.backup,
    });
  } else {
    result = diagnostic.diagnose(targetFile);
  }

  diagnostic.printResults(result, options.info || options.validate);

  // Exit with error code if validation failed
  if (!result.valid && options.validate) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { ConfigDiagnostic };
