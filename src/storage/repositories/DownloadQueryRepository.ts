import { BaseRepository } from './BaseRepository';

/**
 * Repository for querying download records
 */
export class DownloadQueryRepository extends BaseRepository {
  /**
   * Check if an item has been downloaded
   */
  public hasDownloaded(pixivId: string, type: 'illustration' | 'novel'): boolean {
    const stmt = this.db.prepare(
      `SELECT 1 FROM downloads WHERE pixiv_id = ? AND type = ? LIMIT 1`
    );
    const row = stmt.get(pixivId, type);
    return !!row;
  }

  /**
   * Check if an item has been downloaded (with file path)
   */
  public isDownloaded(pixivId: string, type: 'illustration' | 'novel', filePath: string): boolean {
    const stmt = this.db.prepare(
      `SELECT 1 FROM downloads WHERE pixiv_id = ? AND type = ? AND file_path = ? LIMIT 1`
    );
    const row = stmt.get(pixivId, type, filePath);
    return !!row;
  }

  /**
   * Batch check if multiple items are already downloaded
   * Returns a Set of pixivIds that are already downloaded
   * Optimized for large batches by chunking queries
   */
  public getDownloadedIds(pixivIds: string[], type: 'illustration' | 'novel'): Set<string> {
    if (pixivIds.length === 0) {
      return new Set();
    }

    // SQLite has a limit on the number of parameters (default 999)
    // Chunk large arrays to avoid hitting this limit
    const CHUNK_SIZE = 500;
    const downloadedSet = new Set<string>();

    try {
      for (let i = 0; i < pixivIds.length; i += CHUNK_SIZE) {
        const chunk = pixivIds.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '?').join(',');
        const stmt = this.db.prepare(
          `SELECT pixiv_id FROM downloads WHERE pixiv_id IN (${placeholders}) AND type = ?`
        );
        
        const rows = stmt.all(...chunk, type) as Array<{ pixiv_id: string }>;
        rows.forEach(row => downloadedSet.add(row.pixiv_id));
      }
    } catch (error) {
      // Return empty set on error to allow downloads to proceed
    }

    return downloadedSet;
  }

  /**
   * Get download history with pagination and filtering
   */
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

    return {
      items: items.map(item => ({
        id: item.id,
        pixivId: item.pixiv_id,
        type: item.type,
        tag: item.tag,
        title: item.title,
        filePath: item.file_path,
        author: item.author,
        userId: item.user_id,
        downloadedAt: item.downloaded_at,
      })),
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    };
  }

  /**
   * Get download times for multiple file paths
   * Returns a map of file path -> downloaded_at timestamp
   */
  public getDownloadTimesForPaths(
    filePaths: string[],
    type: 'illustration' | 'novel'
  ): Map<string, string> {
    if (filePaths.length === 0) {
      return new Map();
    }

    // Create placeholders for IN clause
    const placeholders = filePaths.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `SELECT file_path, downloaded_at 
       FROM downloads 
       WHERE type = ? AND file_path IN (${placeholders})`
    );

    const rows = stmt.all(type, ...filePaths) as Array<{
      file_path: string;
      downloaded_at: string;
    }>;

    const result = new Map<string, string>();
    for (const row of rows) {
      result.set(row.file_path, row.downloaded_at);
    }

    return result;
  }

  /**
   * Get recent downloads ordered by download time
   */
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
    let query = `SELECT pixiv_id, type, tag, title, file_path, author, user_id, downloaded_at 
                 FROM downloads`;
    const params: any[] = [];

    if (type) {
      query += ' WHERE type = ?';
      params.push(type);
    }

    query += ' ORDER BY downloaded_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      pixiv_id: string;
      type: string;
      tag: string;
      title: string;
      file_path: string;
      author: string | null;
      user_id: string | null;
      downloaded_at: string;
    }>;

    return rows.map(row => ({
      pixivId: row.pixiv_id,
      type: row.type as 'illustration' | 'novel',
      tag: row.tag,
      title: row.title,
      filePath: row.file_path,
      author: row.author,
      userId: row.user_id,
      downloadedAt: row.downloaded_at,
    }));
  }

  /**
   * Get downloads by date range
   */
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
    let query = `SELECT pixiv_id, type, tag, title, file_path, author, user_id, downloaded_at 
                 FROM downloads 
                 WHERE downloaded_at >= ?`;
    const params: any[] = [startDate];

    if (endDate) {
      query += ' AND downloaded_at <= ?';
      params.push(endDate);
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY downloaded_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      pixiv_id: string;
      type: string;
      tag: string;
      title: string;
      file_path: string;
      author: string | null;
      user_id: string | null;
      downloaded_at: string;
    }>;

    return rows.map(row => ({
      pixivId: row.pixiv_id,
      type: row.type as 'illustration' | 'novel',
      tag: row.tag,
      title: row.title,
      filePath: row.file_path,
      author: row.author,
      userId: row.user_id,
      downloadedAt: row.downloaded_at,
    }));
  }

  /**
   * Get downloads by period
   */
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
    const stmt = this.db.prepare(
      `SELECT * FROM downloads 
       WHERE downloaded_at >= datetime('now', '-${days} days')
       ORDER BY downloaded_at DESC`
    );
    return stmt.all() as Array<{
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
  }
}















