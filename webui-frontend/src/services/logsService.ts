import { api } from './api';

/**
 * Logs Service
 * Encapsulates all logs-related API calls
 */
export const logsService = {
  /**
   * Get application logs with filtering
   */
  async getLogs(params?: {
    page?: number;
    limit?: number;
    level?: string;
    search?: string;
  }) {
    const response = await api.getLogs(params);
    return response.data.data;
  },

  /**
   * Clear all logs
   */
  async clearLogs(): Promise<void> {
    await api.clearLogs();
  },
};

