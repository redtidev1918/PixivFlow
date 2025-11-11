/**
 * API Type Definitions
 * Centralized type definitions for API responses and requests
 */

import { ApiResponse, StatsOverview, DownloadTask, DownloadStatus } from '../services/api';

// Re-export API types for convenience
export type { ApiResponse, StatsOverview, DownloadTask, DownloadStatus };

/**
 * Configuration data structure
 */
export interface ConfigData {
  targets?: Array<{
    type: string;
    value: string;
    [key: string]: unknown;
  }>;
  network?: {
    proxy?: string;
    timeout?: number;
    [key: string]: unknown;
  };
  storage?: {
    basePath?: string;
    [key: string]: unknown;
  };
  scheduler?: {
    enabled?: boolean;
    cron?: string;
    [key: string]: unknown;
  };
  download?: {
    concurrency?: number;
    retry?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * File item structure
 */
export interface FileItem {
  name: string;
  path: string;
  size: number;
  type: 'file' | 'directory';
  modified: string;
  extension?: string;
}

/**
 * Directory listing response
 */
export interface DirectoryListing {
  files: FileItem[];
  directories: FileItem[];
  currentPath: string;
}

/**
 * Config history item
 */
export interface ConfigHistoryItem {
  id: string;
  timestamp: string;
  description?: string;
  config: ConfigData;
}

/**
 * Config file item
 */
export interface ConfigFileItem {
  name: string;
  path: string;
  isActive: boolean;
}

/**
 * Log entry
 */
export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  originalLine: string;
}

/**
 * History item
 */
export interface HistoryItem {
  id: string;
  illustId?: string;
  novelId?: string;
  title: string;
  author: string;
  authorId: string;
  tags: string[];
  downloadedAt: string;
  type: 'illustration' | 'novel';
}

