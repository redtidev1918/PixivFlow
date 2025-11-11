import { api } from './api';

/**
 * Statistics Service
 * Encapsulates all statistics-related API calls
 */
export const statsService = {
  /**
   * Get overview statistics
   */
  async getStatsOverview() {
    const response = await api.getStatsOverview();
    return response.data.data;
  },

  /**
   * Get download statistics for a period
   */
  async getDownloadStats(period?: string) {
    const response = await api.getDownloadStats(period);
    return response.data.data;
  },

  /**
   * Get tag statistics
   */
  async getTagStats(limit?: number) {
    const response = await api.getTagStats(limit);
    return response.data.data;
  },

  /**
   * Get author statistics
   */
  async getAuthorStats(limit?: number) {
    const response = await api.getAuthorStats(limit);
    return response.data.data;
  },
};

