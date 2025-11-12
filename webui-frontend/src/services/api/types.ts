import { AxiosResponse } from 'axios';

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T = unknown> {
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
    [key: string]: unknown;
  }>;
  _meta?: {
    configPath?: string;
    configPathRelative?: string;
  };
  _validation?: Record<string, unknown>;
}

/**
 * Config history entry
 */
export interface ConfigHistoryEntry {
  id: number;
  name: string;
  description: string | null;
  config: ConfigData;
  created_at: string;
  updated_at: string;
  is_active: number;
}

/**
 * Config file info
 */
export interface ConfigFileInfo {
  filename: string;
  path: string;
  pathRelative: string;
  modifiedTime: string;
  size: number;
  isActive: boolean;
}

/**
 * Config file content
 */
export interface ConfigFileContent {
  filename: string;
  path: string;
  pathRelative: string;
  content: string;
}

/**
 * Config diagnose result
 */
export interface ConfigDiagnoseResult {
  stats: {
    totalFields: number;
    totalSections: number;
    totalTargets: number;
    maxDepth: number;
    fieldTypes: Record<string, number>;
  };
  errors: string[];
  warnings: string[];
  fields: Array<{
    path: string;
    name: string;
    type: string;
    required: boolean;
    description?: string;
    defaultValue?: unknown;
    enumValues?: unknown[];
    depth: number;
    isLeaf: boolean;
  }>;
  sections: Record<string, unknown[]>;
}

/**
 * Config repair result
 */
export interface ConfigRepairResult {
  fixed: boolean;
  errors: string[];
  warnings: string[];
  backupPath?: string;
}

/**
 * Auth status response
 */
export interface AuthStatus {
  isAuthenticated: boolean;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    [key: string]: unknown;
  };
}

/**
 * Auth login response
 */
export interface AuthLoginResponse {
  refreshToken: string;
  accessToken?: string;
  expiresIn?: number;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    [key: string]: unknown;
  };
}

/**
 * Task logs response
 */
export interface TaskLogsResponse {
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
}

/**
 * Normalize files result
 */
export interface NormalizeFilesResult {
  result: {
    totalFiles: number;
    processedFiles: number;
    movedFiles: number;
    renamedFiles: number;
    updatedDatabase: number;
    skippedFiles: number;
    errors: Array<{ file: string; error: string }>;
  };
}

/**
 * Type helper for API response
 */
export type ApiResponseType<T> = Promise<AxiosResponse<ApiResponse<T>>>;

