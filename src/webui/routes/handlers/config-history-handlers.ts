import { Request, Response } from 'express';
import { writeFileSync } from 'fs';
import { loadConfig, getConfigPath, StandaloneConfig } from '../../../config';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';
import { Database } from '../../../storage/Database';
import { readConfigRaw } from '../config-utils';
import { validateConfigWithUnifiedStorage } from '../config-utils';
import { isPlaceholderToken } from '../../../utils/token-manager';

/**
 * GET /api/config/history
 * Get all configuration history entries
 */
export async function getConfigHistory(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      res.json({ data: [] });
      return;
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
}

/**
 * POST /api/config/history
 * Save configuration to history
 */
export async function saveConfigHistory(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const { name, description, config } = req.body;

    if (!name || !config) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Name and config are required',
      });
      return;
    }

    const configPath = getConfigPath();
    const currentConfig = loadConfig(configPath);
    
    if (!currentConfig.storage?.databasePath) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Database path not configured',
      });
      return;
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
}

/**
 * GET /api/config/history/:id
 * Get a specific configuration history entry
 */
export async function getConfigHistoryById(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid history ID',
      });
      return;
    }

    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Database path not configured',
      });
      return;
    }

    database = new Database(config.storage.databasePath);
    database.migrate();
    
    const entry = database.getConfigHistoryById(id);
    
    if (!entry) {
      database.close();
      res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration history not found',
      });
      return;
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
}

/**
 * DELETE /api/config/history/:id
 * Delete a configuration history entry
 */
export async function deleteConfigHistory(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid history ID',
      });
      return;
    }

    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Database path not configured',
      });
      return;
    }

    database = new Database(config.storage.databasePath);
    database.migrate();
    
    const deleted = database.deleteConfigHistory(id);
    
    database.close();
    database = null;

    if (!deleted) {
      res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration history not found',
      });
      return;
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
}

/**
 * POST /api/config/history/:id/apply
 * Apply a configuration history entry to current config
 */
export async function applyConfigHistory(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid history ID',
      });
      return;
    }

    const configPath = getConfigPath();
    const currentConfig = loadConfig(configPath);
    
    if (!currentConfig.storage?.databasePath) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Database path not configured',
      });
      return;
    }

    database = new Database(currentConfig.storage.databasePath);
    database.migrate();
    
    const entry = database.getConfigHistoryById(id);
    
    if (!entry) {
      database.close();
      res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration history not found',
      });
      return;
    }

    const historyConfig = JSON.parse(entry.config_json) as StandaloneConfig;
    
    // Helper function to check if a token is a placeholder
    const isPlaceholderTokenLocal = (token: string | undefined): boolean => {
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
      if (rawConfig?.pixiv?.refreshToken && !isPlaceholderTokenLocal(rawConfig.pixiv.refreshToken)) {
        actualRefreshToken = rawConfig.pixiv.refreshToken;
      }
    } catch (error) {
      // Ignore errors
    }
    // Fallback to currentConfig if it's not a placeholder
    if (!actualRefreshToken && currentConfig.pixiv?.refreshToken && !isPlaceholderTokenLocal(currentConfig.pixiv.refreshToken)) {
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

    // Validate configuration (automatically checks unified storage for tokens)
    const validationResult = validateConfigWithUnifiedStorage(mergedConfig);
    if (!validationResult.valid) {
      database.close();
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        details: validationResult.errors,
      });
      return;
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
}








