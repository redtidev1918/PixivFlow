import { Router, Request, Response } from 'express';
import { logger } from '../../logger';
import { downloadTaskManager } from '../services/DownloadTaskManager';
import { Database } from '../../storage/Database';
import { loadConfig, getConfigPath } from '../../config';
import { relative, join } from 'path';
import { ErrorCode } from '../utils/error-codes';

const router = Router();

/**
 * Convert host file path to container path if needed
 * This handles the case where database contains host paths but we're running in Docker
 */
function convertFilePathToContainerPath(filePath: string, config: any): string {
  // If already using container paths, return as is
  if (filePath.startsWith('/app/')) {
    return filePath;
  }

  // Try to extract relative path from host absolute path
  // Common patterns:
  // - /Users/.../downloads/downloads/illustrations/... -> /app/downloads/downloads/illustrations/...
  // - /Users/.../downloads/downloads/novels/... -> /app/downloads/downloads/novels/...
  
  const illustrationDir = config.storage?.illustrationDirectory || '';
  const novelDir = config.storage?.novelDirectory || '';
  
  // Check if file path is under illustration directory
  if (illustrationDir && filePath.includes('illustrations')) {
    // Extract the relative path from the illustrations directory
    // Pattern: .../illustrations/filename.jpg
    const match = filePath.match(/illustrations\/(.+)$/);
    if (match) {
      return join(illustrationDir, match[1]);
    }
  }
  
  // Check if file path is under novel directory
  if (novelDir && filePath.includes('novels')) {
    // Pattern: .../novels/filename.txt
    const match = filePath.match(/novels\/(.+)$/);
    if (match) {
      return join(novelDir, match[1]);
    }
  }
  
  // If we can't convert, return original path
  // The file preview route will handle the error
  return filePath;
}

/**
 * POST /api/download/start
 * Start a download task
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { targetId, config } = req.body;

    // Check if there's already an active task
    if (downloadTaskManager.hasActiveTask()) {
      return res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
      });
    }

    const taskId = `task_${Date.now()}`;

    // Start task in background
    downloadTaskManager.startTask(taskId, targetId, config).catch((error) => {
      logger.error('Background task error', { error, taskId });
    });

    res.json({
      success: true,
      taskId,
      errorCode: ErrorCode.DOWNLOAD_START_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to start download', { error });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_START_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/download/stop
 * Stop a download task
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ID_REQUIRED,
      });
    }

    await downloadTaskManager.stopTask(taskId);

    res.json({
      success: true,
      errorCode: ErrorCode.DOWNLOAD_STOP_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to stop download', { error });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_STOP_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Helper function to serialize TaskStatus for JSON response
 */
function serializeTaskStatus(task: any) {
  if (!task) return null;
  return {
    ...task,
    startTime: task.startTime instanceof Date ? task.startTime.toISOString() : task.startTime,
    endTime: task.endTime instanceof Date ? task.endTime.toISOString() : task.endTime,
    logs: task.logs?.map((log: any) => ({
      ...log,
      timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
    })),
  };
}

/**
 * GET /api/download/status
 * Get download task status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.query;

    if (taskId) {
      const status = downloadTaskManager.getTaskStatus(taskId as string);
      if (!status) {
        return res.status(404).json({
          errorCode: ErrorCode.DOWNLOAD_TASK_NOT_FOUND,
        });
      }
      return res.json(serializeTaskStatus(status));
    }

    // Return all tasks and active task info
    const allTasks = downloadTaskManager.getAllTasks();
    const activeTask = downloadTaskManager.getActiveTask();

    res.json({
      activeTask: serializeTaskStatus(activeTask),
      allTasks: allTasks.map(serializeTaskStatus),
      hasActiveTask: downloadTaskManager.hasActiveTask(),
    });
  } catch (error) {
    logger.error('Failed to get download status', { error });
    res.status(500).json({ errorCode: ErrorCode.DOWNLOAD_STATUS_FAILED });
  }
});

/**
 * GET /api/download/logs
 * Get logs for a specific task
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const { taskId, limit } = req.query;

    if (!taskId) {
      return res.status(400).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ID_REQUIRED,
      });
    }

    const logs = downloadTaskManager.getTaskLogs(
      taskId as string,
      limit ? parseInt(limit as string, 10) : undefined
    );

    res.json({
      success: true,
      taskId,
      logs: logs.map(log => ({
        ...log,
        timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
      })),
      count: logs.length,
    });
  } catch (error) {
    logger.error('Failed to get task logs', { error });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_LOGS_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/download/history
 * Get download history from database
 */
