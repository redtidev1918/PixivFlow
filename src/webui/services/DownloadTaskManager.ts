import { DownloadManager } from '../../download/DownloadManager';
import { PixivClient } from '../../pixiv/PixivClient';
import { PixivAuth } from '../../pixiv/AuthClient';
import { Database } from '../../storage/Database';
import { FileService } from '../../download/FileService';
import { StandaloneConfig, loadConfig, getConfigPath } from '../../config';
import { logger } from '../../logger';

export interface TaskLogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface TaskStatus {
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  progress?: {
    current: number;
    total: number;
    message?: string;
  };
  startTime: Date;
  endTime?: Date;
  error?: string;
  targetId?: string;
  logs?: TaskLogEntry[];
}

export class DownloadTaskManager {
  private tasks = new Map<string, TaskStatus>();
  private taskLogs = new Map<string, TaskLogEntry[]>();
  private activeTask: {
    taskId: string;
    manager: DownloadManager;
    database: Database;
    promise: Promise<void>;
    abortController: AbortController;
  } | null = null;

  /**
   * Start a download task
   * @param taskId - Unique task identifier
   * @param targetId - Optional target ID to download (downloads all if not provided)
   * @param customConfig - Optional configuration override
   * @param configPaths - Optional array of config file paths to use (merges targets from all configs)
   */
  async startTask(
    taskId: string,
    targetId?: string,
    customConfig?: Partial<StandaloneConfig>,
    configPaths?: string[]
  ): Promise<void> {
    // Check if there's already an active task
    if (this.activeTask) {
      throw new Error('Another download task is already running');
    }

    let config: StandaloneConfig;
    
    // If multiple config paths are provided, merge their targets
    if (configPaths && configPaths.length > 0) {
      // Load the first config as base
      const baseConfig = loadConfig(configPaths[0]);
      const allTargets: any[] = [...(baseConfig.targets || [])];
      
      // Merge targets from other configs
      for (let i = 1; i < configPaths.length; i++) {
        const otherConfig = loadConfig(configPaths[i]);
        if (otherConfig.targets && otherConfig.targets.length > 0) {
          allTargets.push(...otherConfig.targets);
        }
      }
      
      // Use base config but with merged targets
      config = {
        ...baseConfig,
        targets: allTargets,
      };
      
      this.addLog(taskId, 'info', `使用 ${configPaths.length} 个配置文件，共 ${allTargets.length} 个下载目标`);
    } else {
      // Use single config (default behavior)
      const configPath = getConfigPath();
      config = loadConfig(configPath);
    }

    // Merge custom config if provided
    if (customConfig) {
      config = { ...config, ...customConfig };
    }

    // If targetId is provided, filter targets
    if (targetId && config.targets) {
      const target = config.targets.find((t, idx) => 
        idx.toString() === targetId || t.tag === targetId
      );
      if (target) {
        config = { ...config, targets: [target] };
      }
    }

    const database = new Database(config.storage!.databasePath!);
    database.migrate();

    // Use the first config path for auth (or default if none specified)
    const authConfigPath = configPaths && configPaths.length > 0 ? configPaths[0] : getConfigPath();
    const auth = new PixivAuth(config.pixiv, config.network!, database, authConfigPath);
    const pixivClient = new PixivClient(auth, config);
    const fileService = new FileService(config.storage!);
    const downloadManager = new DownloadManager(config, pixivClient, database, fileService);

    // Set progress callback
    const progressCallback = this.getProgressCallback(taskId);
    downloadManager.setProgressCallback(progressCallback);

    await downloadManager.initialise();

    const abortController = new AbortController();
    const taskStatus: TaskStatus = {
      taskId,
      status: 'running',
      startTime: new Date(),
      targetId,
      logs: [],
    };
    this.tasks.set(taskId, taskStatus);
    this.taskLogs.set(taskId, []);
    
    // Add initial log entry
    this.addLog(taskId, 'info', `下载任务 ${taskId} 已启动`);

    const promise = (async () => {
      try {
        this.addLog(taskId, 'info', '开始执行下载任务...');
        logger.info(`Starting download task ${taskId}`);
        await downloadManager.runAllTargets();
        
        taskStatus.status = 'completed';
        taskStatus.endTime = new Date();
        this.addLog(taskId, 'info', '下载任务完成');
        logger.info(`Download task ${taskId} completed`);
      } catch (error) {
        taskStatus.status = 'failed';
        const errorMessage = error instanceof Error ? error.message : String(error);
        taskStatus.error = errorMessage;
        taskStatus.endTime = new Date();
        this.addLog(taskId, 'error', `下载任务失败: ${errorMessage}`);
        if (error instanceof Error && error.stack) {
          this.addLog(taskId, 'error', `错误堆栈: ${error.stack}`);
        }
        logger.error(`Download task ${taskId} failed`, { error });
        throw error;
      } finally {
        database.close();
        this.activeTask = null;
      }
    })();

    this.activeTask = {
      taskId,
      manager: downloadManager,
      database,
      promise,
      abortController,
    };

    // Don't await - let it run in background
    promise.catch(() => {
      // Error already handled in promise
    });
  }

