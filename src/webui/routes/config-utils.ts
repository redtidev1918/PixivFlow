import { readFileSync, existsSync } from 'fs';
import { StandaloneConfig } from '../../config';
import { logger } from '../../logger';
import { validateConfig } from '../utils/config-validator';
import { getBestAvailableToken, isPlaceholderToken } from '../../utils/token-manager';

/**
 * Read raw configuration file without validation
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
 * Mask sensitive fields in configuration for safe display
 */
export function maskSensitiveFields(config: Partial<StandaloneConfig> | null): Partial<StandaloneConfig> {
  if (!config) {
    return {};
  }
  const pixiv = config.pixiv
    ? {
        ...config.pixiv,
        refreshToken: config.pixiv.refreshToken ? '***' : config.pixiv.refreshToken,
        clientSecret: config.pixiv.clientSecret ? '***' : config.pixiv.clientSecret,
      }
    : undefined;

  return {
    ...config,
    pixiv,
  };
}

/**
 * Validate configuration filename to prevent directory traversal while allowing flexible naming
 * Allows:
 * - standalone.config.json
 * - standalone.config.*.json (where * can be alphanumeric, dots, hyphens, underscores)
 * - Any other *.json files (but must be safe)
 */
export function isValidConfigFilename(filename: string): boolean {
  // Must end with .json
  if (!filename.endsWith('.json')) {
    return false;
  }
  
  // Must not be a hidden file (starting with .)
  if (filename.startsWith('.')) {
    return false;
  }
  
  // Must not contain path separators or directory traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return false;
  }
  
  // Must only contain safe characters: letters, numbers, dots, hyphens, underscores
  // Remove .json extension for validation
  const nameWithoutExt = filename.slice(0, -5);
  if (!/^[a-zA-Z0-9._-]+$/.test(nameWithoutExt)) {
    return false;
  }
  
  // Must not be empty after removing extension
  if (nameWithoutExt.length === 0) {
    return false;
  }
  
  return true;
}

/**
 * Validate configuration, automatically checking unified storage for tokens
 * If config has placeholder token or missing token but unified storage has real token, use the real token for validation
 * This matches the behavior of loadConfig() which auto-fills tokens from unified storage
 */
export function validateConfigWithUnifiedStorage(config: StandaloneConfig): ReturnType<typeof validateConfig> {
  // Check if token is missing or placeholder, and if unified storage has a token
  let configToValidate = config;
  const currentToken = config.pixiv?.refreshToken;
  
  // If token is missing or is a placeholder, try to get from unified storage
  if (!currentToken || isPlaceholderToken(currentToken)) {
    // Try to get token from unified storage (same as loadConfig does)
    const unifiedToken = getBestAvailableToken(currentToken, config.storage?.databasePath);
    if (unifiedToken) {
      // Use the token from unified storage for validation
      // This prevents false errors when config file has placeholder/missing token but unified storage has real token
      configToValidate = {
        ...config,
        pixiv: {
          ...config.pixiv,
          refreshToken: unifiedToken,
        },
      };
    }
  }
  
  return validateConfig(configToValidate);
}





























