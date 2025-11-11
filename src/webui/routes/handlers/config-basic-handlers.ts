import { Request, Response } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { relative } from 'path';
import { loadConfig, getConfigPath, StandaloneConfig, ConfigValidationError } from '../../../config';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';
import { ConfigError } from '../../../utils/errors';
import { Database } from '../../../storage/Database';
import { getBestAvailableToken, isPlaceholderToken } from '../../../utils/token-manager';
import { getConfigManager } from '../../../utils/config-manager';
import { readConfigRaw, maskSensitiveFields, validateConfigWithUnifiedStorage } from '../config-utils';

/**
 * GET /api/config
 * Get current configuration
 * If there's an active config history, automatically apply it to ensure consistency
 * Uses config parser to normalize and repair configuration for frontend display
 */
export async function getConfig(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const configManager = getConfigManager('config');
    
    // Try to load config, but handle errors gracefully
    let config: StandaloneConfig;
    try {
      config = loadConfig(configPath);
    } catch (error) {
      // If config loading fails, try to repair it
      logger.warn('Failed to load config, attempting repair', {
        error: error instanceof Error ? error.message : String(error),
        configPath,
      });
      
      // Try to repair the configuration
      const repairResult = configManager.repairConfig(configPath, true);
      if (repairResult.success && repairResult.fixed) {
        // Retry loading after repair
        try {
          config = loadConfig(configPath);
          logger.info('Configuration repaired and loaded successfully');
        } catch (retryError) {
          // If still fails, read raw config and normalize it
          const rawConfig = readConfigRaw(configPath);
          if (rawConfig) {
            config = configManager.normalizeConfigForDisplay(rawConfig) as StandaloneConfig;
            logger.info('Using normalized raw config after repair failure');
          } else {
            throw retryError;
          }
        }
      } else {
        // Read raw config and normalize it
        const rawConfig = readConfigRaw(configPath);
        if (rawConfig) {
          config = configManager.normalizeConfigForDisplay(rawConfig) as StandaloneConfig;
          logger.info('Using normalized raw config');
        } else {
          throw error;
        }
      }
    }

    // Check if there's an active config history and apply it if needed
    if (config.storage?.databasePath) {
      try {
        database = new Database(config.storage.databasePath);
        database.migrate();
        
        const activeConfig = database.getActiveConfigHistory();
        if (activeConfig) {
          const historyConfig = JSON.parse(activeConfig.config_json) as StandaloneConfig;
          
          // Get actual refreshToken from config file or unified storage (not placeholder)
          let actualRefreshToken: string | undefined = undefined;
          try {
            const rawConfig = readConfigRaw(getConfigPath());
            const configToken = rawConfig?.pixiv?.refreshToken;
            
            // Check config file token first
            if (!isPlaceholderToken(configToken)) {
              actualRefreshToken = configToken;
            } else {
              // If config file has placeholder, check unified storage
              const databasePath = rawConfig?.storage?.databasePath || config.storage?.databasePath;
              const unifiedToken = getBestAvailableToken(configToken, databasePath);
              if (unifiedToken) {
                actualRefreshToken = unifiedToken;
              }
            }
          } catch (error) {
            // Ignore errors
          }
          // Fallback to config if it's not a placeholder
          if (!actualRefreshToken && config.pixiv?.refreshToken && !isPlaceholderToken(config.pixiv.refreshToken)) {
            actualRefreshToken = config.pixiv.refreshToken;
          }
          // Last resort: check unified storage with config's database path
          if (!actualRefreshToken && config.storage?.databasePath) {
            const unifiedToken = getBestAvailableToken(undefined, config.storage.databasePath);
            if (unifiedToken) {
              actualRefreshToken = unifiedToken;
            }
          }
          
          // Merge with current config to preserve sensitive data
          const mergedConfig: StandaloneConfig = {
            ...historyConfig,
            pixiv: {
              ...historyConfig.pixiv,
              // Preserve current sensitive fields (use actual token, not placeholder)
              refreshToken: actualRefreshToken || historyConfig.pixiv?.refreshToken,
              clientSecret: config.pixiv?.clientSecret || historyConfig.pixiv?.clientSecret,
              deviceToken: config.pixiv?.deviceToken || historyConfig.pixiv?.deviceToken,
              clientId: config.pixiv?.clientId || historyConfig.pixiv?.clientId,
              userAgent: config.pixiv?.userAgent || historyConfig.pixiv?.userAgent,
            },
          };

          // Validate configuration (automatically checks unified storage for tokens)
          const validationResult = validateConfigWithUnifiedStorage(mergedConfig);
          if (validationResult.valid) {
            // Write to file to ensure consistency
            writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');
            config = mergedConfig;
            logger.debug('Active config history applied automatically', { id: activeConfig.id });
          } else {
            logger.warn('Active config history is invalid, skipping auto-apply', {
              id: activeConfig.id,
              errors: validationResult.errors,
            });
          }
        }
      } catch (error) {
        // Don't fail the request if history check fails
        logger.warn('Failed to check/apply active config history', { error });
      } finally {
        if (database) {
          try {
            database.close();
          } catch (closeError) {
            // Ignore close errors
          }
          database = null;
        }
      }
    }

    // Normalize config for frontend display (ensures all sections exist)
    const normalizedConfig = configManager.normalizeConfigForDisplay(config);
    
    // Remove sensitive information before sending
    const safeConfig = maskSensitiveFields(normalizedConfig);

    // Include config path information
    // Ensure targets is always included (even if empty array)
    const configWithMeta = {
      ...safeConfig,
      targets: Array.isArray(safeConfig.targets) ? safeConfig.targets : [],
      _meta: {
        configPath,
        configPathRelative: relative(process.cwd(), configPath),
      },
    };

    res.json({
      data: configWithMeta,
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      const configPath = getConfigPath();
      const rawConfig = readConfigRaw(configPath);
      const safeConfig = maskSensitiveFields(rawConfig);
      const validationErrors =
        error.cause instanceof ConfigValidationError
          ? error.cause.errors
          : [error.message];
      const validationWarnings =
        error.cause instanceof ConfigValidationError
          ? error.cause.warnings
          : [];
      logger.warn('Configuration invalid when fetching config', {
        errors: validationErrors,
        warnings: validationWarnings,
      });

      // Normalize config for frontend display
      const configManager = getConfigManager('config');
      const normalizedConfig = configManager.normalizeConfigForDisplay(safeConfig || {});
      
      // Ensure targets is always included (even if empty array)
      const configWithMeta = {
        ...normalizedConfig,
        targets: Array.isArray(normalizedConfig.targets) ? normalizedConfig.targets : [],
        _meta: {
          configPath,
          configPathRelative: relative(process.cwd(), configPath),
        },
        _validation: {
          valid: false,
          errors: validationErrors,
          warnings: validationWarnings,
        },
      };

      res.json({
        data: configWithMeta,
      });
      return;
    }
    logger.error('Failed to get config', { error });
    res.status(500).json({ errorCode: ErrorCode.CONFIG_GET_FAILED });
  }
}

