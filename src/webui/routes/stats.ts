import { Router, Request, Response } from 'express';
import { Database } from '../../storage/Database';
import { loadConfig, getConfigPath } from '../../config';
import { logger } from '../../logger';
import { ErrorCode } from '../utils/error-codes';

const router = Router();

/**
 * GET /api/stats/overview
 * Get overview statistics
 */
router.get('/overview', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    database = new Database(config.storage!.databasePath!);
    database.migrate(); // Ensure database tables exist

    const stats = database.getOverviewStats();

    database.close();
    database = null;

    res.json({
      data: stats,
    });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get overview stats', { error: { message: errorMessage } });
    res.status(500).json({ errorCode: ErrorCode.STATS_OVERVIEW_FAILED });
  }
});

/**
 * GET /api/stats/downloads
 * Get download statistics
 */
router.get('/downloads', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const { period = '7d' } = req.query;
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    database = new Database(config.storage!.databasePath!);
    database.migrate(); // Ensure database tables exist

    // Parse period (e.g., '7d', '30d', '1y')
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '1y' ? 365 : 7;
    const downloads = database.getDownloadsByPeriod(days);

    database.close();
    database = null;

    res.json({
      data: {
        period,
        downloads: downloads.length,
        data: downloads,
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get download stats', { error: { message: errorMessage } });
    res.status(500).json({ errorCode: ErrorCode.STATS_DOWNLOADS_FAILED });
  }
});

/**
 * GET /api/stats/tags
 * Get tag statistics
 */
router.get('/tags', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const { limit = 10 } = req.query;
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    database = new Database(config.storage!.databasePath!);
    database.migrate(); // Ensure database tables exist

    const tags = database.getTagStats(Number(limit));

    database.close();
    database = null;

    res.json({
      data: { tags },
    });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get tag stats', { error: { message: errorMessage } });
    res.status(500).json({ errorCode: ErrorCode.STATS_TAGS_FAILED });
  }
});

/**
 * GET /api/stats/authors
 * Get author statistics
 */
router.get('/authors', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const { limit = 10 } = req.query;
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    database = new Database(config.storage!.databasePath!);
    database.migrate(); // Ensure database tables exist

    const authors = database.getAuthorStats(Number(limit));

    database.close();
    database = null;

    res.json({
      data: { authors },
    });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get author stats', { error: { message: errorMessage } });
    res.status(500).json({ errorCode: ErrorCode.STATS_AUTHORS_FAILED });
  }
});

export default router;

