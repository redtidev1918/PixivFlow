import { Request, Response } from 'express';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { logger } from '../../../logger';
import { loadConfig, getConfigPath } from '../../../config';
import path from 'path';
import { isAbsolute, dirname, join } from 'node:path';
import { ErrorCode } from '../../utils/error-codes';

/**
 * Get log file path from config
 */
function getLogPath(): string {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  // Get log path from config (use data directory from database path for Electron app)
  if (config.storage?.databasePath && isAbsolute(config.storage.databasePath)) {
    const dataDir = dirname(config.storage.databasePath);
    return join(dataDir, 'pixiv-downloader.log');
  } else {
    return path.join(process.cwd(), 'data', 'pixiv-downloader.log');
  }
}

/**
 * GET /api/logs
 * Get logs with pagination
 */
export async function getLogs(req: Request, res: Response): Promise<void> {
  try {
    const { page = 1, limit = 100, level, search } = req.query;
    const logPath = getLogPath();

    if (!existsSync(logPath)) {
      res.json({
        data: {
          logs: [],
          total: 0,
          page: Number(page),
          limit: Number(limit),
        },
      });
      return;
    }

    // Read log file
    const logContent = readFileSync(logPath, 'utf-8');
    const lines = logContent.split('\n').filter((line) => line.trim());

    // Filter by level if specified
    let filteredLines = lines;
    if (level) {
      filteredLines = lines.filter((line) =>
        line.toLowerCase().includes(`[${level}]`)
      );
    }

    // Search if specified
    if (search) {
      filteredLines = filteredLines.filter((line) =>
        line.toLowerCase().includes(String(search).toLowerCase())
      );
    }

    // Paginate
    const start = (Number(page) - 1) * Number(limit);
    const end = start + Number(limit);
    const paginatedLines = filteredLines.slice(start, end);

    res.json({
      data: {
        logs: paginatedLines,
        total: filteredLines.length,
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (error) {
    logger.error('Failed to get logs', { error });
    res.status(500).json({ errorCode: ErrorCode.LOGS_GET_FAILED });
  }
}

/**
 * DELETE /api/logs
 * Clear logs
 */
export async function clearLogs(req: Request, res: Response): Promise<void> {
  try {
    const logPath = getLogPath();

    if (existsSync(logPath)) {
      // Truncate log file
      writeFileSync(logPath, '', 'utf-8');
    }

    res.json({
      success: true,
      errorCode: ErrorCode.LOGS_CLEAR_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to clear logs', { error });
    res.status(500).json({ errorCode: ErrorCode.LOGS_CLEAR_FAILED });
  }
}



























