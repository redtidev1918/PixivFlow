import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { relative } from 'path';
import { loadConfig, getConfigPath, StandaloneConfig } from '../../config';
import { logger } from '../../logger';
import { validateConfig } from '../utils/config-validator';
import { ErrorCode } from '../utils/error-codes';

const router = Router();

/**
 * GET /api/config
 * Get current configuration
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    // Remove sensitive information before sending
    const safeConfig = {
      ...config,
      pixiv: {
        ...config.pixiv,
        refreshToken: config.pixiv?.refreshToken ? '***' : undefined,
        clientSecret: config.pixiv?.clientSecret ? '***' : undefined,
      },
    };

    // Include config path information
    res.json({
      ...safeConfig,
      _meta: {
        configPath,
        configPathRelative: relative(process.cwd(), configPath),
      },
    });
  } catch (error) {
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
    const currentConfig = loadConfig(configPath);

    // Merge with existing config (preserve sensitive data)
    const updatedConfig: StandaloneConfig = {
      ...currentConfig,
      ...req.body,
      pixiv: {
        ...currentConfig.pixiv,
        ...req.body.pixiv,
        // Preserve sensitive fields
        refreshToken: currentConfig.pixiv?.refreshToken,
        clientSecret: currentConfig.pixiv?.clientSecret,
      },
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

export default router;

