import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { relative } from 'path';
import { loadConfig, getConfigPath, StandaloneConfig, ConfigValidationError } from '../../config';
import { logger } from '../../logger';
import { validateConfig } from '../utils/config-validator';
import { ErrorCode } from '../utils/error-codes';
import { ConfigError } from '../../utils/errors';

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
 * GET /api/config
 * Get current configuration
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    // Remove sensitive information before sending
    const safeConfig = maskSensitiveFields(config);

    // Include config path information
    res.json({
      ...safeConfig,
      _meta: {
        configPath,
        configPathRelative: relative(process.cwd(), configPath),
      },
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

      return res.json({
        ...safeConfig,
        _meta: {
          configPath,
          configPathRelative: relative(process.cwd(), configPath),
        },
        _validation: {
          valid: false,
          errors: validationErrors,
          warnings: validationWarnings,
        },
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

    // Merge with existing config (preserve sensitive data)
    const updatedConfig: StandaloneConfig = {
      ...(currentConfig as StandaloneConfig),
      ...req.body,
      pixiv: {
        ...(currentConfig.pixiv ?? {}),
        ...(req.body.pixiv ?? {}),
        // Preserve sensitive/required fields unless explicitly provided
        refreshToken:
          req.body.pixiv?.refreshToken && req.body.pixiv.refreshToken !== '***'
            ? req.body.pixiv.refreshToken
            : currentConfig.pixiv?.refreshToken,
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

