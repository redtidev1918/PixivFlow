import { Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { relative, join } from 'path';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';
import { getConfigManager } from '../../../utils/config-manager';
import { StandaloneConfig } from '../../../config';
import { isValidConfigFilename, validateConfigWithUnifiedStorage } from '../config-utils';

/**
 * GET /api/config/files
 * List all configuration files in the config directory
 */
export async function listConfigFiles(req: Request, res: Response): Promise<void> {
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
}

/**
 * POST /api/config/files/switch
 * Switch to a different configuration file
 */
export async function switchConfigFile(req: Request, res: Response): Promise<void> {
  try {
    const { path } = req.body;
    
    if (!path) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Config file path is required',
      });
      return;
    }

    const configManager = getConfigManager('config');
    
    // Validate that the file exists and is readable
    const config = configManager.readConfig(path);
    if (!config) {
      res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration file not found or invalid',
      });
      return;
    }

    // Validate the configuration (automatically checks unified storage for tokens)
    const validationResult = validateConfigWithUnifiedStorage(config);
    if (!validationResult.valid) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        details: validationResult.errors,
      });
      return;
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
}

/**
 * POST /api/config/files/import
 * Import a configuration and save it with auto-numbering
 */
export async function importConfigFile(req: Request, res: Response): Promise<void> {
  try {
    const { config, name } = req.body;
    
    if (!config) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Configuration object is required',
      });
      return;
    }

    // Validate the configuration (automatically checks unified storage for tokens)
    const validationResult = validateConfigWithUnifiedStorage(config);
    if (!validationResult.valid) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        details: validationResult.errors,
      });
      return;
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
}

/**
 * DELETE /api/config/files/:filename
 * Delete a configuration file
 */
export async function deleteConfigFile(req: Request, res: Response): Promise<void> {
  try {
    const { filename } = req.params;
    const configManager = getConfigManager('config');
    const configDir = configManager.getConfigDir();
    const path = join(configDir, filename);
    
    // Validate filename to prevent directory traversal
    if (!isValidConfigFilename(filename)) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid configuration filename',
      });
      return;
    }

    const deleted = configManager.deleteConfig(path);
    
    if (!deleted) {
      res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration file not found',
      });
      return;
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
}

/**
 * GET /api/config/files/:filename/content
 * Get the raw JSON content of a configuration file
 */
export async function getConfigFileContent(req: Request, res: Response): Promise<void> {
  try {
    const { filename } = req.params;
    const configManager = getConfigManager('config');
    const configDir = configManager.getConfigDir();
    const path = join(configDir, filename);
    
    // Validate filename to prevent directory traversal
    if (!isValidConfigFilename(filename)) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid configuration filename',
      });
      return;
    }

    if (!existsSync(path)) {
      res.status(404).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Configuration file not found',
      });
      return;
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
}

/**
 * PUT /api/config/files/:filename/content
 * Update the raw JSON content of a configuration file
 */
export async function updateConfigFileContent(req: Request, res: Response): Promise<void> {
  try {
    const { filename } = req.params;
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Content is required and must be a string',
      });
      return;
    }

    const configManager = getConfigManager('config');
    const configDir = configManager.getConfigDir();
    const path = join(configDir, filename);
    
    // Validate filename to prevent directory traversal
    if (!isValidConfigFilename(filename)) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid configuration filename',
      });
      return;
    }

    // Validate JSON syntax
    let parsedConfig: any;
    try {
      parsedConfig = JSON.parse(content);
    } catch (error) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        message: 'Invalid JSON format',
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    // Validate configuration structure (automatically checks unified storage for tokens)
    const validationResult = validateConfigWithUnifiedStorage(parsedConfig);
    if (!validationResult.valid) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_INVALID,
        details: validationResult.errors,
      });
      return;
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
}








