/**
 * Application Constants
 * Centralized constants for the application
 */

export * from './theme';

/**
 * API Configuration
 */
export const API_CONFIG = {
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: ['20', '50', '100', '200'],
} as const;

/**
 * File extensions
 */
export const FILE_EXTENSIONS = {
  IMAGES: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
  TEXT: ['.txt', '.md', '.text'],
  ARCHIVES: ['.zip', '.rar', '.7z'],
} as const;

/**
 * Download status types
 */
export const DOWNLOAD_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped',
} as const;

/**
 * Content types
 */
export const CONTENT_TYPE = {
  ILLUSTRATION: 'illustration',
  NOVEL: 'novel',
} as const;

/**
 * Log levels
 */
export const LOG_LEVEL = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  FATAL: 'FATAL',
} as const;

/**
 * Query keys for React Query
 * Helper functions for creating query keys with parameters
 */
export const QUERY_KEYS = {
  // Auth
  AUTH_STATUS: ['authStatus'],
  AUTH: ['auth', 'status'],
  
  // Config
  CONFIG: ['config'],
  CONFIG_FILES: ['configFiles'],
  CONFIG_HISTORY: ['configHistory'],
  CONFIG_DIAGNOSE: ['configDiagnose'],
  
  // Download
  DOWNLOAD_STATUS: (taskId?: string) => taskId ? ['download', 'status', taskId] : ['download', 'status'],
  DOWNLOAD_LOGS: (taskId: string) => ['download', 'logs', taskId],
  DOWNLOAD_HISTORY: (params?: any) => params ? ['download', 'history', params] : ['download', 'history'],
  INCOMPLETE_TASKS: ['download', 'incomplete'],
  
  // Stats
  STATS_OVERVIEW: ['stats', 'overview'],
  STATS_DOWNLOADS: (period?: string) => period ? ['stats', 'downloads', period] : ['stats', 'downloads'],
  STATS_TAGS: (limit?: number) => limit ? ['stats', 'tags', limit] : ['stats', 'tags'],
  STATS_AUTHORS: (limit?: number) => limit ? ['stats', 'authors', limit] : ['stats', 'authors'],
  
  // Logs
  LOGS: (params?: any) => params ? ['logs', params] : ['logs'],
  
  // Files
  FILES: (params?: any) => params ? ['files', params] : ['files'],
  FILES_RECENT: (params?: any) => params ? ['files', 'recent', params] : ['files', 'recent'],
  FILES_PREVIEW: (path: string, type?: string) => type ? ['files', 'preview', path, type] : ['files', 'preview', path],
} as const;

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  LANGUAGE: 'pixivflow_language',
  THEME: 'pixivflow_theme',
  USER_PREFERENCES: 'pixivflow_preferences',
} as const;

/**
 * Refresh intervals (in milliseconds)
 */
export const REFRESH_INTERVALS = {
  DOWNLOAD_STATUS: 2000,
  TASK_LOGS: 2000,
  CONFIG: 5000,
  LOGS: 5000,
} as const;

/**
 * Date filter options
 */
export const DATE_FILTERS = {
  ALL: 'all',
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  THIS_WEEK: 'thisWeek',
  LAST_WEEK: 'lastWeek',
  THIS_MONTH: 'thisMonth',
  LAST_MONTH: 'lastMonth',
} as const;

/**
 * Sort orders
 */
export const SORT_ORDER = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