router.get('/history', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const { 
      page = 1, 
      limit = 20, 
      type, 
      tag, 
      author,
      startDate,
      endDate,
      sortBy,
      sortOrder
    } = req.query;
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    database = new Database(config.storage!.databasePath!);
    database.migrate(); // Ensure database tables exist

    const result = database.getDownloadHistory({
      page: Number(page),
      limit: Number(limit),
      type: type as string | undefined,
      tag: tag as string | undefined,
      author: author as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      sortBy: (sortBy as 'downloadedAt' | 'title' | 'author' | 'pixivId') || 'downloadedAt',
      sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
    });

    database.close();
    database = null;

    // Convert file paths from host paths to container paths if needed
    const convertedResult = {
      ...result,
      items: result.items.map(item => ({
        ...item,
        filePath: convertFilePathToContainerPath(item.filePath, config),
      })),
    };

    res.json(convertedResult);
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? { message: errorMessage, stack: error.stack } : { message: errorMessage };
    logger.error('Failed to get download history', { error: errorDetails });
    res.status(500).json({ 
      errorCode: ErrorCode.DOWNLOAD_HISTORY_FAILED,
      message: errorMessage 
    });
  }
});

/**
 * POST /api/download/run-all
 * Run all targets (equivalent to npm run download)
 */
