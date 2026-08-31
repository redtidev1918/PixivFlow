/**
 * Unified configuration validator
 * Consolidates all configuration validation logic from different modules
 */

import { StandaloneConfig, TargetConfig } from '../config';
import cron from 'node-cron';
import { isPlaceholderToken, getBestAvailableToken } from './token-manager';
import { ConfigError } from './errors';

export interface ValidationError {
  code: string;
  field?: string;
  params?: Record<string, unknown>;
  message?: string;
}

export interface ValidationWarning {
  code: string;
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Unified configuration validator
 */
export class ConfigValidator {
  /**
   * Validate configuration with optional unified storage token check
   */
  validate(
    config: Partial<StandaloneConfig>,
    options: {
      checkUnifiedStorage?: boolean;
      databasePath?: string;
      location?: string;
    } = {}
  ): ValidationResult {
    const { checkUnifiedStorage = false, databasePath, location = 'configuration' } = options;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate Pixiv credentials
    if (!config.pixiv) {
      errors.push({
        code: 'CONFIG_VALIDATION_PIXIV_REQUIRED',
        field: 'pixiv',
        message: 'Pixiv configuration section is required',
      });
    } else {
      if (!config.pixiv.clientId || config.pixiv.clientId.trim() === '') {
        errors.push({
          code: 'CONFIG_VALIDATION_PIXIV_CLIENT_ID_REQUIRED',
          field: 'pixiv.clientId',
          message: 'Pixiv client ID is required',
        });
      }
      if (!config.pixiv.clientSecret || config.pixiv.clientSecret.trim() === '') {
        errors.push({
          code: 'CONFIG_VALIDATION_PIXIV_CLIENT_SECRET_REQUIRED',
          field: 'pixiv.clientSecret',
          message: 'Pixiv client secret is required',
        });
      }
      if (!config.pixiv.deviceToken || config.pixiv.deviceToken.trim() === '') {
        errors.push({
          code: 'CONFIG_VALIDATION_PIXIV_DEVICE_TOKEN_REQUIRED',
          field: 'pixiv.deviceToken',
          message: 'Pixiv device token is required',
        });
      }

      // Token validation with unified storage support
      const configToken = config.pixiv.refreshToken;
      const hasValidConfigToken = !isPlaceholderToken(configToken);

      if (!hasValidConfigToken) {
        if (checkUnifiedStorage && databasePath) {
          // Check unified storage for token
          const unifiedToken = getBestAvailableToken(configToken, databasePath);
          if (!unifiedToken) {
            errors.push({
              code: 'CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED',
              field: 'pixiv.refreshToken',
              message: 'Pixiv refresh token is required (not found in config or unified storage)',
            });
          }
        } else {
          errors.push({
            code: 'CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED',
            field: 'pixiv.refreshToken',
            message: 'Pixiv refresh token is required',
          });
        }
      }
    }

    // Validate targets (targets can be empty for URL-based downloads)
    // Only validate target structure if targets are provided
    if (config.targets && config.targets.length > 0) {
      const targetIds = new Set<string>();
      config.targets.forEach((target, index) => {
        const targetPrefix = `targets[${index}]`;
        if (target.id) {
          if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(target.id) || targetIds.has(target.id)) {
            errors.push({
              code: 'CONFIG_VALIDATION_TARGET_ID_INVALID',
              field: `${targetPrefix}.id`,
              message: `Target ${index + 1}: Id must be unique and contain only letters, numbers, '_' or '-'`,
            });
          }
          targetIds.add(target.id);
        }
        
        if (!target.type) {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_TYPE_REQUIRED',
            field: `${targetPrefix}.type`,
            params: { index: index + 1 },
            message: `Target ${index + 1}: Type is required`,
          });
        } else if (target.type !== 'illustration' && target.type !== 'novel') {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_TYPE_INVALID',
            field: `${targetPrefix}.type`,
            params: { index: index + 1, type: target.type },
            message: `Target ${index + 1}: Type must be 'illustration' or 'novel'`,
          });
        }

