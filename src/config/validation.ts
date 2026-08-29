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
        errors.push('pixiv.refreshToken: No valid refresh token found. Please login to authenticate.');
      }
    } else if (!hasValidConfigToken) {
      // No database path and config has placeholder - error
      errors.push('pixiv.refreshToken: No valid refresh token found. Please login to authenticate.');
    }
    // If hasValidConfigToken is true, token is valid - no error
    
    if (!config.pixiv.userAgent || config.pixiv.userAgent.trim() === '') {
      errors.push('pixiv.userAgent: Required field is missing or empty');
    }
  }

  // Validate targets (targets can be empty for URL-based downloads)
  if (!Array.isArray(config.targets)) {
    errors.push('targets: Must be an array');
  } else if (config.targets.length > 0) {
    const targetIds = new Set<string>();
    // Only validate target structure if targets are provided
    config.targets.forEach((target, index) => {
      if (target.id) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(target.id)) {
          errors.push(`targets[${index}].id: Must contain only letters, numbers, '_' or '-' (max 64 characters)`);
        } else if (targetIds.has(target.id)) {
          errors.push(`targets[${index}].id: Duplicate target id "${target.id}"`);
        }
        targetIds.add(target.id);
      }
      // Tag is required for search mode, optional for ranking, series, single novel, single illustration, or user mode
      if (target.mode !== 'ranking' && !target.seriesId && !target.novelId && !target.illustId && !target.userId && (!target.tag || target.tag.trim() === '')) {
        errors.push(`targets[${index}].tag: Required field is missing or empty (required for search mode, optional for ranking/series/single novel/single illustration/user mode)`);
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
      if (target.storageMode && !['persistent', 'cache'].includes(target.storageMode)) {
        errors.push(`targets[${index}].storageMode: Must be "persistent" or "cache"`);
      }
      if (target.storageMode === 'cache') {
        const deliveryTarget = target.delivery?.target?.trim();
        if (!deliveryTarget) {
          errors.push(`targets[${index}].delivery.target: Required when storageMode is "cache"`);
        } else if (!config.delivery?.targets?.[deliveryTarget]) {
          errors.push(`targets[${index}].delivery.target: Unknown delivery target "${deliveryTarget}"`);
        }
      }
    });
  }

  for (const [name, delivery] of Object.entries(config.delivery?.targets ?? {})) {
    const prefix = `delivery.targets.${name}`;
    if (delivery.type !== 'httpMultipart') {
      errors.push(`${prefix}.type: Unsupported delivery type "${(delivery as { type?: string }).type}"`);
      continue;
    }
    if (!delivery.url?.trim()) {
      errors.push(`${prefix}.url: Required field is missing or empty`);
    } else if (!/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(delivery.url)) {
      try {
        const url = new URL(delivery.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
      } catch {
        errors.push(`${prefix}.url: Must be a valid HTTP or HTTPS URL`);
      }
    }
    if (delivery.method && !['POST', 'PUT'].includes(delivery.method)) {
      errors.push(`${prefix}.method: Must be "POST" or "PUT"`);
    }
    if (delivery.maxAttempts !== undefined && (!Number.isInteger(delivery.maxAttempts) || delivery.maxAttempts < 1)) {
      errors.push(`${prefix}.maxAttempts: Must be an integer greater than 0`);
    }
    if (delivery.retryDelayMs !== undefined && delivery.retryDelayMs < 0) {
      errors.push(`${prefix}.retryDelayMs: Must be greater than or equal to 0`);
    }
  }
  if (
    config.delivery?.outboxRetryBaseMs !== undefined &&
    (!Number.isInteger(config.delivery.outboxRetryBaseMs) || config.delivery.outboxRetryBaseMs < 0)
  ) {
    errors.push('delivery.outboxRetryBaseMs: Must be an integer greater than or equal to 0');
  }
  if (
    config.delivery?.outboxRetryMaxMs !== undefined &&
    (!Number.isInteger(config.delivery.outboxRetryMaxMs) || config.delivery.outboxRetryMaxMs < 0)
  ) {
    errors.push('delivery.outboxRetryMaxMs: Must be an integer greater than or equal to 0');
  }
  if (
    config.delivery?.outboxRetryBaseMs !== undefined &&
    config.delivery?.outboxRetryMaxMs !== undefined &&
    config.delivery.outboxRetryMaxMs < config.delivery.outboxRetryBaseMs
  ) {
    errors.push('delivery.outboxRetryMaxMs: Must be greater than or equal to outboxRetryBaseMs');
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

  if (config.schedules !== undefined) {
    if (!Array.isArray(config.schedules)) {
      errors.push('schedules: Must be an array');
    } else {
      const scheduleIds = new Set<string>();
      const targetIds = new Set((config.targets ?? []).flatMap(target => target.id ? [target.id] : []));
      config.schedules.forEach((schedule, index) => {
        const prefix = `schedules[${index}]`;
        if (!schedule.id || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(schedule.id)) {
          errors.push(`${prefix}.id: Required and must contain only letters, numbers, '_' or '-' (max 64 characters)`);
        } else if (scheduleIds.has(schedule.id)) {
          errors.push(`${prefix}.id: Duplicate schedule id "${schedule.id}"`);
        }
        scheduleIds.add(schedule.id);
        if (schedule.enabled && !schedule.cron) errors.push(`${prefix}.cron: Required when enabled`);
        if (schedule.cron && !cron.validate(schedule.cron)) {
          errors.push(`${prefix}.cron: Invalid cron expression: ${schedule.cron}`);
        }
        for (const targetId of schedule.targetIds ?? []) {
          if (!targetIds.has(targetId)) {
            errors.push(`${prefix}.targetIds: Unknown target id "${targetId}"`);
          }
        }
      });
      if (config.scheduler?.enabled) {
        warnings.push('scheduler: Legacy cron is ignored when schedules is present');
      }
    }
  }

  if (config.schedulerRuntime) {
    const { reloadDebounceMs, queueLimit } = config.schedulerRuntime;
    if (reloadDebounceMs !== undefined && reloadDebounceMs < 100) {
      errors.push('schedulerRuntime.reloadDebounceMs: Must be at least 100');
    }
    if (queueLimit !== undefined && (!Number.isInteger(queueLimit) || queueLimit < 0 || queueLimit > 100)) {
      errors.push('schedulerRuntime.queueLimit: Must be an integer between 0 and 100');
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
    // Check if error is token-related
    const hasTokenError = errors.some(e => e.includes('refreshToken'));
    
    let errorMessage = `Configuration validation failed in ${location}:\n${errors.map(e => `  - ${e}`).join('\n')}`;
    
    if (hasTokenError) {
      errorMessage += `\n\n💡 You need to login first. Run one of the following commands:\n`;
      errorMessage += `   • Interactive login:  pixivflow login\n`;
      errorMessage += `   • Headless login:     pixivflow login-headless\n`;
      errorMessage += `\n   These commands will automatically save your refresh token.`;
    }
    
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
