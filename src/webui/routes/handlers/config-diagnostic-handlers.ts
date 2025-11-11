import { Request, Response } from 'express';
import { getConfigPath } from '../../../config';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';
import { getConfigManager } from '../../../utils/config-manager';

/**
 * GET /api/config/diagnose
 * Diagnose and analyze current configuration
 */
export async function diagnoseConfig(req: Request, res: Response): Promise<void> {
  try {
    const configPath = getConfigPath();
    const configManager = getConfigManager('config');
    
    // Parse the configuration
    const parseResult = configManager.parseConfig(configPath);
    
    if (!parseResult) {
      res.status(500).json({
        errorCode: ErrorCode.CONFIG_GET_FAILED,
        message: 'Failed to parse configuration file',
      });
      return;
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
    return;
  }
}

/**
 * POST /api/config/repair
 * Repair current configuration file
 */
export async function repairConfig(req: Request, res: Response): Promise<void> {
  try {
    const { createBackup = true } = req.body;
    const configPath = getConfigPath();
    const configManager = getConfigManager('config');
    
    // Repair the configuration
    const repairResult = configManager.repairConfig(configPath, createBackup);
    
    if (!repairResult.success) {
      res.status(500).json({
        errorCode: ErrorCode.CONFIG_UPDATE_FAILED,
        message: 'Failed to repair configuration',
        details: repairResult.errors,
      });
      return;
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
    return;
  }
}








