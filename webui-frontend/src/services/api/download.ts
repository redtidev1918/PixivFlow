import { AxiosResponse } from 'axios';
import { apiClient } from './client';
import {
  ApiResponse,
  ConfigData,
  DownloadStatus,
  DownloadHistoryResponse,
  IncompleteTask,
  TaskLogsResponse,
} from './types';

/**
 * Download API service
 */
export const downloadApi = {
  /**
   * Start a download task
   * @param targetId - Optional target ID to download (downloads all if not provided)
   * @param config - Optional configuration override
   * @param configPaths - Optional array of config file paths to use
   */
  startDownload: (
    targetId?: string,
    config?: Partial<ConfigData>,
    configPaths?: string[]
  ): Promise<AxiosResponse<ApiResponse<{ taskId: string }>>> =>
    apiClient.post('/download/start', { targetId, config, configPaths }),

  /**
   * Stop a running download task
   * @param taskId - ID of the task to stop
   */
  stopDownload: (taskId: string): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.post('/download/stop', { taskId }),

  /**
   * Get download status
   * @param taskId - Optional task ID (gets all tasks if not provided)
   */
  getDownloadStatus: (taskId?: string): Promise<AxiosResponse<ApiResponse<DownloadStatus>>> =>
    apiClient.get('/download/status', { params: { taskId } }),

  /**
   * Get logs for a specific task
   * @param taskId - Task ID
   * @param limit - Maximum number of log entries to return
   */
  getTaskLogs: (
    taskId: string,
    limit?: number
  ): Promise<AxiosResponse<ApiResponse<TaskLogsResponse>>> =>
    apiClient.get('/download/logs', { params: { taskId, limit } }),

  /**
   * Get download history with filtering and pagination
   */
  getDownloadHistory: (params?: {
    page?: number;
    limit?: number;
    type?: string;
    tag?: string;
    author?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: 'downloadedAt' | 'title' | 'author' | 'pixivId';
    sortOrder?: 'asc' | 'desc';
  }): Promise<AxiosResponse<ApiResponse<DownloadHistoryResponse>>> =>
    apiClient.get('/download/history', { params }),

  /**
   * Run all configured download targets
   * @param configPaths - Optional array of config file paths to use
   */
  runAllDownloads: (configPaths?: string[]): Promise<AxiosResponse<ApiResponse<{ taskId: string }>>> =>
    apiClient.post('/download/run-all', { configPaths }),

  /**
   * Download random works
   * @param type - Type of works to download
   */
  randomDownload: (type?: 'illustration' | 'novel'): Promise<AxiosResponse<ApiResponse<{ taskId: string }>>> =>
    apiClient.post('/download/random', { type }),

  /**
   * Get list of incomplete download tasks
   */
  getIncompleteTasks: (): Promise<AxiosResponse<ApiResponse<{ tasks: IncompleteTask[] }>>> =>
    apiClient.get('/download/incomplete'),

  /**
   * Resume an incomplete download
   * @param tag - Tag to resume
   * @param type - Type of content
   */
  resumeDownload: (
    tag: string,
    type: 'illustration' | 'novel'
  ): Promise<AxiosResponse<ApiResponse<{ taskId: string }>>> =>
    apiClient.post('/download/resume', { tag, type }),

  /**
   * Delete a single incomplete task
   * @param id - Task ID
   */
  deleteIncompleteTask: (id: number): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.delete(`/download/incomplete/${id}`),

  /**
   * Delete all incomplete tasks
   */
  deleteAllIncompleteTasks: (): Promise<AxiosResponse<ApiResponse<{ deletedCount: number }>>> =>
    apiClient.delete('/download/incomplete'),
};

