/**
 * Configuration file repair
 * Handles fixing common configuration issues
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../../logger';
import { StandaloneConfig } from '../../config';
import { ConfigParser, ConfigParseResult } from '../config-parser';

export interface RepairResult {
  success: boolean;
  fixed: boolean;
  errors: string[];
  warnings: string[];
  backupPath?: string;
}

/**
 * Repair a configuration file by fixing common issues
 */
export function repairConfigFile(
  path: string,
  parser: ConfigParser,
  createBackup: boolean = true
): RepairResult {
  const result: RepairResult = {
    success: false,
    fixed: false,
    errors: [],
    warnings: [],
    backupPath: undefined,
  };

  try {
    const resolvedPath = resolve(path);
    if (!existsSync(resolvedPath)) {
      result.errors.push(`Configuration file not found: ${resolvedPath}`);
      return result;
    }

    // Parse the configuration
    const parseResult = parser.parseFile(resolvedPath);
    if (!parseResult) {
      result.errors.push('Failed to parse configuration file');
      return result;
    }
    
    if (parseResult.errors.length > 0) {
      result.errors.push(...parseResult.errors);
      return result;
    }

    result.warnings.push(...parseResult.warnings);

    // Create backup if requested
    if (createBackup) {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${resolvedPath}.backup.${timestamp}`;
        readFileSync(resolvedPath); // Ensure file is readable
        writeFileSync(backupPath, readFileSync(resolvedPath, 'utf-8'), 'utf-8');
        result.backupPath = backupPath;
        logger.info('Created backup before repair', { backupPath });
      } catch (error) {
        result.warnings.push(`Failed to create backup: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Get the config object
    let config = parseResult.config;

    // Fix common issues
    let fixed = false;

    // Ensure targets is always an array
    if (!config.targets || !Array.isArray(config.targets)) {
      config.targets = [];
      fixed = true;
      logger.info('Fixed missing targets array');
    }

    // Ensure pixiv section exists with minimal structure
    if (!config.pixiv) {
      config.pixiv = {
        clientId: '',
        clientSecret: '',
        deviceToken: 'pixiv',
        refreshToken: '',
        userAgent: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
      };
      fixed = true;
      logger.info('Fixed missing pixiv section');
    } else {
      // Ensure all required pixiv fields exist
      if (!config.pixiv.deviceToken) {
        config.pixiv.deviceToken = 'pixiv';
        fixed = true;
      }
      if (!config.pixiv.userAgent) {
        config.pixiv.userAgent = 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)';
        fixed = true;
      }
    }

    // Ensure storage section exists with defaults
    if (!config.storage) {
      config.storage = {
        downloadDirectory: './downloads',
        databasePath: './data/pixiv-downloader.db',
      };
      fixed = true;
      logger.info('Fixed missing storage section');
    }

    // Ensure download section exists with defaults
    if (!config.download) {
      config.download = {
        concurrency: 3,
        requestDelay: 500,
        dynamicConcurrency: true,
        minConcurrency: 1,
        maxRetries: 3,
        retryDelay: 2000,
        timeout: 60000,
      };
      fixed = true;
      logger.info('Fixed missing download section');
    }

    // Ensure network section exists with defaults
    if (!config.network) {
      config.network = {
        timeoutMs: 30000,
        retries: 3,
        retryDelay: 1000,
      };
      fixed = true;
      logger.info('Fixed missing network section');
    }

    // Write repaired config if fixes were made
    if (fixed) {
      const jsonString = JSON.stringify(config, null, 2);
      writeFileSync(resolvedPath, jsonString, 'utf-8');
      result.fixed = true;
      logger.info('Configuration repaired', { path: resolvedPath });
    }

    result.success = true;
    return result;
  } catch (error) {
    result.errors.push(`Failed to repair config: ${error instanceof Error ? error.message : String(error)}`);
    logger.error('Failed to repair config file', {
      error: error instanceof Error ? error.message : String(error),
      path,
    });
    return result;
  }
}















