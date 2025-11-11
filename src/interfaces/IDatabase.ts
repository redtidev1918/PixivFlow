import { AccessTokenStore, DownloadRecordInput, ExecutionStatus, SchedulerExecutionRecord } from '../storage/Database';

/**
 * Interface for database operations
 * Provides abstraction for data persistence
 */
export interface IDatabase {
  /**
   * Run database migrations
   */
  migrate(): void;

  /**
   * Get access token from storage
   */
  getToken(key: string): AccessTokenStore | null;

  /**
   * Save access token to storage (alias for setToken)
   */
  saveToken(key: string, token: AccessTokenStore): void;

  /**
   * Set access token in storage
   */
  setToken(key: string, token: AccessTokenStore): void;

  /**
   * Check if an item has been downloaded
   */
  isDownloaded(pixivId: string, type: 'illustration' | 'novel', filePath: string): boolean;

  /**
   * Check if an item has been downloaded (by ID only)
   */
  hasDownloaded(pixivId: string, type: 'illustration' | 'novel'): boolean;

  /**
   * Record a download
   */
  recordDownload(record: DownloadRecordInput): void;

  /**
   * Insert a download record
   */
  insertDownload(record: DownloadRecordInput): void;

  /**
   * Get download statistics
   */
  getDownloadStats(tag?: string, type?: 'illustration' | 'novel'): {
    total: number;
    byTag: Record<string, number>;
    byType: Record<string, number>;
  };

  /**
   * Record execution log
   */
  recordExecutionLog(
    tag: string,
    type: 'illustration' | 'novel',
    status: ExecutionStatus,
    message?: string
  ): void;

  /**
   * Log execution (alias for recordExecutionLog)
   */
  logExecution(
    tag: string,
    type: 'illustration' | 'novel',
    status: ExecutionStatus,
    message?: string
  ): void;

  /**
   * Record scheduler execution
   */
  recordSchedulerExecution(
    executionNumber: number,
    status: 'success' | 'failed' | 'timeout' | 'skipped',
    startTime: Date,
    endTime: Date | null,
    duration: number | null,
    errorMessage: string | null,
    itemsDownloaded: number
  ): void;

  /**
   * Get scheduler execution history
   */
  getSchedulerExecutions(limit?: number): SchedulerExecutionRecord[];

  /**
   * Save config to history
   */
  saveConfigHistory(name: string, description: string | null, configJson: string): number;

  /**
   * Save config to history (with config object)
   */
  saveConfigHistory(name: string, config: any, description?: string): number;

  /**
   * Get config history
   */
  getConfigHistory(limit?: number): Array<{
    id: number;
    name: string;
    description: string | null;
    config_json: string;
    created_at: string;
    updated_at: string;
    is_active: number;
  }>;

  /**
   * Get active config from history
   */
  getActiveConfigHistory(): {
    id: number;
    name: string;
    description: string | null;
    config_json: string;
    created_at: string;
    updated_at: string;
    is_active: number;
  } | null;

  /**
   * Set active config
   */
  setActiveConfig(configId: number): void;

  /**
   * Set active config history (alias for setActiveConfig)
   */
  setActiveConfigHistory(configId: number): boolean;

  /**
   * Close database connection
   */
  close(): void;

  /**
   * Get downloaded IDs from a list of pixiv IDs
   */
  getDownloadedIds(pixivIds: string[], type: 'illustration' | 'novel'): Set<string>;

  /**
   * Update file path in database
   */
  updateFilePath(
    pixivId: string,
    type: 'illustration' | 'novel',
    oldPath: string,
    newPath: string
  ): number;
}

