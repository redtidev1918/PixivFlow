/**
 * Configuration loader
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, isAbsolute } from 'node:path';
import { logger } from '../logger';
import { ConfigError } from '../utils/errors';
import { ConfigPathMigrator } from '../utils/config-path-migrator';
import { getBestAvailableToken, isPlaceholderToken, saveTokenToStorage } from '../utils/token-manager';
import { getConfigManager } from '../utils/config-manager';
import { StandaloneConfig } from './types';
import { generateDefaultConfig } from './defaults';
import { applyDefaults } from './path-resolution';
import { applyEnvironmentOverrides, adjustProxyForEnvironment } from './environment';
import { processConfigPlaceholders } from './placeholders';
import { validateConfig } from './validation';

/**
 * Get the resolved configuration file path
 * If no path is specified, automatically selects the first available config file
 */
export function getConfigPath(configPath?: string): string {
  // If explicitly provided or via environment variable, use it
  if (configPath || process.env.PIXIV_DOWNLOADER_CONFIG) {
    return resolve(
      configPath ?? process.env.PIXIV_DOWNLOADER_CONFIG ?? 'config/standalone.config.json'
    );
  }

  // Otherwise, use ConfigManager to find the first available config
  try {
    const configManager = getConfigManager('config');
    const currentConfig = configManager.getCurrentConfigFile();
    if (currentConfig) {
      return currentConfig;
    }
  } catch (error) {
    logger.warn('Failed to use ConfigManager, falling back to default path', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to default path
  return resolve('config/standalone.config.json');
}

/**
 * Load configuration from file with environment variable support
 */
export function loadConfig(configPath?: string): StandaloneConfig {
  let resolvedPath = getConfigPath(configPath);

  // If config file doesn't exist, try to find or create one
  if (!existsSync(resolvedPath)) {
    try {
      const configManager = getConfigManager('config');
      const firstAvailable = configManager.getFirstAvailableConfig();
      if (firstAvailable) {
        resolvedPath = firstAvailable;
        configManager.setCurrentConfigFile(resolvedPath);
        logger.info('Auto-selected first available config file', { path: resolvedPath });
      } else {
        // No config files exist, create a default one
        const defaultConfigPath = configManager.getDefaultConfigPath();
        const defaultConfig = generateDefaultConfig();
        configManager.saveConfig(defaultConfig, defaultConfigPath);
        resolvedPath = defaultConfigPath;
        configManager.setCurrentConfigFile(resolvedPath);
        logger.info('Created default configuration file', { path: resolvedPath });
      }
    } catch (error) {
      // If ConfigManager fails, throw the original error
      throw new ConfigError(
        `Configuration file not found at ${resolvedPath}\n` +
        `Please create a configuration file or set PIXIV_DOWNLOADER_CONFIG environment variable.\n` +
        `You can use the setup wizard: npm run setup`
      );
    }
  }

  let raw: string;
  try {
    raw = readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    throw new ConfigError(
      `Failed to read configuration file: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }

  let parsed: Partial<StandaloneConfig>;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(
      `Invalid JSON in configuration file: ${error instanceof Error ? error.message : String(error)}\n` +
      `Please check the JSON syntax in ${resolvedPath}`,
      error instanceof Error ? error : undefined
    );
  }

  // Apply environment variable overrides
  parsed = applyEnvironmentOverrides(parsed);

  // Auto-detect Docker environment and adjust proxy configuration
  parsed = adjustProxyForEnvironment(parsed);

  // Auto-fix paths in configuration (convert absolute to relative, fix missing paths)
  // In Electron app, use the config file's directory as projectRoot to ensure paths are resolved correctly
  // This prevents the app from accidentally using paths from the development machine
  const configDir = dirname(resolvedPath);
  const autoFixResult = ConfigPathMigrator.autoFixConfig(parsed, configDir);
  if (autoFixResult.fixed && autoFixResult.changes.length > 0) {
    logger.info('Auto-fixed configuration paths', {
      changes: autoFixResult.changes.map(c => ({
        field: c.field,
        oldPath: c.oldPath,
        newPath: c.newPath,
        reason: c.reason,
      })),
    });
    
    // Save the fixed configuration back to file
    try {
      const fixedRaw = JSON.stringify(parsed, null, 2);
      writeFileSync(resolvedPath, fixedRaw, 'utf-8');
      logger.info('Configuration file updated with fixed paths', { path: resolvedPath });
    } catch (error) {
      logger.warn('Failed to save fixed configuration', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Apply defaults - use config file directory as base path to ensure paths are resolved correctly
  // This prevents the app from accidentally using paths from the development machine
  const config = applyDefaults(parsed, configDir);

  // Set log level
  if (config.logLevel) {
    logger.setLevel(config.logLevel);
  }

  // Set log file path
  // For Electron app, use the data directory from config (app data directory)
  // For standalone mode, use project directory
  // If storage.databasePath is absolute and points to a data directory, use that directory for logs
  let logPath: string;
  if (config.storage?.databasePath && isAbsolute(config.storage.databasePath)) {
    // Extract data directory from database path (e.g., /path/to/appData/data/pixiv-downloader.db -> /path/to/appData/data)
    const dataDir = dirname(config.storage.databasePath);
    logPath = join(dataDir, 'pixiv-downloader.log');
  } else {
    // Fallback to project directory for standalone mode
    logPath = join(process.cwd(), 'data', 'pixiv-downloader.log');
  }
  logger.setLogPath(logPath);

  // Token Storage Strategy:
  // 1. Unified storage is the primary source of truth for tokens
  // 2. Config file is automatically synced from unified storage if it has a placeholder
  // 3. When a valid token exists in config file, it's synced to unified storage
  // This allows users to switch between config files without losing authentication
  
  // Check if config file has a placeholder token
  const hasPlaceholderToken = isPlaceholderToken(config.pixiv?.refreshToken);
  
  if (hasPlaceholderToken) {
    // Config file has placeholder - try to load from unified storage
    const unifiedToken = getBestAvailableToken(config.pixiv?.refreshToken, config.storage?.databasePath);
    if (unifiedToken) {
      logger.info('Config file has placeholder token, using token from unified storage');
      config.pixiv.refreshToken = unifiedToken;
      
      // Automatically sync token to config file (synchronous update)
      // This ensures config file always has the real token after loading
      try {
        const configData = JSON.parse(raw);
        configData.pixiv = configData.pixiv || {};
        configData.pixiv.refreshToken = unifiedToken;
        writeFileSync(resolvedPath, JSON.stringify(configData, null, 2), 'utf-8');
        logger.info('Config file automatically synced with token from unified storage');
      } catch (error) {
        // Log warning but don't fail - config object already has the token
        logger.warn('Failed to sync token to config file (using in-memory token)', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      // No token in unified storage either - user needs to login
      logger.warn('No valid token found in config file or unified storage - login required');
    }
  } else if (config.pixiv?.refreshToken) {
    // Config file has a valid token - sync it to unified storage
    // This ensures unified storage is always up-to-date when config file has a token
    saveTokenToStorage(config.pixiv.refreshToken, config.storage?.databasePath);
    logger.debug('Token from config file synced to unified storage');
  }

  // Validate configuration AFTER token has been potentially filled from unified storage
  // Pass the database path to validation so it can check unified storage if needed
  validateConfig(config, resolvedPath, config.storage?.databasePath);

  // Process placeholders (e.g., YESTERDAY)
  return processConfigPlaceholders(config);
}













