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
import { getDefaultConfigPath as getSmartDefaultConfigPath } from '../utils/project-root';
import { getActiveConfigPath, isActiveConfigPathExplicit } from './active-config';
import { StandaloneConfig } from './types';
import { generateDefaultConfig } from './defaults';
import { applyDefaults } from './path-resolution';
import { applyEnvironmentOverrides, adjustProxyForEnvironment } from './environment';
import { processConfigPlaceholders } from './placeholders';
import { validateConfig } from './validation';
import { configureMediaAssetNamespace } from '../domain/media/MediaAsset';

/**
 * Get the resolved configuration file path.
 *
 * Priority (highest first):
 *   1. the `configPath` argument (an explicit `--config` value)
 *   2. the path already resolved for this process by `setActiveConfigPath()`
 *   3. `PIXIV_DOWNLOADER_CONFIG` (before process resolution)
 *   4. ConfigManager's current/default config with smart detection
 *
 * Steps 1–3 are deterministic: once a path is chosen explicitly the process
 * never silently switches to a different file.
 */
export function getConfigPath(configPath?: string): string {
  // If explicitly provided or via environment variable, use it
  if (configPath) {
    return resolve(configPath);
  }

  // The path resolved once at bootstrap wins over re-detection, so every
  // consumer inside the process reads the same configuration file.
  const activeConfigPath = getActiveConfigPath();
  if (activeConfigPath) {
    return resolve(activeConfigPath);
  }

  if (process.env.PIXIV_DOWNLOADER_CONFIG) {
    return resolve(process.env.PIXIV_DOWNLOADER_CONFIG);
  }

  // Otherwise, use ConfigManager with smart detection to find the first available config
  try {
    // getConfigManager() without arguments will use smart detection
    const configManager = getConfigManager();
    const currentConfig = configManager.getCurrentConfigFile();
    if (currentConfig) {
      return currentConfig;
    }
  } catch (error) {
    logger.warn('Failed to use ConfigManager, falling back to smart default path', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to smart default path (project root or user home)
  return getSmartDefaultConfigPath();
}

/**
 * Whether the effective configuration path was requested explicitly, i.e. it
 * came from `--config` or `PIXIV_DOWNLOADER_CONFIG` rather than from an
 * implicit default. Explicit requests must not fall back silently.
 */
function isExplicitConfigRequest(configPath?: string): boolean {
  return Boolean(configPath) || Boolean(process.env.PIXIV_DOWNLOADER_CONFIG) || isActiveConfigPathExplicit();
}

/**
 * Load configuration from file with environment variable support
 * @param configPath - Path to config file
 * @param skipValidation - If true, skip configuration validation (useful for login commands)
 * @param resolveDynamicPlaceholders - If true, resolve dynamic placeholders in the config
 * @param explicitSource - Override the "requested explicitly" detection. Callers that
 *   pass an already-resolved default path (the CLI bootstrap) set this to false so a
 *   missing default file still follows the create-default flow.
 */
export function loadConfig(
  configPath?: string,
  skipValidation: boolean = false,
  resolveDynamicPlaceholders: boolean = true,
  explicitSource: boolean = isExplicitConfigRequest(configPath)
): StandaloneConfig {
  let resolvedPath = getConfigPath(configPath);

  // If config file doesn't exist, try to find or create one
  if (!existsSync(resolvedPath)) {
    if (explicitSource) {
      // An explicitly requested file must never be replaced by another one:
      // silently loading a different config is what made `web --config` serve
      // stale credentials and an unrelated database.
      throw new ConfigError(
        `Configuration file not found at ${resolvedPath}\n` +
        `The path was requested explicitly (--config or PIXIV_DOWNLOADER_CONFIG), so PixivFlow will not ` +
        `fall back to another configuration file.\n` +
        `Create the file, fix the path, or run the setup wizard: pixivflow setup`
      );
    }
    try {
      // getConfigManager() without arguments will use smart detection
      const configManager = getConfigManager();
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
        `You can use the setup wizard: pixivflow setup  (or: npm run setup if you have source code)`
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

  // Media-asset id namespace (download.assetNamespace, default 'pixiv').
  // Applied once per config load so every mediaAssetId() call site picks it up.
  configureMediaAssetNamespace(config.download?.assetNamespace);

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
  // 4. If unified storage token file doesn't exist, don't auto-sync (prevents re-syncing after logout)
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
      // Only sync if we actually found a token (prevents re-syncing after logout)
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
      // This is expected after logout, so don't log as warning
      logger.debug('No valid token found in config file or unified storage - login required');
    }
  } else if (config.pixiv?.refreshToken) {
    // Config file has a valid token - sync it to unified storage
    // This ensures unified storage is always up-to-date when config file has a token
    saveTokenToStorage(config.pixiv.refreshToken, config.storage?.databasePath);
    logger.debug('Token from config file synced to unified storage');
  }

  // Validate configuration AFTER token has been potentially filled from unified storage
  // Pass the database path to validation so it can check unified storage if needed
  // Skip validation for login commands (they will create/update the config)
  if (!skipValidation) {
    validateConfig(config, resolvedPath, config.storage?.databasePath);
  }

  // Process placeholders (e.g., YESTERDAY)
  // Long-running schedulers keep placeholders in their immutable snapshots
  // and resolve TODAY/YESTERDAY immediately before each run.
  const finalConfig = resolveDynamicPlaceholders ? processConfigPlaceholders(config) : config;
  
  // Display directory information on first load (only if config was just created)
  // This helps users know where files will be saved
  if (existsSync(resolvedPath)) {
    const configContent = readFileSync(resolvedPath, 'utf-8');
    const configData = JSON.parse(configContent);
    // Check if this is a newly created config (has minimal/default structure)
    const isNewConfig = !configData.storage?.downloadDirectory || 
                       configData.storage?.downloadDirectory === './downloads';
    
    if (isNewConfig) {
      // Only show on first initialization, not on every load
      // We'll show it in the download command instead to avoid spam
    }
  }
  
  return finalConfig;
}













