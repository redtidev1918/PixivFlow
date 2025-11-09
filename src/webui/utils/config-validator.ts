import { StandaloneConfig } from '../../config';

export interface ValidationError {
  code: string;
  params?: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate configuration
 */
export function validateConfig(config: StandaloneConfig): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate pixiv config
  if (!config.pixiv) {
    errors.push({ code: 'CONFIG_VALIDATION_PIXIV_REQUIRED' });
  } else {
    if (!config.pixiv.clientId) {
      errors.push({ code: 'CONFIG_VALIDATION_PIXIV_CLIENT_ID_REQUIRED' });
    }
    if (!config.pixiv.refreshToken) {
      errors.push({ code: 'CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED' });
    }
  }

  // Validate targets
  if (!config.targets || config.targets.length === 0) {
    errors.push({ code: 'CONFIG_VALIDATION_TARGETS_REQUIRED' });
  } else {
    config.targets.forEach((target, index) => {
      if (!target.type) {
        errors.push({ code: 'CONFIG_VALIDATION_TARGET_TYPE_REQUIRED', params: { index: index + 1 } });
      }
      if (target.type !== 'illustration' && target.type !== 'novel') {
        errors.push({ code: 'CONFIG_VALIDATION_TARGET_TYPE_INVALID', params: { index: index + 1 } });
      }
      if (target.limit !== undefined && target.limit < 1) {
        errors.push({ code: 'CONFIG_VALIDATION_TARGET_LIMIT_INVALID', params: { index: index + 1 } });
      }
    });
  }

  // Validate storage config
  if (!config.storage) {
    errors.push({ code: 'CONFIG_VALIDATION_STORAGE_REQUIRED' });
  } else {
    if (!config.storage.downloadDirectory) {
      errors.push({ code: 'CONFIG_VALIDATION_DOWNLOAD_DIRECTORY_REQUIRED' });
    }
  }

  // Validate scheduler config (if enabled)
  if (config.scheduler?.enabled) {
    if (!config.scheduler.cron) {
      errors.push({ code: 'CONFIG_VALIDATION_CRON_REQUIRED' });
    } else {
      // Basic cron validation
      const cronParts = config.scheduler.cron.split(' ');
      if (cronParts.length !== 5) {
        errors.push({ code: 'CONFIG_VALIDATION_CRON_INVALID' });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

