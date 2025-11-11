import { Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { loadConfig, getConfigPath } from '../../../config';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';

/**
 * GET /api/config/backup
 * Backup current configuration
 */
export async function backupConfig(req: Request, res: Response): Promise<void> {
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
}

/**
 * POST /api/config/restore
 * Restore configuration from backup
 */
export async function restoreConfig(req: Request, res: Response): Promise<void> {
  try {
    const { backupPath } = req.body;

    if (!backupPath || !existsSync(backupPath)) {
      res.status(400).json({
        errorCode: ErrorCode.CONFIG_BACKUP_PATH_INVALID,
      });
      return;
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
}