  /**
   * Stop the active download task
   */
  async stopTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'running') {
      throw new Error(`Task ${taskId} is not running`);
    }

    if (this.activeTask && this.activeTask.taskId === taskId) {
      // Signal abort
      this.activeTask.abortController.abort();
      
      // Close database
      this.activeTask.database.close();
      
      task.status = 'stopped';
      task.endTime = new Date();
      this.addLog(taskId, 'warn', '下载任务已停止');
      this.activeTask = null;
      
      logger.info(`Download task ${taskId} stopped`);
    }
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): TaskStatus | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Get all tasks
   */
  getAllTasks(): TaskStatus[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => b.startTime.getTime() - a.startTime.getTime()
    );
  }

  /**
   * Get active task
   */
  getActiveTask(): TaskStatus | null {
    if (!this.activeTask) {
      return null;
    }
    return this.tasks.get(this.activeTask.taskId) || null;
  }

  /**
   * Check if there's an active task
   */
  hasActiveTask(): boolean {
    return this.activeTask !== null;
  }

  /**
   * Update progress for a task
   */
  updateProgress(taskId: string, progress: { current: number; total: number; message?: string }): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.progress = progress;
    }
  }

  /**
   * Get progress callback for a task
   */
  getProgressCallback(taskId: string): (current: number, total: number, message?: string) => void {
    return (current: number, total: number, message?: string) => {
      this.updateProgress(taskId, { current, total, message });
      
      // Log progress to console for real-time visibility
      const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
      const logMessage = message 
        ? `进度: ${current}/${total} (${percentage}%) - ${message}`
        : `进度: ${current}/${total} (${percentage}%)`;
      
      this.addLog(taskId, 'info', logMessage);
      
      if (message) {
        logger.info(`[${taskId}] Progress: ${current}/${total} (${percentage}%) - ${message}`);
      } else {
        logger.info(`[${taskId}] Progress: ${current}/${total} (${percentage}%)`);
      }
    };
  }

  /**
   * Add a log entry for a task
   */
  addLog(taskId: string, level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
    const logs = this.taskLogs.get(taskId) || [];
    const entry: TaskLogEntry = {
      timestamp: new Date(),
      level,
      message,
    };
    logs.push(entry);
    
    // Keep only last 1000 log entries per task
    if (logs.length > 1000) {
      logs.shift();
    }
    
    this.taskLogs.set(taskId, logs);
    
    // Also update the task status logs
    const task = this.tasks.get(taskId);
    if (task) {
      task.logs = [...logs];
    }
    
    // Also output to backend logger system (console and log file)
    const logMessage = `[Task ${taskId}] ${message}`;
    switch (level) {
      case 'debug':
        logger.debug(logMessage, { taskId });
        break;
      case 'info':
        logger.info(logMessage, { taskId });
        break;
      case 'warn':
        logger.warn(logMessage, { taskId });
        break;
      case 'error':
        logger.error(logMessage, { taskId });
        break;
    }
  }

  /**
   * Get logs for a task
   */
  getTaskLogs(taskId: string, limit?: number): TaskLogEntry[] {
    const logs = this.taskLogs.get(taskId) || [];
    if (limit) {
      return logs.slice(-limit);
    }
    return logs;
  }

  /**
   * Clear logs for a task
   */
  clearTaskLogs(taskId: string): void {
    this.taskLogs.delete(taskId);
    const task = this.tasks.get(taskId);
    if (task) {
      task.logs = [];
    }
  }
}

// Singleton instance
export const downloadTaskManager = new DownloadTaskManager();

