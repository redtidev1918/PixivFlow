import { AxiosResponse } from 'axios';
import { apiClient } from './client';
import { ApiResponse, LogsResponse } from './types';

/**
 * Logs API service
 */
export const logsApi = {
  /**
   * Get application logs with filtering
   */
  getLogs: (params?: {
    page?: number;
    limit?: number;
    level?: string;
    search?: string;
  }): Promise<AxiosResponse<ApiResponse<LogsResponse>>> =>
    apiClient.get('/logs', { params }),

  /**
   * Clear all logs
   */
  clearLogs: (): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.delete('/logs'),
};

