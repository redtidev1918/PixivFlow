import axios, { AxiosResponse } from 'axios';

/**
 * API Base URL Configuration
 * Supports environment variable configuration for mobile/remote access
 * Example: VITE_API_BASE_URL=http://192.168.1.100:3000
 */
const getApiBaseURL = (): string => {
  // Priority 1: Environment variable
  if (import.meta.env.VITE_API_BASE_URL) {
    return `${import.meta.env.VITE_API_BASE_URL}/api`;
  }
  // Priority 2: Relative path (same origin)
  return '/api';
};

/**
 * Axios client instance with default configuration
 */
const apiClient = axios.create({
  baseURL: getApiBaseURL(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth tokens if needed
apiClient.interceptors.request.use(
  (config) => {
    // Add any auth tokens here if needed in the future
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling common errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle common HTTP errors
    if (error.response) {
      // Server responded with error status
      console.error('API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      // Request was made but no response received
      console.error('Network Error:', error.message);
    } else {
      // Something else happened
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  error?: string;
}

/**
 * Statistics overview data
 */
export interface StatsOverview {
  totalDownloads: number;
  illustrations: number;
  novels: number;
  recentDownloads: number;
}

/**
 * Download task status
 */
export interface DownloadTask {
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  startTime: string;
  endTime?: string;
  error?: string;
  progress?: {
    current: number;
    total: number;
    message?: string;
  };
}

/**
 * Download status response
 */
export interface DownloadStatus {
  hasActiveTask: boolean;
  activeTask?: DownloadTask;
  allTasks: DownloadTask[];
}

/**
 * Incomplete task data
 */
export interface IncompleteTask {
  id: number;
  tag: string;
  type: 'illustration' | 'novel';
  status: 'failed' | 'partial';
  message: string | null;
  executedAt: string;
}

/**
 * Download history item
 */
export interface DownloadHistoryItem {
  id: number;
  pixivId: string;
  type: 'illustration' | 'novel';
  title: string;
  tag: string;
  author?: string;
  filePath: string;
  downloadedAt: string;
}

/**
 * Download history response
 */
export interface DownloadHistoryResponse {
  items: DownloadHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * File item data
 */
export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  downloadedAt?: string | null;
  extension?: string;
}

/**
 * Files list response
 */
export interface FilesResponse {
  files: FileItem[];
  directories: FileItem[];
  currentPath: string;
}

/**
 * Log entry data
 */
export interface LogEntry {
  line: string;
  level?: string;
  timestamp?: string;
}

/**
 * Logs response
 */
export interface LogsResponse {
  logs: string[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Config data structure
 */
export interface ConfigData {
  logLevel?: string;
  initialDelay?: number;
  pixiv?: {
    clientId?: string;
    refreshToken?: string;
    userAgent?: string;
  };
  network?: {
    timeoutMs?: number;
    retries?: number;
    retryDelay?: number;
    proxy?: {
      enabled?: boolean;
      host?: string;
      port?: number;
      protocol?: string;
      username?: string;
      password?: string;
    };
  };
  storage?: {
    databasePath?: string;
    downloadDirectory?: string;
    illustrationDirectory?: string;
    novelDirectory?: string;
    illustrationOrganization?: string;
    novelOrganization?: string;
  };
  scheduler?: {
    enabled?: boolean;
    cron?: string;
    timezone?: string;
    maxExecutions?: number;
    minInterval?: number;
    timeout?: number;
  };
  download?: {
    concurrency?: number;
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
  };
  targets?: Array<{
    type: 'illustration' | 'novel';
    tag?: string;
    limit?: number;
    searchTarget?: string;
    sort?: string;
    mode?: string;
    rankingMode?: string;
    rankingDate?: string;
    filterTag?: string;
    minBookmarks?: number;
    startDate?: string;
    endDate?: string;
    seriesId?: number;
    novelId?: number;
    [key: string]: any;
  }>;
  _meta?: {
    configPath?: string;
    configPathRelative?: string;
  };
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * API service object with all available endpoints
 */
export const api = {
  // ========== Authentication ==========
  
  /**
   * Get current authentication status
   */
  getAuthStatus: (): Promise<AxiosResponse<ApiResponse<{ isAuthenticated: boolean; user?: any }>>> =>
    apiClient.get('/auth/status'),

  /**
   * Diagnose login issues and check configuration
   */
  diagnoseLogin: (): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/auth/diagnose'),

  /**
   * Login to Pixiv
   * @param username - Pixiv username or email
   * @param password - Pixiv password
   * @param headless - Use headless mode (gppt) or interactive mode (Puppeteer)
   * @param proxy - Optional proxy configuration
   */
  login: (
    username: string,
    password: string,
    headless: boolean = true,
    proxy?: any
  ): Promise<AxiosResponse<ApiResponse<{ refreshToken: string }>>> => {
    // For interactive mode, use a longer timeout (10 minutes) since user needs time to complete login
    const timeout = headless ? 30000 : 600000; // 30s for headless, 10min for interactive
    return apiClient.post('/auth/login', { username, password, headless, proxy }, { timeout });
  },

  /**
   * Login with refresh token directly
   * @param refreshToken - Refresh token to validate and save
   */
  loginWithToken: (
    refreshToken: string
  ): Promise<AxiosResponse<ApiResponse<{ refreshToken: string; accessToken: string; expiresIn: number; user?: any }>>> =>
    apiClient.post('/auth/login-with-token', { refreshToken }),

  /**
   * Refresh authentication token
   * @param refreshToken - Optional refresh token (uses config if not provided)
   */
  refreshToken: (refreshToken?: string): Promise<AxiosResponse<ApiResponse<{ refreshToken: string }>>> =>
    apiClient.post('/auth/refresh', { refreshToken }),

  /**
   * Logout and clear authentication
   */
  logout: (): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.post('/auth/logout'),

  // ========== Configuration ==========

  /**
   * Get current configuration
   */
  getConfig: (): Promise<AxiosResponse<ApiResponse<ConfigData>>> =>
    apiClient.get('/config'),

  /**
   * Update configuration
   * @param config - Configuration object to update
   */
  updateConfig: (config: Partial<ConfigData>): Promise<AxiosResponse<ApiResponse<ConfigData>>> =>
    apiClient.put('/config', config),

  /**
   * Validate configuration without saving
   * @param config - Configuration object to validate
   */
  validateConfig: (config: Partial<ConfigData>): Promise<AxiosResponse<ApiResponse<{ valid: boolean; errors?: string[] }>>> =>
    apiClient.post('/config/validate', config),

  /**
   * Backup current configuration
   */
  backupConfig: (): Promise<AxiosResponse<ApiResponse<{ backupPath: string }>>> =>
    apiClient.get('/config/backup'),

  /**
   * Restore configuration from backup
   * @param backupPath - Path to backup file
   */
  restoreConfig: (backupPath: string): Promise<AxiosResponse<ApiResponse<ConfigData>>> =>
    apiClient.post('/config/restore', { backupPath }),

  // ========== Download Management ==========

  /**
   * Start a download task
   * @param targetId - Optional target ID to download (downloads all if not provided)
   * @param config - Optional configuration override
   */
  startDownload: (
    targetId?: string,
    config?: Partial<ConfigData>
  ): Promise<AxiosResponse<ApiResponse<{ taskId: string }>>> =>
    apiClient.post('/download/start', { targetId, config }),

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
  ): Promise<AxiosResponse<ApiResponse<{ logs: Array<{ timestamp: string; level: string; message: string }> }>>> =>
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
   */
  runAllDownloads: (): Promise<AxiosResponse<ApiResponse<{ taskId: string }>>> =>
    apiClient.post('/download/run-all'),

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

  // ========== Statistics ==========

  /**
   * Get overview statistics
   */
  getStatsOverview: (): Promise<AxiosResponse<ApiResponse<StatsOverview>>> =>
    apiClient.get('/stats/overview'),

  /**
   * Get download statistics for a period
   * @param period - Time period (e.g., 'day', 'week', 'month')
   */
  getDownloadStats: (period?: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/stats/downloads', { params: { period } }),

  /**
   * Get tag statistics
   * @param limit - Maximum number of tags to return
   */
  getTagStats: (limit?: number): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/stats/tags', { params: { limit } }),

  /**
   * Get author statistics
   * @param limit - Maximum number of authors to return
   */
  getAuthorStats: (limit?: number): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/stats/authors', { params: { limit } }),

  // ========== Logs ==========

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

  // ========== File Management ==========

  /**
   * List files in a directory
   */
  listFiles: (params?: {
    path?: string;
    type?: string;
    sort?: string;
    order?: string;
    dateFilter?: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'all';
  }): Promise<AxiosResponse<ApiResponse<FilesResponse>>> =>
    apiClient.get('/files/list', { params }),

  /**
   * Get recently downloaded files
   */
  getRecentFiles: (params?: {
    limit?: number;
    type?: 'illustration' | 'novel';
    filter?: 'today' | 'yesterday' | 'last7days' | 'last30days';
  }): Promise<AxiosResponse<ApiResponse<{ files: FileItem[] }>>> =>
    apiClient.get('/files/recent', { params }),

  /**
   * Get file preview (image or text content)
   * @param path - File path
   * @param type - File type
   */
  getFilePreview: (path: string, type?: string): Promise<AxiosResponse<Blob>> =>
    apiClient.get('/files/preview', { params: { path, type }, responseType: 'blob' }),

  /**
   * Delete a file
   * @param id - File ID or name
   * @param params - Additional parameters (path, type)
   */
  deleteFile: (
    id: string,
    params?: { path?: string; type?: string }
  ): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.delete(`/files/${id}`, { params }),

  /**
   * Normalize files (rename, reorganize, update database)
   * @param options - Normalization options
   */
  normalizeFiles: (options?: {
    dryRun?: boolean;
    normalizeNames?: boolean;
    reorganize?: boolean;
    updateDatabase?: boolean;
    type?: 'illustration' | 'novel' | 'all';
  }): Promise<AxiosResponse<ApiResponse<{
    result: {
      totalFiles: number;
      processedFiles: number;
      movedFiles: number;
      renamedFiles: number;
      updatedDatabase: number;
      skippedFiles: number;
      errors: Array<{ file: string; error: string }>;
    };
  }>>> =>
    apiClient.post('/files/normalize', options),
};

