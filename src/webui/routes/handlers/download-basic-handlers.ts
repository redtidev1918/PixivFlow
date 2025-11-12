import { Request, Response } from 'express';
import { logger } from '../../../logger';
import { downloadTaskManager } from '../../services/DownloadTaskManager';
import { Database } from '../../../storage/Database';
import { loadConfig, getConfigPath } from '../../../config';
import { join } from 'path';
import { ErrorCode } from '../../utils/error-codes';

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
 * POST /api/download/start
 * Start a download task
 * Body: { targetId?: string, config?: Partial<StandaloneConfig>, configPaths?: string[] }
 */
export async function startDownload(req: Request, res: Response): Promise<void> {
  try {
    const { targetId, config, configPaths } = req.body;

    // Check if there's already an active task
    if (downloadTaskManager.hasActiveTask()) {
      res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
      });
      return;
    }

    const taskId = `task_${Date.now()}`;

    // Start task in background with optional config paths
    downloadTaskManager.startTask(taskId, targetId, config, configPaths).catch((error) => {
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
}

/**
 * POST /api/download/stop
 * Stop a download task
 */
export async function stopDownload(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.body;

    if (!taskId) {
      res.status(400).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ID_REQUIRED,
      });
      return;
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
}

/**
 * GET /api/download/status
 * Get download task status
 */
export async function getDownloadStatus(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.query;

    if (taskId) {
      const status = downloadTaskManager.getTaskStatus(taskId as string);
      if (!status) {
        res.status(404).json({
          errorCode: ErrorCode.DOWNLOAD_TASK_NOT_FOUND,
        });
        return;
      }
      res.json(serializeTaskStatus(status));
      return;
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
}

/**
 * GET /api/download/logs
 * Get logs for a specific task
 */
export async function getDownloadLogs(req: Request, res: Response): Promise<void> {
  try {
    const { taskId, limit } = req.query;

    if (!taskId) {
      res.status(400).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ID_REQUIRED,
      });
      return;
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
}

/**
 * GET /api/download/history
 * Get download history from database
 */
export async function getDownloadHistory(req: Request, res: Response): Promise<void> {
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

    res.json({
      data: convertedResult,
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
    const errorDetails = error instanceof Error ? { message: errorMessage, stack: error.stack } : { message: errorMessage };
    logger.error('Failed to get download history', { error: errorDetails });
    res.status(500).json({ 
      errorCode: ErrorCode.DOWNLOAD_HISTORY_FAILED,
      message: errorMessage 
    });
  }
}





























