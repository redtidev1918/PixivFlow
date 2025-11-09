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
 */
export const QUERY_KEYS = {
  AUTH_STATUS: ['auth', 'status'],
  CONFIG: ['config'],
  DOWNLOAD_STATUS: ['download', 'status'],
  DOWNLOAD_HISTORY: ['download', 'history'],
  INCOMPLETE_TASKS: ['download', 'incomplete'],
  STATS_OVERVIEW: ['stats', 'overview'],
  LOGS: ['logs'],
  FILES: ['files'],
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

