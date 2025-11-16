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
 * Check if a token is a placeholder (not a real token)
 * This matches the logic in src/utils/token-manager.ts
 */
function isPlaceholderToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string') {
    return true;
  }
  const trimmed = token.trim();
  return trimmed === '' || 
         trimmed === 'YOUR_REFRESH_TOKEN' || 
         trimmed.toLowerCase() === 'your_refresh_token' ||
         trimmed === '***' ||
         trimmed.length < 10;
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
    // Check if refreshToken exists and is not a placeholder
    if (!config.pixiv.refreshToken || isPlaceholderToken(config.pixiv.refreshToken)) {
      errors.push({ code: 'CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED' });
    }
  }

  // Validate targets (targets can be empty for URL-based downloads)
  // Only validate target structure if targets are provided
  if (config.targets && config.targets.length > 0) {
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
  // Note: Empty targets array is allowed for URL-based downloads

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

