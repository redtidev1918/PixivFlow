import { BaseRepository } from './BaseRepository';
import { DownloadRecordInput } from '../Database';

/**
 * Repository for writing download records
 */
export class DownloadWriteRepository extends BaseRepository {
  /**
   * Insert a download record
   */
  public insertDownload(record: DownloadRecordInput): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO downloads (pixiv_id, type, tag, title, file_path, author, user_id)
       VALUES (@pixiv_id, @type, @tag, @title, @file_path, @author, @user_id)`
    );

    stmt.run({
      pixiv_id: record.pixivId,
      type: record.type,
      tag: record.tag,
      title: record.title,
      file_path: record.filePath,
      author: record.author ?? null,
      user_id: record.userId ?? null,
    });
  }

  /**
   * Record download (alias for insertDownload)
   */
  public recordDownload(record: DownloadRecordInput): void {
    this.insertDownload(record);
  }

  /**
   * Update file path in database
   */
  public updateFilePath(
    pixivId: string,
    type: 'illustration' | 'novel',
    oldPath: string,
    newPath: string
  ): number {
    const stmt = this.db.prepare(
      `UPDATE downloads 
       SET file_path = ? 
       WHERE pixiv_id = ? AND type = ? AND file_path = ?`
    );

    const result = stmt.run(newPath, pixivId, type, oldPath);
    return result.changes;
  }
}

























