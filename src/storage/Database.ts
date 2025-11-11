import DatabaseDriver from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseError } from '../utils/errors';
import { IDatabase } from '../interfaces/IDatabase';
import { DatabaseMigration } from './DatabaseMigration';
import { TokenRepository } from './repositories/TokenRepository';
import { DownloadRepository } from './repositories/DownloadRepository';
import { ExecutionRepository } from './repositories/ExecutionRepository';
import { SchedulerRepository } from './repositories/SchedulerRepository';
import { ConfigHistoryRepository } from './repositories/ConfigHistoryRepository';

export interface AccessTokenStore {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  tokenType: string;
}

export interface DownloadRecordInput {
  pixivId: string;
  type: 'illustration' | 'novel';
  tag: string;
  title: string;
  filePath: string;
  userId?: string;
  author?: string;
}

export type ExecutionStatus = 'success' | 'partial' | 'failed';

export interface SchedulerExecutionRecord {
  id: number;
  executionNumber: number;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  startTime: string;
  endTime: string | null;
  duration: number | null;
  errorMessage: string | null;
  itemsDownloaded: number;
}

export class Database implements IDatabase {
  private db: DatabaseDriver.Database;
  private migration: DatabaseMigration;
  private tokenRepo: TokenRepository;
  private downloadRepo: DownloadRepository;
  private executionRepo: ExecutionRepository;
  private schedulerRepo: SchedulerRepository;
  private configHistoryRepo: ConfigHistoryRepository;

