import { Router, Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { logger } from '../../logger';
import { loadConfig, getConfigPath } from '../../config';
import path from 'path';
import { ErrorCode } from '../utils/error-codes';

const router = Router();

/**
 * GET /api/logs
 * Get logs with pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 100, level, search } = req.query;
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    // Default log path
    const logPath = path.join(process.cwd(), 'data', 'pixiv-downloader.log');

    if (!existsSync(logPath)) {
      return res.json({
        data: {
          logs: [],
          total: 0,
          page: Number(page),
          limit: Number(limit),
        },
      });
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
});

/**
 * DELETE /api/logs
 * Clear logs
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    const logPath = path.join(process.cwd(), 'data', 'pixiv-downloader.log');

    if (existsSync(logPath)) {
      // Truncate log file
      require('fs').writeFileSync(logPath, '', 'utf-8');
    }

    res.json({
      success: true,
      errorCode: ErrorCode.LOGS_CLEAR_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to clear logs', { error });
    res.status(500).json({ errorCode: ErrorCode.LOGS_CLEAR_FAILED });
  }
});

export default router;

