import DatabaseDriver from 'better-sqlite3';
import { DatabaseError } from '../utils/errors';
import { logger } from '../logger';

/**
 * Handles database migrations
 */
export class DatabaseMigration {
  constructor(private readonly db: DatabaseDriver.Database) {}

  /**
   * Run all database migrations
   */
  public migrate(): void {
    try {
      const migrations = [
        `CREATE TABLE IF NOT EXISTS tokens (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,
        `CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pixiv_id TEXT NOT NULL,
            type TEXT NOT NULL,
            tag TEXT NOT NULL,
            title TEXT NOT NULL,
            file_path TEXT NOT NULL,
            author TEXT,
            user_id TEXT,
            downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(pixiv_id, type, file_path)
          )`,
        `CREATE TABLE IF NOT EXISTS execution_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,
        `CREATE TABLE IF NOT EXISTS scheduler_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            execution_number INTEGER NOT NULL,
            status TEXT NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            duration_ms INTEGER,
            error_message TEXT,
            items_downloaded INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,
        `CREATE TABLE IF NOT EXISTS config_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            config_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,
      ];

      // Create indexes for better query performance
      const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_downloads_pixiv_id_type ON downloads(pixiv_id, type)`,
        `CREATE INDEX IF NOT EXISTS idx_downloads_tag ON downloads(tag)`,
        `CREATE INDEX IF NOT EXISTS idx_downloads_downloaded_at ON downloads(downloaded_at)`,
        `CREATE INDEX IF NOT EXISTS idx_execution_log_tag_type ON execution_log(tag, type)`,
        `CREATE INDEX IF NOT EXISTS idx_scheduler_executions_number ON scheduler_executions(execution_number)`,
        `CREATE INDEX IF NOT EXISTS idx_scheduler_executions_status ON scheduler_executions(status)`,
        `CREATE INDEX IF NOT EXISTS idx_config_history_created_at ON config_history(created_at)`,
      ];

      const transaction = this.db.transaction((stmts: string[]) => {
        for (const sql of stmts) {
          this.db.prepare(sql).run();
        }
      });

      transaction([...migrations, ...indexes]);

      // Add is_active column to config_history if it doesn't exist
      try {
        // Check if column exists by querying pragma_table_info
        const tableInfo = this.db.prepare(`PRAGMA table_info(config_history)`).all() as Array<{ name: string }>;
        const hasIsActiveColumn = tableInfo.some(col => col.name === 'is_active');
        
        if (!hasIsActiveColumn) {
          this.db.prepare(`ALTER TABLE config_history ADD COLUMN is_active INTEGER DEFAULT 0`).run();
          this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_config_history_is_active ON config_history(is_active)`).run();
        }
      } catch (error) {
        // Column might already exist, ignore error
        // In SQLite, if column exists, ALTER TABLE will fail, which is fine
        logger.warn('Failed to add is_active column (may already exist)', { error });
      }
    } catch (error) {
      throw new DatabaseError(
        'Failed to run database migrations',
        error instanceof Error ? error : undefined
      );
    }
  }
}














































