import { AxiosResponse } from 'axios';
import { apiClient } from './client';
import { ApiResponse, StatsOverview } from './types';

/**
 * Statistics API service
 */
export const statsApi = {
  /**
   * Get overview statistics
   */
  getStatsOverview: (): Promise<AxiosResponse<ApiResponse<StatsOverview>>> =>
    apiClient.get('/stats/overview'),

  /**
   * Get download statistics for a period
   * @param period - Time period (e.g., 'day', 'week', 'month')
   */
  getDownloadStats: (period?: string): Promise<AxiosResponse<ApiResponse<Record<string, unknown>>>> =>
    apiClient.get('/stats/downloads', { params: { period } }),

  /**
   * Get tag statistics
   * @param limit - Maximum number of tags to return
   */
  getTagStats: (limit?: number): Promise<AxiosResponse<ApiResponse<Record<string, unknown>>>> =>
    apiClient.get('/stats/tags', { params: { limit } }),

  /**
   * Get author statistics
   * @param limit - Maximum number of authors to return
   */
  getAuthorStats: (limit?: number): Promise<AxiosResponse<ApiResponse<Record<string, unknown>>>> =>
    apiClient.get('/stats/authors', { params: { limit } }),
};

