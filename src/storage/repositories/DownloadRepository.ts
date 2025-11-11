import { BaseRepository } from './BaseRepository';
import { DownloadRecordInput } from '../Database';
import { DownloadQueryRepository } from './DownloadQueryRepository';
import { DownloadWriteRepository } from './DownloadWriteRepository';
import { DownloadStatsRepository } from './DownloadStatsRepository';

/**
 * Repository for managing download records
 * Facade pattern that combines query, write, and stats repositories
 */
export class DownloadRepository extends BaseRepository {
  private readonly queryRepo: DownloadQueryRepository;
  private readonly writeRepo: DownloadWriteRepository;
  private readonly statsRepo: DownloadStatsRepository;

  constructor(db: import('better-sqlite3').Database) {
    super(db);
    this.queryRepo = new DownloadQueryRepository(db);
    this.writeRepo = new DownloadWriteRepository(db);
    this.statsRepo = new DownloadStatsRepository(db);
  }

  // Query methods
  public hasDownloaded(pixivId: string, type: 'illustration' | 'novel'): boolean {
    return this.queryRepo.hasDownloaded(pixivId, type);
  }

  public isDownloaded(pixivId: string, type: 'illustration' | 'novel', filePath: string): boolean {
    return this.queryRepo.isDownloaded(pixivId, type, filePath);
  }

  public getDownloadedIds(pixivIds: string[], type: 'illustration' | 'novel'): Set<string> {
    return this.queryRepo.getDownloadedIds(pixivIds, type);
  }

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
  }) {
    return this.queryRepo.getDownloadHistory(options);
  }

  public getDownloadTimesForPaths(
    filePaths: string[],
    type: 'illustration' | 'novel'
  ): Map<string, string> {
    return this.queryRepo.getDownloadTimesForPaths(filePaths, type);
  }

  public getRecentDownloads(
    limit: number = 50,
    type?: 'illustration' | 'novel'
  ) {
    return this.queryRepo.getRecentDownloads(limit, type);
  }

  public getDownloadsByDateRange(
    startDate: string,
    endDate?: string,
    type?: 'illustration' | 'novel'
  ) {
    return this.queryRepo.getDownloadsByDateRange(startDate, endDate, type);
  }

  public getDownloadsByPeriod(days: number) {
    return this.queryRepo.getDownloadsByPeriod(days);
  }

  // Write methods
  public insertDownload(record: DownloadRecordInput): void {
    this.writeRepo.insertDownload(record);
  }

  public recordDownload(record: DownloadRecordInput): void {
    this.writeRepo.recordDownload(record);
  }

  public updateFilePath(
    pixivId: string,
    type: 'illustration' | 'novel',
    oldPath: string,
    newPath: string
  ): number {
    return this.writeRepo.updateFilePath(pixivId, type, oldPath, newPath);
  }

  // Stats methods
  public getDownloadStats(tag?: string, type?: 'illustration' | 'novel') {
    return this.statsRepo.getDownloadStats(tag, type);
  }

  public getOverviewStats() {
    return this.statsRepo.getOverviewStats();
  }

  public getTagStats(limit: number = 10) {
    return this.statsRepo.getTagStats(limit);
  }

  public getAuthorStats(limit: number = 10) {
    return this.statsRepo.getAuthorStats(limit);
  }
}

