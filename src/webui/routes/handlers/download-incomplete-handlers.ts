import { Request, Response } from 'express';
import { logger } from '../../../logger';
import { downloadTaskManager } from '../../services/DownloadTaskManager';
import { Database } from '../../../storage/Database';
import { loadConfig, getConfigPath } from '../../../config';
import { ErrorCode } from '../../utils/error-codes';

/**
 * GET /api/download/incomplete
 * Get incomplete download tasks
 */
export async function getIncompleteTasks(req: Request, res: Response): Promise<void> {
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
}

/**
 * DELETE /api/download/incomplete
 * Delete all incomplete download tasks
 */
export async function deleteAllIncompleteTasks(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    logger.info('Attempting to delete all incomplete tasks');

    // Initialize database connection
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      logger.error('Database path not configured');
      res.status(500).json({
        error: 'Database not configured',
        message: 'Database path is not set in configuration',
      });
      return;
    }

    try {
      database = new Database(config.storage.databasePath);
      database.migrate();
    } catch (dbError) {
      logger.error('Failed to initialize database', { 
        error: dbError instanceof Error ? dbError.message : String(dbError),
        databasePath: config.storage.databasePath,
      });
      res.status(500).json({
        error: 'Database initialization failed',
        message: dbError instanceof Error ? dbError.message : String(dbError),
      });
      return;
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
      res.status(500).json({
        errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_DELETE_ALL_FAILED,
        message: result.message,
      });
      return;
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
}

/**
 * DELETE /api/download/incomplete/:id
 * Delete an incomplete download task by id
 */
export async function deleteIncompleteTask(req: Request, res: Response): Promise<void> {
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
      res.status(400).json({
        errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_TASK_ID_INVALID,
        params: { rawId },
      });
      return;
    }

    logger.info('Attempting to delete incomplete task', { taskId: id });

    // Initialize database connection
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      logger.error('Database path not configured');
      res.status(500).json({
        errorCode: ErrorCode.DOWNLOAD_DATABASE_NOT_CONFIGURED,
      });
      return;
    }

    try {
      database = new Database(config.storage.databasePath);
      database.migrate();
    } catch (dbError) {
      logger.error('Failed to initialize database', { 
        error: dbError instanceof Error ? dbError.message : String(dbError),
        databasePath: config.storage.databasePath,
      });
      res.status(500).json({
        errorCode: ErrorCode.DOWNLOAD_DATABASE_INIT_FAILED,
        message: dbError instanceof Error ? dbError.message : String(dbError),
      });
      return;
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
      res.status(statusCode).json({
        errorCode: ErrorCode.DOWNLOAD_INCOMPLETE_DELETE_FAILED,
        message: result.message,
      });
      return;
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
}

/**
 * GET /api/download/incomplete/test
 * Test endpoint to verify database connection and incomplete tasks query
 */
export async function testIncompleteTasks(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    if (!config.storage?.databasePath) {
      res.status(500).json({
        errorCode: ErrorCode.DOWNLOAD_DATABASE_NOT_CONFIGURED,
      });
      return;
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
}

/**
 * POST /api/download/resume
 * Resume an incomplete download task by tag
 */
export async function resumeDownload(req: Request, res: Response): Promise<void> {
  try {
    const { tag, type } = req.body;

    if (!tag || !type) {
      res.status(400).json({
        errorCode: ErrorCode.DOWNLOAD_RESUME_TAG_TYPE_REQUIRED,
      });
      return;
    }

    // Check if there's already an active task
    if (downloadTaskManager.hasActiveTask()) {
      res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
      });
      return;
    }

    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    // Find target by tag
    const target = config.targets?.find(
      (t) => (t.tag === tag || t.filterTag === tag) && t.type === type
    );

    if (!target) {
      res.status(404).json({
        errorCode: ErrorCode.DOWNLOAD_RESUME_TARGET_NOT_FOUND,
        params: { tag, type },
      });
      return;
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
}