        if (target.limit !== undefined && target.limit < 1) {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_LIMIT_INVALID',
            field: `${targetPrefix}.limit`,
            params: { index: index + 1, limit: target.limit },
            message: `Target ${index + 1}: Limit must be greater than 0`,
          });
        }

        if (target.excludeAI !== undefined && typeof target.excludeAI !== 'boolean') {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_EXCLUDE_AI_INVALID',
            field: `${targetPrefix}.excludeAI`,
            message: `Target ${index + 1}: excludeAI must be a boolean`,
          });
        }
        if (target.aiMetadataCheck !== undefined && typeof target.aiMetadataCheck !== 'boolean') {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_AI_METADATA_CHECK_INVALID',
            field: `${targetPrefix}.aiMetadataCheck`,
            message: `Target ${index + 1}: aiMetadataCheck must be a boolean`,
          });
        }
        if (target.maxPageCount !== undefined && (
          !Number.isInteger(target.maxPageCount) || target.maxPageCount < 1
        )) {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_MAX_PAGE_COUNT_INVALID',
            field: `${targetPrefix}.maxPageCount`,
            message: `Target ${index + 1}: maxPageCount must be a positive integer`,
          });
        }
        if (target.strictLanguageFilter !== undefined && typeof target.strictLanguageFilter !== 'boolean') {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_STRICT_LANGUAGE_INVALID',
            field: `${targetPrefix}.strictLanguageFilter`,
            message: `Target ${index + 1}: strictLanguageFilter must be a boolean`,
          });
        }
        if (target.languageCandidateLimit !== undefined && (
          !Number.isInteger(target.languageCandidateLimit) ||
          target.languageCandidateLimit < 1 ||
          target.languageCandidateLimit > 100
        )) {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_LANGUAGE_CANDIDATES_INVALID',
            field: `${targetPrefix}.languageCandidateLimit`,
            message: `Target ${index + 1}: languageCandidateLimit must be an integer between 1 and 100`,
          });
        }
        if (target.noMatchPolicy?.lookbackDays !== undefined && (
          !Number.isInteger(target.noMatchPolicy.lookbackDays) ||
          target.noMatchPolicy.lookbackDays < 0 ||
          target.noMatchPolicy.lookbackDays > 7
        )) {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_NO_MATCH_LOOKBACK_INVALID',
            field: `${targetPrefix}.noMatchPolicy.lookbackDays`,
            message: `Target ${index + 1}: noMatchPolicy.lookbackDays must be an integer between 0 and 7`,
          });
        }
        if (target.noMatchPolicy?.notify !== undefined && typeof target.noMatchPolicy.notify !== 'boolean') {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_NO_MATCH_NOTIFY_INVALID',
            field: `${targetPrefix}.noMatchPolicy.notify`,
            message: `Target ${index + 1}: noMatchPolicy.notify must be a boolean`,
          });
        }
        if (target.noMatchPolicy?.notify === true) {
          const deliveryTarget = target.delivery?.target?.trim();
          if (!deliveryTarget || !config.delivery?.targets?.[deliveryTarget]?.notificationUrl?.trim()) {
            errors.push({
              code: 'CONFIG_VALIDATION_TARGET_NO_MATCH_NOTIFICATION_MISSING',
              field: `${targetPrefix}.noMatchPolicy.notify`,
              message: `Target ${index + 1}: no-match notification requires delivery notificationUrl`,
            });
          }
        }

        if (target.storageMode && target.storageMode !== 'persistent' && target.storageMode !== 'cache') {
          errors.push({
            code: 'CONFIG_VALIDATION_TARGET_STORAGE_MODE_INVALID',
            field: `${targetPrefix}.storageMode`,
            message: `Target ${index + 1}: Storage mode must be 'persistent' or 'cache'`,
          });
        }
        if (target.storageMode === 'cache') {
          const deliveryTarget = target.delivery?.target?.trim();
          if (!deliveryTarget) {
            errors.push({
              code: 'CONFIG_VALIDATION_DELIVERY_TARGET_REQUIRED',
              field: `${targetPrefix}.delivery.target`,
              message: `Target ${index + 1}: Cache mode requires a delivery target`,
            });
          } else if (!config.delivery?.targets?.[deliveryTarget]) {
            errors.push({
              code: 'CONFIG_VALIDATION_DELIVERY_TARGET_UNKNOWN',
              field: `${targetPrefix}.delivery.target`,
              message: `Target ${index + 1}: Unknown delivery target '${deliveryTarget}'`,
            });
          }
        }

        // Validate date ranges
        this.validateTargetDates(target, index, errors, warnings);
      });
    }

    for (const [name, delivery] of Object.entries(config.delivery?.targets ?? {})) {
      const prefix = `delivery.targets.${name}`;
      if (delivery.type !== 'httpMultipart') {
        errors.push({
          code: 'CONFIG_VALIDATION_DELIVERY_TYPE_UNSUPPORTED',
          field: `${prefix}.type`,
          message: `Delivery target '${name}': Unsupported type`,
        });
        continue;
      }
      if (!/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(delivery.url)) {
        try {
          const url = new URL(delivery.url);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
        } catch {
          errors.push({
            code: 'CONFIG_VALIDATION_DELIVERY_URL_INVALID',
            field: `${prefix}.url`,
            message: `Delivery target '${name}': URL must be valid HTTP or HTTPS`,
          });
        }
      }
      if (delivery.notificationUrl && !/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(delivery.notificationUrl)) {
        try {
          const url = new URL(delivery.notificationUrl);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
        } catch {
          errors.push({
            code: 'CONFIG_VALIDATION_DELIVERY_NOTIFICATION_URL_INVALID',
            field: `${prefix}.notificationUrl`,
            message: `Delivery target '${name}': notificationUrl must be valid HTTP or HTTPS`,
          });
        }
      }
      if (delivery.maxAttempts !== undefined && (!Number.isInteger(delivery.maxAttempts) || delivery.maxAttempts < 1)) {
        errors.push({
          code: 'CONFIG_VALIDATION_DELIVERY_ATTEMPTS_INVALID',
          field: `${prefix}.maxAttempts`,
          message: `Delivery target '${name}': maxAttempts must be an integer greater than 0`,
        });
      }
    }
    const retryBase = config.delivery?.outboxRetryBaseMs;
    const retryMax = config.delivery?.outboxRetryMaxMs;
    if (retryBase !== undefined && (!Number.isInteger(retryBase) || retryBase < 0)) {
      errors.push({
        code: 'CONFIG_VALIDATION_OUTBOX_RETRY_BASE_INVALID',
        field: 'delivery.outboxRetryBaseMs',
        message: 'Delivery outbox retry base must be an integer greater than or equal to 0',
      });
    }
    if (retryMax !== undefined && (!Number.isInteger(retryMax) || retryMax < 0)) {
      errors.push({
        code: 'CONFIG_VALIDATION_OUTBOX_RETRY_MAX_INVALID',
        field: 'delivery.outboxRetryMaxMs',
        message: 'Delivery outbox retry maximum must be an integer greater than or equal to 0',
      });
    }
    if (retryBase !== undefined && retryMax !== undefined && retryMax < retryBase) {
      errors.push({
        code: 'CONFIG_VALIDATION_OUTBOX_RETRY_RANGE_INVALID',
        field: 'delivery.outboxRetryMaxMs',
        message: 'Delivery outbox retry maximum must be greater than or equal to the base',
      });
    }

    // Validate storage config
    if (!config.storage) {
      errors.push({
        code: 'CONFIG_VALIDATION_STORAGE_REQUIRED',
        field: 'storage',
        message: 'Storage configuration section is required',
      });
    } else {
      if (!config.storage.downloadDirectory) {
        errors.push({
          code: 'CONFIG_VALIDATION_DOWNLOAD_DIRECTORY_REQUIRED',
          field: 'storage.downloadDirectory',
          message: 'Download directory is required',
        });
      }
      if (config.storage.cacheRetentionDays !== undefined && (
        !Number.isFinite(config.storage.cacheRetentionDays) || config.storage.cacheRetentionDays < 0
      )) {
        errors.push({
          code: 'CONFIG_VALIDATION_CACHE_RETENTION_INVALID',
          field: 'storage.cacheRetentionDays',
          message: 'Cache retention days must be a non-negative number',
        });
      }
      if (config.storage.cacheMaxSizeMB !== undefined && (
        !Number.isFinite(config.storage.cacheMaxSizeMB) || config.storage.cacheMaxSizeMB < 0
      )) {
        errors.push({
          code: 'CONFIG_VALIDATION_CACHE_MAX_SIZE_INVALID',
          field: 'storage.cacheMaxSizeMB',
          message: 'Cache maximum size must be a non-negative number',
        });
      }
    }

    // Validate download config
    if (config.download) {
      if (config.download.concurrency !== undefined) {
        if (config.download.concurrency < 1 || config.download.concurrency > 10) {
          warnings.push({
            code: 'CONFIG_VALIDATION_DOWNLOAD_CONCURRENCY_INVALID',
            field: 'download.concurrency',
            message: 'Concurrency should be between 1 and 10',
          });
        }
      }
      if (config.download.requestDelay !== undefined && config.download.requestDelay < 0) {
        warnings.push({
          code: 'CONFIG_VALIDATION_DOWNLOAD_REQUEST_DELAY_INVALID',
          field: 'download.requestDelay',
          message: 'Request delay should be greater than or equal to 0',
        });
      }
      if (config.download.minConcurrency !== undefined && config.download.concurrency !== undefined) {
        if (config.download.minConcurrency < 1 || config.download.minConcurrency > config.download.concurrency) {
          warnings.push({
            code: 'CONFIG_VALIDATION_DOWNLOAD_MIN_CONCURRENCY_INVALID',
            field: 'download.minConcurrency',
            message: 'Min concurrency should be between 1 and concurrency value',
          });
        }
      }
      if (config.download.maxRetries !== undefined && (config.download.maxRetries < 0 || config.download.maxRetries > 10)) {
        warnings.push({
          code: 'CONFIG_VALIDATION_DOWNLOAD_MAX_RETRIES_INVALID',
          field: 'download.maxRetries',
          message: 'Max retries should be between 0 and 10',
        });
      }
    }

    // Validate scheduler config (if enabled)
    if (config.scheduler?.enabled) {
      if (!config.scheduler.cron) {
        errors.push({
          code: 'CONFIG_VALIDATION_CRON_REQUIRED',
          field: 'scheduler.cron',
          message: 'Cron expression is required when scheduler is enabled',
        });
      } else {
        const cronParts = config.scheduler.cron.split(' ');
        if (cronParts.length !== 5) {
          errors.push({
            code: 'CONFIG_VALIDATION_CRON_INVALID',
            field: 'scheduler.cron',
            message: 'Cron expression must have 5 parts (minute hour day month weekday)',
          });
        }
      }
    }

    if (config.schedules !== undefined) {
      const scheduleIds = new Set<string>();
      const targetIds = new Set((config.targets ?? []).flatMap(target => target.id ? [target.id] : []));
      config.schedules.forEach((schedule, index) => {
        const prefix = `schedules[${index}]`;
        if (!schedule.id || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(schedule.id) || scheduleIds.has(schedule.id)) {
          errors.push({
            code: 'CONFIG_VALIDATION_SCHEDULE_ID_INVALID',
            field: `${prefix}.id`,
            message: `Schedule ${index + 1}: Id must be unique and contain only letters, numbers, '_' or '-'`,
          });
        }
        scheduleIds.add(schedule.id);
        if (schedule.enabled && (!schedule.cron || !cron.validate(schedule.cron))) {
          errors.push({
            code: 'CONFIG_VALIDATION_CRON_INVALID',
            field: `${prefix}.cron`,
            message: `Schedule ${index + 1}: Cron expression is invalid`,
          });
        }
        for (const targetId of schedule.targetIds ?? []) {
          if (!targetIds.has(targetId)) {
            errors.push({
              code: 'CONFIG_VALIDATION_SCHEDULE_TARGET_UNKNOWN',
              field: `${prefix}.targetIds`,
              message: `Schedule ${index + 1}: Unknown target id '${targetId}'`,
            });
          }
        }
      });
    }

    if (config.schedulerRuntime?.reloadDebounceMs !== undefined && config.schedulerRuntime.reloadDebounceMs < 100) {
      errors.push({
        code: 'CONFIG_VALIDATION_RELOAD_DEBOUNCE_INVALID',
        field: 'schedulerRuntime.reloadDebounceMs',
        message: 'Reload debounce must be at least 100ms',
      });
    }
    if (config.schedulerRuntime?.queueLimit !== undefined &&
        (!Number.isInteger(config.schedulerRuntime.queueLimit) || config.schedulerRuntime.queueLimit < 0 || config.schedulerRuntime.queueLimit > 100)) {
      errors.push({
        code: 'CONFIG_VALIDATION_QUEUE_LIMIT_INVALID',
        field: 'schedulerRuntime.queueLimit',
        message: 'Queue limit must be an integer between 0 and 100',
      });
    }

    // Validate log level
    if (config.logLevel && !['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
      errors.push({
        code: 'CONFIG_VALIDATION_LOG_LEVEL_INVALID',
        field: 'logLevel',
        message: `Log level must be one of: debug, info, warn, error (got "${config.logLevel}")`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate target date ranges
   */
  private validateTargetDates(
    target: TargetConfig,
    index: number,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const targetPrefix = `targets[${index}]`;

    if (target.startDate && target.endDate) {
      const start = new Date(target.startDate);
      const end = new Date(target.endDate);

      if (isNaN(start.getTime())) {
        errors.push({
          code: 'CONFIG_VALIDATION_TARGET_START_DATE_INVALID',
          field: `${targetPrefix}.startDate`,
          params: { index: index + 1, date: target.startDate },
          message: `Target ${index + 1}: Invalid start date format`,
        });
      }

      if (isNaN(end.getTime())) {
        errors.push({
          code: 'CONFIG_VALIDATION_TARGET_END_DATE_INVALID',
          field: `${targetPrefix}.endDate`,
          params: { index: index + 1, date: target.endDate },
          message: `Target ${index + 1}: Invalid end date format`,
        });
      }

      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start > end) {
        errors.push({
          code: 'CONFIG_VALIDATION_TARGET_DATE_RANGE_INVALID',
          field: `${targetPrefix}.dateRange`,
          params: { index: index + 1, startDate: target.startDate, endDate: target.endDate },
          message: `Target ${index + 1}: Start date must be before or equal to end date`,
        });
      }
    } else if (target.startDate) {
      const start = new Date(target.startDate);
      if (isNaN(start.getTime())) {
        errors.push({
          code: 'CONFIG_VALIDATION_TARGET_START_DATE_INVALID',
          field: `${targetPrefix}.startDate`,
          params: { index: index + 1, date: target.startDate },
          message: `Target ${index + 1}: Invalid start date format`,
        });
      }
    } else if (target.endDate) {
      const end = new Date(target.endDate);
      if (isNaN(end.getTime())) {
        errors.push({
          code: 'CONFIG_VALIDATION_TARGET_END_DATE_INVALID',
          field: `${targetPrefix}.endDate`,
          params: { index: index + 1, date: target.endDate },
          message: `Target ${index + 1}: Invalid end date format`,
        });
      }
    }
  }

  /**
   * Validate and throw if invalid
   */
  validateOrThrow(
    config: Partial<StandaloneConfig>,
    options: {
      checkUnifiedStorage?: boolean;
      databasePath?: string;
      location?: string;
    } = {}
  ): void {
    const result = this.validate(config, options);
    
    if (!result.valid) {
      const errorMessages = result.errors.map(e => 
        e.message || `${e.field}: ${e.code}`
      ).join('\n');
      
      throw new ConfigError(
        `Configuration validation failed${options.location ? ` in ${options.location}` : ''}:\n${errorMessages}`
      );
    }
  }
}

// Export singleton instance
export const configValidator = new ConfigValidator();

// Export convenience functions for backward compatibility
export function validateConfig(config: StandaloneConfig): ValidationResult {
  return configValidator.validate(config);
}

export function validateConfigWithUnifiedStorage(
  config: StandaloneConfig,
  databasePath?: string
): ValidationResult {
  return configValidator.validate(config, {
    checkUnifiedStorage: true,
    databasePath,
  });
}
