/**
 * Unified configuration validator
 * Consolidates all configuration validation logic from different modules
 */

import { StandaloneConfig, TargetConfig } from '../config';
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
      config.targets.forEach((target, index) => {
        const targetPrefix = `targets[${index}]`;
        
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

        // Validate date ranges
        this.validateTargetDates(target, index, errors, warnings);
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