router.post('/run-all', async (req: Request, res: Response) => {
  try {
    if (downloadTaskManager.hasActiveTask()) {
      return res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
      });
    }

    const taskId = `task_all_${Date.now()}`;

    // Start task in background
    downloadTaskManager.startTask(taskId).catch((error) => {
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
});

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
 * GET /api/download/incomplete
 * Get incomplete download tasks
 */
router.get('/incomplete', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    database = new Database(config.storage!.databasePath!);
    database.migrate();

    const incompleteTasks = database.getIncompleteTasks(50);
    database.close();
    database = null;

    res.json({
      success: true,
      tasks: incompleteTasks,
    });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    logger.error('Failed to get incomplete tasks', { error });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_GET_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/download/incomplete
 * Delete all incomplete download tasks
 */
router.delete('/incomplete', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    logger.info('Attempting to delete all incomplete tasks');

    // Initialize database connection
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      logger.error('Database path not configured');
      return res.status(500).json({
        error: 'Database not configured',
        message: 'Database path is not set in configuration',
      });
    }

    try {
      database = new Database(config.storage.databasePath);
      database.migrate();
    } catch (dbError) {
      logger.error('Failed to initialize database', { 
        error: dbError instanceof Error ? dbError.message : String(dbError),
        databasePath: config.storage.databasePath,
      });
      return res.status(500).json({
        error: 'Database initialization failed',
        message: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }

    // Perform deletion
    const result = database.deleteAllIncompleteTasks();
    
    // Close database connection immediately after operation
    try {
      database.close();
      database = null;
    } catch (closeError) {
      logger.warn('Error closing database connection', { 
        error: closeError instanceof Error ? closeError.message : String(closeError) 
      });
    }

    // Handle result
    if (!result.success) {
      logger.warn('Failed to delete all incomplete tasks', { 
        reason: result.message 
      });
      return res.status(500).json({
        errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_DELETE_ALL_FAILED,
        message: result.message,
      });
    }

    logger.info('Successfully deleted all incomplete tasks via API', { 
      deletedCount: result.deletedCount 
    });
    
    // Return success even if no tasks were deleted (count = 0)
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_DELETE_ALL_SUCCESS,
    });
  } catch (error) {
    // Ensure database is closed even on error
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        logger.warn('Error closing database connection in error handler', { 
          error: closeError instanceof Error ? closeError.message : String(closeError) 
        });
      }
    }
    
    logger.error('Unexpected error while deleting all incomplete tasks', { 
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_DELETE_ALL_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/download/incomplete/:id
 * Delete an incomplete download task by id
 */
router.delete('/incomplete/:id', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    // Parse and validate task ID
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);
    
    if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
      logger.warn('Invalid task ID provided for deletion', { 
        rawId, 
        parsedId: id 
      });
      return res.status(400).json({
        errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_TASK_ID_INVALID,
        params: { rawId },
      });
    }

    logger.info('Attempting to delete incomplete task', { taskId: id });

    // Initialize database connection
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      logger.error('Database path not configured');
      return res.status(500).json({
        errorCode: ErrorCode.DOWNLOAD_DATABASE_NOT_CONFIGURED,
      });
    }

    try {
      database = new Database(config.storage.databasePath);
      database.migrate();
    } catch (dbError) {
      logger.error('Failed to initialize database', { 
        error: dbError instanceof Error ? dbError.message : String(dbError),
        databasePath: config.storage.databasePath,
      });
      return res.status(500).json({
        errorCode: ErrorCode.DOWNLOAD_DATABASE_INIT_FAILED,
        message: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }

    // Perform deletion
    const result = database.deleteIncompleteTask(id);
    
    // Close database connection immediately after operation
    try {
      database.close();
      database = null;
    } catch (closeError) {
      logger.warn('Error closing database connection', { 
        error: closeError instanceof Error ? closeError.message : String(closeError) 
      });
    }

    // Handle result
    if (!result.success) {
      const statusCode = result.message?.includes('not found') ? 404 : 400;
      logger.warn('Failed to delete incomplete task', { 
        taskId: id, 
        reason: result.message 
      });
      return res.status(statusCode).json({
        errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_DELETE_FAILED,
        message: result.message,
      });
    }

    logger.info('Successfully deleted incomplete task via API', { taskId: id });
    res.json({
      success: true,
      errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_DELETE_SUCCESS,
    });
  } catch (error) {
    // Ensure database is closed even on error
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        logger.warn('Error closing database connection in error handler', { 
          error: closeError instanceof Error ? closeError.message : String(closeError) 
        });
      }
    }
    
    logger.error('Unexpected error while deleting incomplete task', { 
      error,
      taskId: req.params.id,
      parsedTaskId: parseInt(req.params.id, 10),
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_DELETE_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/download/incomplete/test
 * Test endpoint to verify database connection and incomplete tasks query
 */
router.get('/incomplete/test', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      return res.status(500).json({
        errorCode: ErrorCode.DOWNLOAD_DATABASE_NOT_CONFIGURED,
      });
    }

    database = new Database(config.storage.databasePath);
    database.migrate();

    // Test query
    const tasks = database.getIncompleteTasks(10);
    
    database.close();
    database = null;

    res.json({
      success: true,
      errorCode: ErrorCode.DOWNLOAD_DATABASE_TEST_SUCCESS,
      taskCount: tasks.length,
      sampleTasks: tasks.slice(0, 3),
    });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    logger.error('Database test failed', { error });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_DATABASE_TEST_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/download/resume
 * Resume an incomplete download task by tag
 */
router.post('/resume', async (req: Request, res: Response) => {
  try {
    const { tag, type } = req.body;

    if (!tag || !type) {
      return res.status(400).json({
        errorCode: ErrorCode.DOWNLOAD_RESUME_TAG_TYPE_REQUIRED,
      });
    }

    // Check if there's already an active task
    if (downloadTaskManager.hasActiveTask()) {
      return res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
      });
    }

    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    // Find target by tag
    const target = config.targets?.find(
      (t) => (t.tag === tag || t.filterTag === tag) && t.type === type
    );

    if (!target) {
      return res.status(404).json({
        errorCode: ErrorCode.DOWNLOAD_RESUME_TARGET_NOT_FOUND,
        params: { tag, type },
      });
    }

    const targetIndex = config.targets!.indexOf(target);
    const taskId = `task_resume_${tag}_${Date.now()}`;

    // Start task in background with the specific target
    downloadTaskManager.startTask(taskId, targetIndex.toString()).catch((error) => {
      logger.error('Background task error', { error, taskId });
    });

    res.json({
      success: true,
      taskId,
      errorCode: ErrorCode.DOWNLOAD_RESUME_SUCCESS,
      params: { tag, type },
    });
  } catch (error) {
    logger.error('Failed to resume download', { error });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_RESUME_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/download/random
 * Download a random illustration or novel
 */
router.post('/random', async (req: Request, res: Response) => {
  try {
    if (downloadTaskManager.hasActiveTask()) {
      return res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
      });
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
});

export default router;

