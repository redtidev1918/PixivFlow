/**
 * Configuration validation utilities
 */

import cron from 'node-cron';
import { logger } from '../logger';
import { ConfigError } from '../utils/errors';
import { getBestAvailableToken, isPlaceholderToken } from '../utils/token-manager';
import { StandaloneConfig } from './types';
import { loadConfig } from './loader';

/**
 * Validation error with detailed information
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[],
    public readonly warnings: string[] = []
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validate configuration with detailed error messages
 * @param config Configuration to validate
 * @param location Location description for error messages
 * @param databasePath Optional database path to check unified storage for tokens
 */
export function validateConfig(config: Partial<StandaloneConfig>, location: string, databasePath?: string): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate Pixiv credentials
  if (!config.pixiv) {
    errors.push('pixiv: Required section is missing');
  } else {
    if (!config.pixiv.clientId || config.pixiv.clientId.trim() === '') {
      errors.push('pixiv.clientId: Required field is missing or empty');
    }
    if (!config.pixiv.clientSecret || config.pixiv.clientSecret.trim() === '') {
      errors.push('pixiv.clientSecret: Required field is missing or empty');
    }
    if (!config.pixiv.deviceToken || config.pixiv.deviceToken.trim() === '') {
      errors.push('pixiv.deviceToken: Required field is missing or empty');
    }
    
    // Token validation: Check if token exists in config OR unified storage
    // This allows config files with placeholder tokens if unified storage has a valid token
    const configToken = config.pixiv.refreshToken;
    const hasValidConfigToken = !isPlaceholderToken(configToken);
    
    if (!hasValidConfigToken && databasePath) {
      // Config file has placeholder - check unified storage
      const unifiedToken = getBestAvailableToken(configToken, databasePath);
      if (unifiedToken) {
        // Unified storage has token - this is acceptable, config will be synced
        logger.debug('Config file has placeholder token, but unified storage has valid token - validation passed');
      } else {
        // No token anywhere - this is an error
        errors.push('pixiv.refreshToken: Please replace "YOUR_REFRESH_TOKEN" with your actual refresh token or login');
      }
    } else if (!hasValidConfigToken) {
      // No database path and config has placeholder - error
      errors.push('pixiv.refreshToken: Please replace "YOUR_REFRESH_TOKEN" with your actual refresh token');
    }
    // If hasValidConfigToken is true, token is valid - no error
    
    if (!config.pixiv.userAgent || config.pixiv.userAgent.trim() === '') {
      errors.push('pixiv.userAgent: Required field is missing or empty');
    }
  }

  // Validate targets
  if (!Array.isArray(config.targets)) {
    errors.push('targets: Must be an array');
  } else if (config.targets.length === 0) {
    errors.push('targets: At least one target must be configured');
  } else {
    config.targets.forEach((target, index) => {
      // Tag is required for search mode, optional for ranking, series, or single novel mode
      if (target.mode !== 'ranking' && !target.seriesId && !target.novelId && (!target.tag || target.tag.trim() === '')) {
        errors.push(`targets[${index}].tag: Required field is missing or empty (required for search mode, optional for ranking/series/single novel mode)`);
      }
      if (target.type && !['illustration', 'novel'].includes(target.type)) {
        errors.push(`targets[${index}].type: Must be "illustration" or "novel"`);
      }
      if (target.limit !== undefined) {
        if (target.limit < 1) {
          errors.push(`targets[${index}].limit: Must be greater than 0 (got ${target.limit})`);
        } else if (target.limit > 1000) {
          warnings.push(`targets[${index}].limit: Should be between 1 and 1000 (got ${target.limit})`);
        }
      }
      if (target.searchTarget && !['partial_match_for_tags', 'exact_match_for_tags', 'title_and_caption'].includes(target.searchTarget)) {
        errors.push(`targets[${index}].searchTarget: Invalid value, must be one of: partial_match_for_tags, exact_match_for_tags, title_and_caption`);
      }
      if (target.tagRelation && !['and', 'or'].includes(target.tagRelation)) {
        errors.push(`targets[${index}].tagRelation: Invalid value, must be "and" or "or"`);
      }
      if (target.rankingDate && !/^\d{4}-\d{2}-\d{2}$/.test(target.rankingDate) && target.rankingDate !== 'YESTERDAY') {
        errors.push(`targets[${index}].rankingDate: Invalid format, must be YYYY-MM-DD or "YESTERDAY"`);
      }
    });
  }

  // Validate network config
  if (config.network) {
    if (config.network.timeoutMs !== undefined && (config.network.timeoutMs < 1000 || config.network.timeoutMs > 300000)) {
      warnings.push('network.timeoutMs: Should be between 1000 and 300000 ms (1 second to 5 minutes)');
    }
    if (config.network.retries !== undefined && (config.network.retries < 0 || config.network.retries > 10)) {
      warnings.push('network.retries: Should be between 0 and 10');
    }
    if (config.network.proxy?.enabled) {
      if (!config.network.proxy.host || config.network.proxy.host.trim() === '') {
        errors.push('network.proxy.host: Required when proxy is enabled');
      }
      if (!config.network.proxy.port || config.network.proxy.port < 1 || config.network.proxy.port > 65535) {
        errors.push('network.proxy.port: Must be a valid port number (1-65535)');
      }
      if (config.network.proxy.protocol && !['http', 'https', 'socks4', 'socks5'].includes(config.network.proxy.protocol)) {
        errors.push('network.proxy.protocol: Must be one of: http, https, socks4, socks5');
      }
    }
  }

  // Validate scheduler config
  if (config.scheduler) {
    if (config.scheduler.enabled && !config.scheduler.cron) {
      errors.push('scheduler.cron: Required when scheduler is enabled');
    }
    if (config.scheduler.cron && !cron.validate(config.scheduler.cron)) {
      errors.push(`scheduler.cron: Invalid cron expression: ${config.scheduler.cron}`);
    }
    if (config.scheduler.maxExecutions !== undefined && config.scheduler.maxExecutions < 1) {
      errors.push('scheduler.maxExecutions: Must be greater than 0');
    }
    if (config.scheduler.minInterval !== undefined && config.scheduler.minInterval < 0) {
      errors.push('scheduler.minInterval: Must be greater than or equal to 0');
    }
    if (config.scheduler.timeout !== undefined && config.scheduler.timeout < 1000) {
      warnings.push('scheduler.timeout: Should be at least 1000 ms (1 second)');
    }
    if (config.scheduler.maxConsecutiveFailures !== undefined && config.scheduler.maxConsecutiveFailures < 1) {
      errors.push('scheduler.maxConsecutiveFailures: Must be greater than 0');
    }
  }

  // Validate download config
  if (config.download) {
    if (config.download.concurrency !== undefined && (config.download.concurrency < 1 || config.download.concurrency > 10)) {
      warnings.push('download.concurrency: Should be between 1 and 10');
    }
    if (config.download.requestDelay !== undefined && config.download.requestDelay < 0) {
      warnings.push('download.requestDelay: Should be greater than or equal to 0');
    }
    if (config.download.minConcurrency !== undefined && config.download.concurrency !== undefined && 
        (config.download.minConcurrency < 1 || config.download.minConcurrency > config.download.concurrency)) {
      warnings.push('download.minConcurrency: Should be between 1 and concurrency value');
    }
    if (config.download.maxRetries !== undefined && (config.download.maxRetries < 0 || config.download.maxRetries > 10)) {
      warnings.push('download.maxRetries: Should be between 0 and 10');
    }
  }

  // Validate log level
  if (config.logLevel && !['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
    errors.push(`logLevel: Must be one of: debug, info, warn, error (got "${config.logLevel}")`);
  }

  // Report warnings
  if (warnings.length > 0) {
    logger.warn('Configuration warnings:', { warnings, location });
  }

  // Throw error if there are critical issues
  if (errors.length > 0) {
    const errorMessage = `Configuration validation failed in ${location}:\n${errors.map(e => `  - ${e}`).join('\n')}`;
    const configError = new ConfigValidationError(errorMessage, errors, warnings);
    throw new ConfigError(errorMessage, configError);
  }
}

/**
 * Validate and format configuration file
 */
export function validateConfigFile(configPath: string): { valid: boolean; errors: string[]; warnings: string[] } {
  try {
    const config = loadConfig(configPath);
    return { valid: true, errors: [], warnings: [] };
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return {
        valid: false,
        errors: error.errors,
        warnings: error.warnings,
      };
    }
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  }
}

