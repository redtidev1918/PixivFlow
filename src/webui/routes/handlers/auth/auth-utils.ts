import { readFileSync, existsSync } from 'fs';
import { getConfigPath, loadConfig, ConfigValidationError, StandaloneConfig } from '../../../../config';
import { logger } from '../../../../logger';
import { ConfigError } from '../../../../utils/errors';
import { getBestAvailableToken, isPlaceholderToken } from '../../../../utils/token-manager';
import { TerminalLogin } from '../../../../terminal-login';

/**
 * Read config file without validation (for checking refreshToken even if validation fails)
 */
export function readConfigRaw(configPath: string): Partial<StandaloneConfig> | null {
  try {
    if (!existsSync(configPath)) {
      return null;
    }
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as Partial<StandaloneConfig>;
  } catch (error) {
    logger.warn('Failed to read raw config file', {
      error: error instanceof Error ? error.message : String(error),
      configPath,
    });
    return null;
  }
}

/**
 * Get refresh token from config file or unified storage
 */
export function getRefreshToken(): string | null {
  const configPath = getConfigPath();
  
  try {
    const config = loadConfig(configPath);
    const refreshToken = config.pixiv?.refreshToken;
    
    if (refreshToken && !isPlaceholderToken(refreshToken)) {
      return refreshToken;
    }
  } catch (error) {
    // Config might be invalid, try raw read
    logger.debug('Failed to load config, trying raw read', { error });
  }
  
  // Try raw config read
  const rawConfig = readConfigRaw(configPath);
  let configToken = rawConfig?.pixiv?.refreshToken;
  
  if (isPlaceholderToken(configToken)) {
    // Try unified storage
    const databasePath = rawConfig?.storage?.databasePath;
    const unifiedToken = getBestAvailableToken(configToken, databasePath);
    if (unifiedToken) {
      return unifiedToken;
    }
  }
  
  if (configToken && !isPlaceholderToken(configToken)) {
    return configToken;
  }
  
  return null;
}

/**
 * Validate token by attempting to refresh it
 */
export async function validateToken(refreshToken: string): Promise<{
  valid: boolean;
  user: any;
  loginInfo?: any;
}> {
  try {
    const loginInfo = await TerminalLogin.refresh(refreshToken);
    return {
      valid: true,
      user: loginInfo.user,
      loginInfo,
    };
  } catch (error) {
    logger.warn('Token validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      valid: false,
      user: null,
    };
  }
}

/**
 * Get validation errors from ConfigError
 */
export function getValidationErrors(error: ConfigError): {
  errors: string[];
  warnings: string[];
} {
  const validationErrors =
    error.cause instanceof ConfigValidationError
      ? error.cause.errors
      : [error.message];
  const validationWarnings =
    error.cause instanceof ConfigValidationError
      ? error.cause.warnings
      : [];
  
  return { errors: validationErrors, warnings: validationWarnings };
}

