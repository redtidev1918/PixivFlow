import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// API types
export interface StatsOverview {
  totalDownloads: number;
  illustrations: number;
  novels: number;
  recentDownloads: number;
}

export const api = {
  // Auth
  getAuthStatus: () => apiClient.get('/auth/status'),
  login: (username: string, password: string) =>
    apiClient.post('/auth/login', { username, password, headless: true }),
  refreshToken: (refreshToken?: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),
  logout: () => apiClient.post('/auth/logout'),

  // Config
  getConfig: () => apiClient.get('/config'),
  updateConfig: (config: any) => apiClient.put('/config', config),
  validateConfig: (config: any) => apiClient.post('/config/validate', config),
  backupConfig: () => apiClient.get('/config/backup'),
  restoreConfig: (backupPath: string) =>
    apiClient.post('/config/restore', { backupPath }),

  // Download
  startDownload: (targetId?: string, config?: any) =>
    apiClient.post('/download/start', { targetId, config }),
  stopDownload: (taskId: string) =>
    apiClient.post('/download/stop', { taskId }),
  getDownloadStatus: (taskId?: string) =>
    apiClient.get('/download/status', { params: { taskId } }),
  getTaskLogs: (taskId: string, limit?: number) =>
    apiClient.get('/download/logs', { params: { taskId, limit } }),
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
  }) => apiClient.get('/download/history', { params }),
  runAllDownloads: () => apiClient.post('/download/run-all'),
  randomDownload: (type?: 'illustration' | 'novel') =>
    apiClient.post('/download/random', { type }),
  getIncompleteTasks: () => apiClient.get('/download/incomplete'),
  resumeDownload: (tag: string, type: 'illustration' | 'novel') =>
    apiClient.post('/download/resume', { tag, type }),
  deleteIncompleteTask: (id: number) =>
    apiClient.delete(`/download/incomplete/${id}`),
  deleteAllIncompleteTasks: () =>
    apiClient.delete('/download/incomplete'),

  // Stats
  getStatsOverview: (): Promise<{ data: StatsOverview }> =>
    apiClient.get('/stats/overview'),
  getDownloadStats: (period?: string) =>
    apiClient.get('/stats/downloads', { params: { period } }),
  getTagStats: (limit?: number) =>
    apiClient.get('/stats/tags', { params: { limit } }),
  getAuthorStats: (limit?: number) =>
    apiClient.get('/stats/authors', { params: { limit } }),

  // Logs
  getLogs: (params?: {
    page?: number;
    limit?: number;
    level?: string;
    search?: string;
  }) => apiClient.get('/logs', { params }),
  clearLogs: () => apiClient.delete('/logs'),

  // Files
  listFiles: (params?: { 
    path?: string; 
    type?: string; 
    sort?: string; 
    order?: string;
    dateFilter?: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'all';
  }) =>
    apiClient.get('/files/list', { params }),
  getRecentFiles: (params?: {
    limit?: number;
    type?: 'illustration' | 'novel';
    filter?: 'today' | 'yesterday' | 'last7days' | 'last30days';
  }) =>
    apiClient.get('/files/recent', { params }),
  getFilePreview: (path: string, type?: string) =>
    apiClient.get('/files/preview', { params: { path, type }, responseType: 'blob' }),
  deleteFile: (id: string, params?: { path?: string; type?: string }) =>
    apiClient.delete(`/files/${id}`, { params }),
  normalizeFiles: (options?: {
    dryRun?: boolean;
    normalizeNames?: boolean;
    reorganize?: boolean;
    updateDatabase?: boolean;
    type?: 'illustration' | 'novel' | 'all';
  }) => apiClient.post('/files/normalize', options),
};