  constructor(private readonly databasePath: string) {
    try {
      mkdirSync(dirname(this.databasePath), { recursive: true });
      this.db = new DatabaseDriver(this.databasePath);
      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      // Optimize for read-heavy workloads
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000'); // 64MB cache

      // Initialize repositories
      this.migration = new DatabaseMigration(this.db);
      this.tokenRepo = new TokenRepository(this.db);
      this.downloadRepo = new DownloadRepository(this.db);
      this.executionRepo = new ExecutionRepository(this.db);
      this.schedulerRepo = new SchedulerRepository(this.db);
      this.configHistoryRepo = new ConfigHistoryRepository(this.db);
    } catch (error) {
      throw new DatabaseError(
        `Failed to initialize database at ${this.databasePath}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  public migrate(): void {
    this.migration.migrate();
  }

  // Token management - delegated to TokenRepository
  public getToken(key: string): AccessTokenStore | null {
    return this.tokenRepo.getToken(key);
  }

  public setToken(key: string, value: AccessTokenStore): void {
    this.tokenRepo.setToken(key, value);
  }

  public deleteToken(key: string): boolean {
    return this.tokenRepo.deleteToken(key);
  }

  public saveToken(key: string, token: AccessTokenStore): void {
    this.tokenRepo.saveToken(key, token);
  }

  // Download management - delegated to DownloadRepository
  public hasDownloaded(pixivId: string, type: 'illustration' | 'novel'): boolean {
    return this.downloadRepo.hasDownloaded(pixivId, type);
  }

  public isDownloaded(pixivId: string, type: 'illustration' | 'novel', filePath: string): boolean {
    return this.downloadRepo.isDownloaded(pixivId, type, filePath);
  }

  public getDownloadedIds(pixivIds: string[], type: 'illustration' | 'novel'): Set<string> {
    return this.downloadRepo.getDownloadedIds(pixivIds, type);
  }

  public insertDownload(record: DownloadRecordInput): void {
    this.downloadRepo.insertDownload(record);
  }

  public recordDownload(record: DownloadRecordInput): void {
    this.downloadRepo.recordDownload(record);
  }

  public updateFilePath(
    pixivId: string,
    type: 'illustration' | 'novel',
    oldPath: string,
    newPath: string
  ): number {
    return this.downloadRepo.updateFilePath(pixivId, type, oldPath, newPath);
  }

  public getDownloadStats(tag?: string, type?: 'illustration' | 'novel'): {
    total: number;
    byTag: Record<string, number>;
    byType: Record<string, number>;
  } {
    return this.downloadRepo.getDownloadStats(tag, type);
  }

  // Execution log management - delegated to ExecutionRepository
  public logExecution(tag: string, type: 'illustration' | 'novel', status: ExecutionStatus, message?: string): void {
    this.executionRepo.logExecution(tag, type, status, message);
  }

  public recordExecutionLog(
    tag: string,
    type: 'illustration' | 'novel',
    status: ExecutionStatus,
    message?: string
  ): void {
    this.executionRepo.recordExecutionLog(tag, type, status, message);
  }

  public getIncompleteTasks(limit: number = 50): Array<{
    id: number;
    tag: string;
    type: 'illustration' | 'novel';
    status: ExecutionStatus;
    message: string | null;
    executedAt: string;
  }> {
    return this.executionRepo.getIncompleteTasks(limit);
  }

  public deleteIncompleteTask(id: number): { success: boolean; message?: string } {
    return this.executionRepo.deleteIncompleteTask(id);
  }

  public deleteAllIncompleteTasks(): { success: boolean; deletedCount: number; message?: string } {
    return this.executionRepo.deleteAllIncompleteTasks();
  }

  // Scheduler management - delegated to SchedulerRepository
  public getNextExecutionNumber(): number {
    return this.schedulerRepo.getNextExecutionNumber();
  }

  public logSchedulerExecution(
    executionNumber: number,
    status: 'success' | 'failed' | 'timeout' | 'skipped',
    startTime: Date,
    endTime: Date | null,
    durationMs: number | null,
    errorMessage: string | null,
    itemsDownloaded: number = 0
  ): void {
    this.schedulerRepo.logSchedulerExecution(
      executionNumber,
      status,
      startTime,
      endTime,
      durationMs,
      errorMessage,
      itemsDownloaded
    );
  }

  public recordSchedulerExecution(
    executionNumber: number,
    status: 'success' | 'failed' | 'timeout' | 'skipped',
    startTime: Date,
    endTime: Date | null,
    duration: number | null,
    errorMessage: string | null,
    itemsDownloaded: number
  ): void {
    this.schedulerRepo.recordSchedulerExecution(
      executionNumber,
      status,
      startTime,
      endTime,
      duration,
      errorMessage,
      itemsDownloaded
    );
  }

  public getSchedulerStats(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    lastExecutionTime: string | null;
    averageDuration: number | null;
    totalItemsDownloaded: number;
  } {
    return this.schedulerRepo.getSchedulerStats();
  }

  public getRecentSchedulerExecutions(limit: number = 10): SchedulerExecutionRecord[] {
    return this.schedulerRepo.getRecentSchedulerExecutions(limit);
  }

  public getSchedulerExecutions(limit?: number): SchedulerExecutionRecord[] {
    return this.schedulerRepo.getSchedulerExecutions(limit);
  }

  public getConsecutiveFailures(): number {
    return this.schedulerRepo.getConsecutiveFailures();
  }

  // Additional download methods - delegated to DownloadRepository
  public getDownloadHistory(options: {
    page?: number;
    limit?: number;
    type?: string;
    tag?: string;
    author?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: 'downloadedAt' | 'title' | 'author' | 'pixivId';
    sortOrder?: 'asc' | 'desc';
  }): {
    items: Array<{
      id: number;
      pixivId: string;
      type: string;
      tag: string;
      title: string;
      filePath: string;
      author: string | null;
      userId: string | null;
      downloadedAt: string;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const { 
      page = 1, 
      limit = 20, 
      type, 
      tag, 
      author,
      startDate,
      endDate,
      sortBy = 'downloadedAt',
      sortOrder = 'desc'
    } = options;

    // Build query
    let whereClause = '1=1';
    const params: any[] = [];

    if (type) {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    if (tag) {
      whereClause += ' AND tag LIKE ?';
      params.push(`%${tag}%`);
    }

    if (author) {
      whereClause += ' AND author LIKE ?';
      params.push(`%${author}%`);
    }

    if (startDate) {
      whereClause += ' AND downloaded_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND downloaded_at <= ?';
      params.push(endDate);
    }

    // Map sortBy to database column names
    const sortColumnMap: Record<string, string> = {
      downloadedAt: 'downloaded_at',
      title: 'title',
      author: 'author',
      pixivId: 'pixiv_id',
    };
    const sortColumn = sortColumnMap[sortBy] || 'downloaded_at';
    const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM downloads WHERE ${whereClause}`);
    const countRow = countStmt.get(...params) as { total: number };
    const total = countRow.total || 0;

    // Get paginated results
    const offset = (Number(page) - 1) * Number(limit);
    const stmt = this.db.prepare(
      `SELECT * FROM downloads 
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${orderDirection}
       LIMIT ? OFFSET ?`
    );
    const items = stmt.all(...params, Number(limit), offset) as Array<{
      id: number;
      pixiv_id: string;
      type: string;
      tag: string;
      title: string;
      file_path: string;
      author: string | null;
      user_id: string | null;
      downloaded_at: string;
    }>;

    return this.downloadRepo.getDownloadHistory(options);
  }

  public getDownloadTimesForPaths(
    filePaths: string[],
    type: 'illustration' | 'novel'
  ): Map<string, string> {
    return this.downloadRepo.getDownloadTimesForPaths(filePaths, type);
  }

  public getRecentDownloads(
    limit: number = 50,
    type?: 'illustration' | 'novel'
  ): Array<{
    pixivId: string;
    type: 'illustration' | 'novel';
    tag: string;
    title: string;
    filePath: string;
    author: string | null;
    userId: string | null;
    downloadedAt: string;
  }> {
    return this.downloadRepo.getRecentDownloads(limit, type);
  }

  public getDownloadsByDateRange(
    startDate: string,
    endDate?: string,
    type?: 'illustration' | 'novel'
  ): Array<{
    pixivId: string;
    type: 'illustration' | 'novel';
    tag: string;
    title: string;
    filePath: string;
    author: string | null;
    userId: string | null;
    downloadedAt: string;
  }> {
    return this.downloadRepo.getDownloadsByDateRange(startDate, endDate, type);
  }

  public getOverviewStats(): {
    totalDownloads: number;
    illustrations: number;
    novels: number;
    recentDownloads: number;
  } {
    return this.downloadRepo.getOverviewStats();
  }

  public getDownloadsByPeriod(days: number): Array<{
    id: number;
    pixiv_id: string;
    type: string;
    tag: string;
    title: string;
    file_path: string;
    author: string | null;
    user_id: string | null;
    downloaded_at: string;
  }> {
    return this.downloadRepo.getDownloadsByPeriod(days);
  }

  public getTagStats(limit: number = 10): Array<{ name: string; count: number }> {
    return this.downloadRepo.getTagStats(limit);
  }

  public getAuthorStats(limit: number = 10): Array<{ name: string; count: number }> {
    return this.downloadRepo.getAuthorStats(limit);
  }

  // Config history management - delegated to ConfigHistoryRepository
  public saveConfigHistory(name: string, config: any, description?: string): number {
    return this.configHistoryRepo.saveConfigHistory(name, config, description);
  }

  public getConfigHistory(): Array<{
    id: number;
    name: string;
    description: string | null;
    config_json: string;
    created_at: string;
    updated_at: string;
    is_active: number;
  }> {
    return this.configHistoryRepo.getConfigHistory();
  }

  public getConfigHistoryById(id: number): {
    id: number;
    name: string;
    description: string | null;
    config_json: string;
    created_at: string;
    updated_at: string;
    is_active: number;
  } | null {
    return this.configHistoryRepo.getConfigHistoryById(id);
  }

  public deleteConfigHistory(id: number): boolean {
    return this.configHistoryRepo.deleteConfigHistory(id);
  }

  public updateConfigHistory(id: number, name: string, config: any, description?: string): boolean {
    return this.configHistoryRepo.updateConfigHistory(id, name, config, description);
  }

  public setActiveConfigHistory(id: number): boolean {
    return this.configHistoryRepo.setActiveConfigHistory(id);
  }

  public getActiveConfigHistory(): {
    id: number;
    name: string;
    description: string | null;
    config_json: string;
    created_at: string;
    updated_at: string;
    is_active: number;
  } | null {
    return this.configHistoryRepo.getActiveConfigHistory();
  }

  public setActiveConfig(configId: number): void {
    this.setActiveConfigHistory(configId);
  }

  public close() {
    this.db.close();
  }
}

