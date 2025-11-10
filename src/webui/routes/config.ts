import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { relative, join } from 'path';
import { loadConfig, getConfigPath, StandaloneConfig, ConfigValidationError } from '../../config';
import { logger } from '../../logger';
import { validateConfig } from '../utils/config-validator';
import { ErrorCode } from '../utils/error-codes';
import { ConfigError } from '../../utils/errors';
import { Database } from '../../storage/Database';
import { getBestAvailableToken, isPlaceholderToken } from '../../utils/token-manager';
import { getConfigManager } from '../../utils/config-manager';

function readConfigRaw(configPath: string): Partial<StandaloneConfig> | null {
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

function maskSensitiveFields(config: Partial<StandaloneConfig> | null): Partial<StandaloneConfig> {
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

const router = Router();

/**
 * Validate configuration filename to prevent directory traversal while allowing flexible naming
 * Allows:
 * - standalone.config.json
 * - standalone.config.*.json (where * can be alphanumeric, dots, hyphens, underscores)
 * - Any other *.json files (but must be safe)
 */
function isValidConfigFilename(filename: string): boolean {
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
 * GET /api/config
 * Get current configuration
 * If there's an active config history, automatically apply it to ensure consistency
 * Uses config parser to normalize and repair configuration for frontend display
 */
router.get('/', async (req: Request, res: Response) => {
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

          // Validate configuration
          const validationResult = validateConfig(mergedConfig);
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

      return res.json({
        data: configWithMeta,
      });
    }
    logger.error('Failed to get config', { error });
    res.status(500).json({ errorCode: ErrorCode.CONFIG_GET_FAILED });
  }
});

/**
 * PUT /api/config
 * Update configuration
 */
router.put('/', async (req: Request, res: Response) => {
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
    const isPlaceholderToken = (token: string | undefined): boolean => {
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
      if (rawConfig?.pixiv?.refreshToken && !isPlaceholderToken(rawConfig.pixiv.refreshToken)) {
        actualRefreshToken = rawConfig.pixiv.refreshToken;
      }
    } catch (error) {
      // Ignore errors when reading raw config
    }
    // Fallback to currentConfig if raw read didn't work
    if (!actualRefreshToken && currentConfig.pixiv?.refreshToken && !isPlaceholderToken(currentConfig.pixiv.refreshToken)) {
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
          !isPlaceholderToken(req.body.pixiv.refreshToken)
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

    // Validate configuration
    const validationResult = validateConfig(updatedConfig);
    if (!validationResult.valid) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        details: validationResult.errors,
      });
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
});

/**
 * POST /api/config/validate
 * Validate configuration
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const config = req.body as StandaloneConfig;
    const validationResult = validateConfig(config);

    res.json({
      valid: validationResult.valid,
      errors: validationResult.errors,
    });
  } catch (error) {
    logger.error('Failed to validate config', { error });
    res.status(500).json({ errorCode: ErrorCode.CONFIG_VALIDATE_FAILED });
  }
});

/**
 * GET /api/config/backup
 * Backup current configuration
 */
router.get('/backup', async (req: Request, res: Response) => {
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = configPath.replace('.json', `.backup.${timestamp}.json`);

    writeFileSync(backupPath, JSON.stringify(config, null, 2), 'utf-8');

    res.json({
      success: true,
      backupPath,
      errorCode: ErrorCode.CONFIG_BACKUP_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to backup config', { error });
    res.status(500).json({ errorCode: ErrorCode.CONFIG_BACKUP_FAILED });
  }
});

/**
 * POST /api/config/restore
 * Restore configuration from backup
 */
router.post('/restore', async (req: Request, res: Response) => {
  try {
    const { backupPath } = req.body;

    if (!backupPath || !existsSync(backupPath)) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_BACKUP_PATH_INVALID,
      });
    }

    const backupConfig = JSON.parse(readFileSync(backupPath, 'utf-8'));
    const configPath = getConfigPath();

    writeFileSync(configPath, JSON.stringify(backupConfig, null, 2), 'utf-8');

    res.json({
      success: true,
      errorCode: ErrorCode.CONFIG_RESTORE_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to restore config', { error });
    res.status(500).json({ errorCode: ErrorCode.CONFIG_RESTORE_FAILED });
  }
});

/**
 * GET /api/config/history
 * Get all configuration history entries
 */