/**
 * PUT /api/config
 * Update configuration
 */
export async function updateConfig(req: Request, res: Response): Promise<void> {
  try {
    const configPath = getConfigPath();
    let currentConfig: Partial<StandaloneConfig> = {};
    try {
      currentConfig = loadConfig(configPath);
    } catch (error) {
      if (error instanceof ConfigError) {
        logger.warn('Current configuration is invalid, attempting to use raw config for merge', {
          errors:
            error.cause instanceof ConfigValidationError ? error.cause.errors : [error instanceof Error ? error.message : String(error)],
        });
        currentConfig = readConfigRaw(configPath) ?? {};
      } else {
        throw error;
      }
    }

    // Helper function to check if a token is a placeholder
    const isPlaceholderTokenLocal = (token: string | undefined): boolean => {
      if (!token) return false;
      const lowerToken = token.toLowerCase().trim();
      return lowerToken === 'your_refresh_token' || 
             lowerToken === '***' ||
             lowerToken === '';
    };

    // Try to get the actual refreshToken from the raw config file
    // This is needed because if config validation fails, currentConfig might have placeholder
    let actualRefreshToken: string | undefined = undefined;
    try {
      const rawConfig = readConfigRaw(configPath);
      if (rawConfig?.pixiv?.refreshToken && !isPlaceholderTokenLocal(rawConfig.pixiv.refreshToken)) {
        actualRefreshToken = rawConfig.pixiv.refreshToken;
      }
    } catch (error) {
      // Ignore errors when reading raw config
    }
    // Fallback to currentConfig if raw read didn't work
    if (!actualRefreshToken && currentConfig.pixiv?.refreshToken && !isPlaceholderTokenLocal(currentConfig.pixiv.refreshToken)) {
      actualRefreshToken = currentConfig.pixiv.refreshToken;
    }

    // Merge with existing config (preserve sensitive data)
    const updatedConfig: StandaloneConfig = {
      ...(currentConfig as StandaloneConfig),
      ...req.body,
      pixiv: {
        ...(currentConfig.pixiv ?? {}),
        ...(req.body.pixiv ?? {}),
        // Preserve sensitive/required fields unless explicitly provided
        // If request provides a valid token, use it; otherwise use actual token from file (not placeholder)
        refreshToken:
          req.body.pixiv?.refreshToken && 
          req.body.pixiv.refreshToken !== '***' && 
          !isPlaceholderTokenLocal(req.body.pixiv.refreshToken)
            ? req.body.pixiv.refreshToken
            : actualRefreshToken || currentConfig.pixiv?.refreshToken,
        clientSecret:
          req.body.pixiv?.clientSecret && req.body.pixiv.clientSecret !== '***'
            ? req.body.pixiv.clientSecret
            : currentConfig.pixiv?.clientSecret,
        // Preserve deviceToken if not provided in request
        deviceToken:
          req.body.pixiv?.deviceToken && req.body.pixiv.deviceToken.trim() !== ''
            ? req.body.pixiv.deviceToken
            : currentConfig.pixiv?.deviceToken,
        // Preserve clientId if not provided in request
        clientId:
          req.body.pixiv?.clientId && req.body.pixiv.clientId.trim() !== ''
            ? req.body.pixiv.clientId
            : currentConfig.pixiv?.clientId,
        // Preserve userAgent if not provided in request
        userAgent:
          req.body.pixiv?.userAgent && req.body.pixiv.userAgent.trim() !== ''
            ? req.body.pixiv.userAgent
            : currentConfig.pixiv?.userAgent,
      },
      targets: req.body.targets ?? currentConfig.targets ?? [],
    };

    // Validate configuration (automatically checks unified storage for tokens)
    const validationResult = validateConfigWithUnifiedStorage(updatedConfig);
    if (!validationResult.valid) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        details: validationResult.errors,
      });
      return;
    }

    // Write to file
    writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');

    // Auto-save to config history if database is available
    try {
      if (updatedConfig.storage?.databasePath) {
        const database = new Database(updatedConfig.storage.databasePath);
        database.migrate();
        const timestamp = new Date().toISOString().split('T')[0];
        const name = `Config ${timestamp}`;
        database.saveConfigHistory(name, updatedConfig, 'Auto-saved configuration');
        database.close();
        logger.debug('Configuration auto-saved to history', { name });
      }
    } catch (error) {
      // Don't fail the update if history save fails
      logger.warn('Failed to save config to history', { error });
    }

    logger.info('Configuration updated', { configPath });

    res.json({
      success: true,
      errorCode: ErrorCode.CONFIG_UPDATE_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to update config', { error });
    res.status(500).json({
      errorCode: ErrorCode.CONFIG_UPDATE_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * POST /api/config/validate
 * Validate configuration
 * Note: This validates the config as-is. The actual loadConfig() function
 * will automatically fill placeholder tokens from unified storage.
 */
export async function validateConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const config = req.body as StandaloneConfig;
    
    // Validate configuration (automatically checks unified storage for tokens)
    // This matches the behavior of loadConfig() which auto-fills tokens
    const validationResult = validateConfigWithUnifiedStorage(config);

    res.json({
      valid: validationResult.valid,
      errors: validationResult.errors,
    });
  } catch (error) {
    logger.error('Failed to validate config', { error });
    res.status(500).json({ errorCode: ErrorCode.CONFIG_VALIDATE_FAILED });
  }
}








