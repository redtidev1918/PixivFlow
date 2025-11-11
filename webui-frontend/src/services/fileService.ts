import { api } from './api';

/**
 * File Service
 * Encapsulates all file-related API calls
 */
export const fileService = {
  /**
   * List files in a directory
   */
  async listFiles(params?: {
    path?: string;
    type?: string;
    sort?: string;
    order?: string;
    dateFilter?: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'all';
  }) {
    const response = await api.listFiles(params);
    return response.data.data;
  },

  /**
   * Get recently downloaded files
   */
  async getRecentFiles(params?: {
    limit?: number;
    type?: 'illustration' | 'novel';
    filter?: 'today' | 'yesterday' | 'last7days' | 'last30days';
  }) {
    const response = await api.getRecentFiles(params);
    return response.data.data;
  },

  /**
   * Get file preview (image or text content)
   */
  async getFilePreview(path: string, type?: string): Promise<Blob> {
    const response = await api.getFilePreview(path, type);
    return response.data;
  },

  /**
   * Delete a file
   */
  async deleteFile(id: string, params?: { path?: string; type?: string }): Promise<void> {
    await api.deleteFile(id, params);
  },

  /**
   * Normalize files (rename, reorganize, update database)
   */
  async normalizeFiles(options?: {
    dryRun?: boolean;
    normalizeNames?: boolean;
    reorganize?: boolean;
    updateDatabase?: boolean;
    type?: 'illustration' | 'novel' | 'all';
  }) {
    const response = await api.normalizeFiles(options);
    return response.data.data;
  },
};