router.get('/history', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      return res.json({ data: [] });
    }

    database = new Database(config.storage.databasePath);
    database.migrate();
    
    const history = database.getConfigHistory();
    
    // Parse config_json for each entry
    const parsedHistory = history.map(entry => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      config: JSON.parse(entry.config_json),
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      is_active: entry.is_active,
    }));

    database.close();
    database = null;

    res.json({ data: parsedHistory });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    logger.error('Failed to get config history', { error });
    res.status(500).json({ errorCode: ErrorCode.CONFIG_GET_FAILED });
  }
});

/**
 * POST /api/config/history
 * Save configuration to history
 */
router.post('/history', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const { name, description, config } = req.body;

    if (!name || !config) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Name and config are required',
      });
    }

    const configPath = getConfigPath();
    const currentConfig = loadConfig(configPath);
    
    if (!currentConfig.storage?.databasePath) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Database path not configured',
      });
    }

    database = new Database(currentConfig.storage.databasePath);
    database.migrate();
    
    const id = database.saveConfigHistory(name, config, description);
    
    database.close();
    database = null;

    res.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    logger.error('Failed to save config history', { error });
    res.status(500).json({
      errorCode: ErrorCode.CONFIG_UPDATE_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/config/history/:id
 * Get a specific configuration history entry
 */
router.get('/history/:id', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid history ID',
      });
    }

    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Database path not configured',
      });
    }

    database = new Database(config.storage.databasePath);
    database.migrate();
    
    const entry = database.getConfigHistoryById(id);
    
    if (!entry) {
      database.close();
      return res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration history not found',
      });
    }

    database.close();
    database = null;

    res.json({
      data: {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        config: JSON.parse(entry.config_json),
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        is_active: entry.is_active,
      },
    });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    logger.error('Failed to get config history entry', { error });
    res.status(500).json({ errorCode: ErrorCode.CONFIG_GET_FAILED });
  }
});

/**
 * DELETE /api/config/history/:id
 * Delete a configuration history entry
 */
router.delete('/history/:id', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid history ID',
      });
    }

    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Database path not configured',
      });
    }

    database = new Database(config.storage.databasePath);
    database.migrate();
    
    const deleted = database.deleteConfigHistory(id);
    
    database.close();
    database = null;

    if (!deleted) {
      return res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration history not found',
      });
    }

    res.json({
      success: true,
    });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    logger.error('Failed to delete config history', { error });
    res.status(500).json({ errorCode: ErrorCode.CONFIG_UPDATE_FAILED });
  }
});

/**
 * POST /api/config/history/:id/apply
 * Apply a configuration history entry to current config
 */
