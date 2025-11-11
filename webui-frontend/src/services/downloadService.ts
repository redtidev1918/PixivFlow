import { api, ConfigData } from './api';

/**
 * Download Service
 * Encapsulates all download-related API calls
 */
export const downloadService = {
  /**
   * Start a download task
   */
  async startDownload(targetId?: string, config?: Partial<ConfigData>, configPaths?: string[]) {
    const response = await api.startDownload(targetId, config, configPaths);
    return response.data.data;
  },

  /**
   * Stop a running download task
   */
  async stopDownload(taskId: string): Promise<void> {
    await api.stopDownload(taskId);
  },

  /**
   * Get download status
   */
  async getDownloadStatus(taskId?: string) {
    const response = await api.getDownloadStatus(taskId);
    return response.data.data;
  },

  /**
   * Get logs for a specific task
   */
  async getTaskLogs(taskId: string, limit?: number) {
    const response = await api.getTaskLogs(taskId, limit);
    return response.data.data;
  },

  /**
   * Get download history
   */
  async getDownloadHistory(params?: {
    page?: number;
    limit?: number;
    type?: string;
    tag?: string;
    author?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: 'downloadedAt' | 'title' | 'author' | 'pixivId';
    sortOrder?: 'asc' | 'desc';
  }) {
    const response = await api.getDownloadHistory(params);
    return response.data.data;
  },

  /**
   * Run all configured download targets
   */
  async runAllDownloads(configPaths?: string[]) {
    const response = await api.runAllDownloads(configPaths);
    return response.data.data;
  },

  /**
   * Download random works
   */
  async randomDownload(type?: 'illustration' | 'novel') {
    const response = await api.randomDownload(type);
    return response.data.data;
  },

  /**
   * Get list of incomplete download tasks
   */
  async getIncompleteTasks() {
    const response = await api.getIncompleteTasks();
    return response.data.data;
  },

  /**
   * Resume an incomplete download
   */
  async resumeDownload(tag: string, type: 'illustration' | 'novel') {
    const response = await api.resumeDownload(tag, type);
    return response.data.data;
  },

  /**
   * Delete a single incomplete task
   */
  async deleteIncompleteTask(id: number): Promise<void> {
    await api.deleteIncompleteTask(id);
  },

  /**
   * Delete all incomplete tasks
   */
  async deleteAllIncompleteTasks() {
    const response = await api.deleteAllIncompleteTasks();
    return response.data.data;
  },
};

