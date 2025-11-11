import { Request, Response } from 'express';
import { logger } from '../../../logger';
import { downloadTaskManager } from '../../services/DownloadTaskManager';
import { loadConfig, getConfigPath } from '../../../config';
import { ErrorCode } from '../../utils/error-codes';

/**
 * POST /api/download/run-all
 * Run all targets (equivalent to npm run download)
 * Body: { configPaths?: string[] } - Optional array of config file paths
 */
export async function runAllDownloads(req: Request, res: Response): Promise<void> {
  try {
    const { configPaths } = req.body;

    if (downloadTaskManager.hasActiveTask()) {
      res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
      });
      return;
    }

    const taskId = `task_all_${Date.now()}`;

    // Start task in background with optional config paths
    downloadTaskManager.startTask(taskId, undefined, undefined, configPaths).catch((error) => {
      logger.error('Background task error', { error, taskId });
    });

    res.json({
      success: true,
      taskId,
      errorCode: ErrorCode.DOWNLOAD_RUN_ALL_START_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to start download all', { error });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_RUN_ALL_START_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// 热门标签列表，用于随机选择
const POPULAR_TAGS = [
  '風景', 'イラスト', 'オリジナル', '女の子', '男の子',
  '猫', '犬', '空', '海', '桜', '花', '星空', '夕日',
  'illustration', 'art', 'anime', 'manga', 'cute',
  'beautiful', 'nature', 'sky', 'sunset', 'flower'
];

// 小说热门标签列表
const POPULAR_NOVEL_TAGS = [
  'オリジナル', '創作', '小説', '物語', 'ストーリー',
  '恋愛', 'ファンタジー', '日常', '青春', '冒険',
  'ミステリー', 'ホラー', 'SF', '歴史', '現代',
  'original', 'story', 'novel', 'romance', 'fantasy',
  'daily', 'youth', 'adventure', 'mystery', 'horror'
];

/**
 * POST /api/download/random
 * Download a random illustration or novel
 */
export async function randomDownload(req: Request, res: Response): Promise<void> {
  try {
    if (downloadTaskManager.hasActiveTask()) {
      res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
      });
      return;
    }

    const { type } = req.body;
    const targetType: 'illustration' | 'novel' = type === 'novel' ? 'novel' : 'illustration';

    // Select random tag
    const tagList = targetType === 'novel' ? POPULAR_NOVEL_TAGS : POPULAR_TAGS;
    const randomTag = tagList[Math.floor(Math.random() * tagList.length)];
    logger.info(`Randomly selected tag: ${randomTag} (type: ${targetType})`);

    // Create temporary config for random download
    const configPath = getConfigPath();
    const baseConfig = loadConfig(configPath);
    const tempConfig = {
      ...baseConfig,
      targets: [
        {
          type: targetType,
          tag: randomTag,
          limit: 1,
          searchTarget: 'partial_match_for_tags' as const,
          random: true, // Enable random selection
        },
      ],
    };

    const taskId = `task_random_${targetType}_${Date.now()}`;

    // Start task in background
    downloadTaskManager.startTask(taskId, undefined, tempConfig).catch((error) => {
      logger.error('Background task error', { error, taskId });
    });

    res.json({
      success: true,
      taskId,
      errorCode: ErrorCode.DOWNLOAD_RANDOM_START_SUCCESS,
      params: { type: targetType },
      tag: randomTag,
      type: targetType,
    });
  } catch (error) {
    logger.error('Failed to start random download', { error });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_RANDOM_START_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}