router.post('/history/:id/apply', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid history ID',
      });
    }

    const configPath = getConfigPath();
    const currentConfig = loadConfig(configPath);
    
    if (!currentConfig.storage?.databasePath) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Database path not configured',
      });
    }

    database = new Database(currentConfig.storage.databasePath);
    database.migrate();
    
    const entry = database.getConfigHistoryById(id);
    
    if (!entry) {
      database.close();
      return res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration history not found',
      });
    }

    const historyConfig = JSON.parse(entry.config_json) as StandaloneConfig;
    
    // Helper function to check if a token is a placeholder
    const isPlaceholderToken = (token: string | undefined): boolean => {
      if (!token) return false;
      const lowerToken = token.toLowerCase().trim();
      return lowerToken === 'your_refresh_token' || 
             lowerToken === '***' ||
             lowerToken === '';
    };

    // Get actual refreshToken from raw config file (not placeholder)
    let actualRefreshToken: string | undefined = undefined;
    try {
      const rawConfig = readConfigRaw(configPath);
      if (rawConfig?.pixiv?.refreshToken && !isPlaceholderToken(rawConfig.pixiv.refreshToken)) {
        actualRefreshToken = rawConfig.pixiv.refreshToken;
      }
    } catch (error) {
      // Ignore errors
    }
    // Fallback to currentConfig if it's not a placeholder
    if (!actualRefreshToken && currentConfig.pixiv?.refreshToken && !isPlaceholderToken(currentConfig.pixiv.refreshToken)) {
      actualRefreshToken = currentConfig.pixiv.refreshToken;
    }
    
    // Merge with current config to preserve sensitive data
    const mergedConfig: StandaloneConfig = {
      ...historyConfig,
      pixiv: {
        ...historyConfig.pixiv,
        // Preserve current sensitive fields (use actual token, not placeholder)
        refreshToken: actualRefreshToken || historyConfig.pixiv?.refreshToken,
        clientSecret: currentConfig.pixiv?.clientSecret || historyConfig.pixiv?.clientSecret,
        deviceToken: currentConfig.pixiv?.deviceToken || historyConfig.pixiv?.deviceToken,
        clientId: currentConfig.pixiv?.clientId || historyConfig.pixiv?.clientId,
        userAgent: currentConfig.pixiv?.userAgent || historyConfig.pixiv?.userAgent,
      },
    };

    // Validate configuration
    const validationResult = validateConfig(mergedConfig);
    if (!validationResult.valid) {
      database.close();
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        details: validationResult.errors,
      });
    }

    // Write to file
    writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');

    // Set this configuration as active
    database.setActiveConfigHistory(id);

    database.close();
    database = null;

    logger.info('Configuration applied from history', { id, configPath });

    res.json({
      success: true,
      errorCode: ErrorCode.CONFIG_UPDATE_SUCCESS,
    });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    logger.error('Failed to apply config history', { error });
    res.status(500).json({
      errorCode: ErrorCode.CONFIG_UPDATE_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/config/files
 * List all configuration files in the config directory
 */
router.get('/files', async (req: Request, res: Response) => {
  try {
    const configManager = getConfigManager('config');
    const files = configManager.listConfigFiles();
    
    // Log for debugging - helps identify if files are being filtered incorrectly
    logger.debug('Listing config files', {
      count: files.length,
      filenames: files.map(f => f.filename),
    });
    
    res.json({
      data: files.map(file => ({
        filename: file.filename,
        path: file.path,
        pathRelative: relative(process.cwd(), file.path),
        modifiedTime: file.modifiedTime.toISOString(),
        size: file.size,
        // Use isActive from listConfigFiles() which correctly compares resolved paths
        isActive: file.isActive,
      })),
    });
  } catch (error) {
    logger.error('Failed to list config files', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ errorCode: ErrorCode.CONFIG_GET_FAILED });
  }
});

/**
 * POST /api/config/files/switch
 * Switch to a different configuration file
 */
router.post('/files/switch', async (req: Request, res: Response) => {
  try {
    const { path } = req.body;
    
    if (!path) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Config file path is required',
      });
    }

    const configManager = getConfigManager('config');
    
    // Validate that the file exists and is readable
    const config = configManager.readConfig(path);
    if (!config) {
      return res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration file not found or invalid',
      });
    }

    // Validate the configuration
    const validationResult = validateConfig(config);
    if (!validationResult.valid) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        details: validationResult.errors,
      });
    }

    // Set as current config
    configManager.setCurrentConfigFile(path);
    
    logger.info('Switched configuration file', { path });

    res.json({
      success: true,
      errorCode: ErrorCode.CONFIG_UPDATE_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to switch config file', { error });
    res.status(500).json({
      errorCode: ErrorCode.CONFIG_UPDATE_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/config/files/import
 * Import a configuration and save it with auto-numbering
 */
router.post('/files/import', async (req: Request, res: Response) => {
  try {
    const { config, name } = req.body;
    
    if (!config) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Configuration object is required',
      });
    }

    // Validate the configuration
    const validationResult = validateConfig(config);
    if (!validationResult.valid) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        details: validationResult.errors,
      });
    }

    const configManager = getConfigManager('config');
    
    // Import and save with auto-numbering
    const savedPath = configManager.importConfig(config, name);
    
    logger.info('Imported configuration file', { path: savedPath });

    res.json({
      success: true,
      data: {
        path: savedPath,
        pathRelative: relative(process.cwd(), savedPath),
        filename: relative(configManager.getConfigDir(), savedPath),
      },
      errorCode: ErrorCode.CONFIG_UPDATE_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to import config file', { error });
    res.status(500).json({
      errorCode: ErrorCode.CONFIG_UPDATE_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/config/files/:filename
 * Delete a configuration file
 */
router.delete('/files/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const configManager = getConfigManager('config');
    const configDir = configManager.getConfigDir();
    const path = join(configDir, filename);
    
    // Validate filename to prevent directory traversal
    if (!isValidConfigFilename(filename)) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid configuration filename',
      });
    }

    const deleted = configManager.deleteConfig(path);
    
    if (!deleted) {
      return res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration file not found',
      });
    }

    logger.info('Deleted configuration file', { filename, path });

    res.json({
      success: true,
      errorCode: ErrorCode.CONFIG_UPDATE_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to delete config file', { error });
    res.status(500).json({
      errorCode: ErrorCode.CONFIG_UPDATE_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/config/files/:filename/content
 * Get the raw JSON content of a configuration file
 */
router.get('/files/:filename/content', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const configManager = getConfigManager('config');
    const configDir = configManager.getConfigDir();
    const path = join(configDir, filename);
    
    // Validate filename to prevent directory traversal
    if (!isValidConfigFilename(filename)) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid configuration filename',
      });
    }

    if (!existsSync(path)) {
      return res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration file not found',
      });
    }

    // Read raw file content
    const content = readFileSync(path, 'utf-8');
    
    logger.info('Read configuration file content', { filename, path });

    res.json({
      success: true,
      data: {
        filename,
        path,
        pathRelative: relative(process.cwd(), path),
        content,
      },
    });
  } catch (error) {
    logger.error('Failed to read config file content', { error });
    res.status(500).json({
      errorCode: ErrorCode.CONFIG_GET_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/config/diagnose
 * Diagnose and analyze current configuration
 */
router.get('/diagnose', async (req: Request, res: Response) => {
  try {
    const configPath = getConfigPath();
    const configManager = getConfigManager('config');
    
    // Parse the configuration
    const parseResult = configManager.parseConfig(configPath);
    
    if (!parseResult) {
      return res.status(500).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Failed to parse configuration file',
      });
    }

    res.json({
      success: true,
      data: {
        stats: parseResult.stats,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        fields: parseResult.fields.map(f => ({
          path: f.path,
          name: f.name,
          type: f.type,
          required: f.required,
          description: f.description,
          defaultValue: f.defaultValue,
          enumValues: f.enumValues,
          depth: f.depth,
          isLeaf: f.isLeaf,
        })),
        sections: parseResult.sections,
      },
    });
  } catch (error) {
    logger.error('Failed to diagnose config', { error });
    res.status(500).json({
      errorCode: ErrorCode.CONFIG_GET_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/config/repair
 * Repair current configuration file
 */
router.post('/repair', async (req: Request, res: Response) => {
  try {
    const { createBackup = true } = req.body;
    const configPath = getConfigPath();
    const configManager = getConfigManager('config');
    
    // Repair the configuration
    const repairResult = configManager.repairConfig(configPath, createBackup);
    
    if (!repairResult.success) {
      return res.status(500).json({
        errorCode: ErrorCode.CONFIG_UPDATE_FAILED,
        message: 'Failed to repair configuration',
        details: repairResult.errors,
      });
    }

    res.json({
      success: true,
      data: {
        fixed: repairResult.fixed,
        errors: repairResult.errors,
        warnings: repairResult.warnings,
        backupPath: repairResult.backupPath,
      },
      errorCode: ErrorCode.CONFIG_UPDATE_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to repair config', { error });
    res.status(500).json({
      errorCode: ErrorCode.CONFIG_UPDATE_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/config/files/:filename/content
 * Update the raw JSON content of a configuration file
 */
router.put('/files/:filename/content', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Content is required and must be a string',
      });
    }

    const configManager = getConfigManager('config');
    const configDir = configManager.getConfigDir();
    const path = join(configDir, filename);
    
    // Validate filename to prevent directory traversal
    if (!isValidConfigFilename(filename)) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid configuration filename',
      });
    }

    // Validate JSON syntax
    let parsedConfig: any;
    try {
      parsedConfig = JSON.parse(content);
    } catch (error) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid JSON format',
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // Validate configuration structure
    const validationResult = validateConfig(parsedConfig);
    if (!validationResult.valid) {
      return res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        details: validationResult.errors,
      });
    }

    // Write to file
    writeFileSync(path, content, 'utf-8');
    
    logger.info('Updated configuration file content', { filename, path });

    res.json({
      success: true,
      errorCode: ErrorCode.CONFIG_UPDATE_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to update config file content', { error });
    res.status(500).json({
      errorCode: ErrorCode.CONFIG_UPDATE_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

