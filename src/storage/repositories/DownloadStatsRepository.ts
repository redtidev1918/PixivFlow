import { BaseRepository } from './BaseRepository';

/**
 * Repository for download statistics
 */
export class DownloadStatsRepository extends BaseRepository {
  /**
   * Get download statistics
   */
  public getDownloadStats(tag?: string, type?: 'illustration' | 'novel'): {
    total: number;
    byTag: Record<string, number>;
    byType: Record<string, number>;
  } {
    let query = 'SELECT tag, type, COUNT(*) as count FROM downloads WHERE 1=1';
    const params: any[] = [];

    if (tag) {
      query += ' AND tag = ?';
      params.push(tag);
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' GROUP BY tag, type';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{ tag: string; type: string; count: number }>;

    const stats = {
      total: 0,
      byTag: {} as Record<string, number>,
      byType: {} as Record<string, number>,
    };

    for (const row of rows) {
      stats.total += row.count;
      stats.byTag[row.tag] = (stats.byTag[row.tag] || 0) + row.count;
      stats.byType[row.type] = (stats.byType[row.type] || 0) + row.count;
    }

    return stats;
  }

  /**
   * Get overview statistics
   */
  public getOverviewStats(): {
    totalDownloads: number;
    illustrations: number;
    novels: number;
    recentDownloads: number;
  } {
    // Get total downloads
    const totalStmt = this.db.prepare('SELECT COUNT(*) as total FROM downloads');
    const totalRow = totalStmt.get() as { total: number };
    const totalDownloads = totalRow.total || 0;
    
    // Get downloads by type
    const illustrationsStmt = this.db.prepare(
      "SELECT COUNT(*) as total FROM downloads WHERE type = 'illustration'"
    );
    const illustrationsRow = illustrationsStmt.get() as { total: number };
    const illustrations = illustrationsRow.total || 0;

    const novelsStmt = this.db.prepare(
      "SELECT COUNT(*) as total FROM downloads WHERE type = 'novel'"
    );
    const novelsRow = novelsStmt.get() as { total: number };
    const novels = novelsRow.total || 0;

    // Get recent downloads (last 7 days)
    const recentStmt = this.db.prepare(
      `SELECT COUNT(*) as total FROM downloads 
       WHERE downloaded_at >= datetime('now', '-7 days')`
    );
    const recentRow = recentStmt.get() as { total: number };
    const recentDownloads = recentRow.total || 0;

    return {
      totalDownloads,
      illustrations,
      novels,
      recentDownloads,
    };
  }

  /**
   * Get tag statistics
   */
  public getTagStats(limit: number = 10): Array<{ name: string; count: number }> {
    const stmt = this.db.prepare(
      `SELECT tag, COUNT(*) as count 
       FROM downloads 
       GROUP BY tag 
       ORDER BY count DESC 
       LIMIT ?`
    );
    const tags = stmt.all(limit) as Array<{ tag: string; count: number }>;
    return tags.map(t => ({ name: t.tag, count: t.count }));
  }

  /**
   * Get author statistics
   */
  public getAuthorStats(limit: number = 10): Array<{ name: string; count: number }> {
    const stmt = this.db.prepare(
      `SELECT author, COUNT(*) as count 
       FROM downloads 
       WHERE author IS NOT NULL
       GROUP BY author 
       ORDER BY count DESC 
       LIMIT ?`
    );
    const authors = stmt.all(limit) as Array<{ author: string; count: number }>;
    return authors.map(a => ({ name: a.author, count: a.count }));
  }
}
















































