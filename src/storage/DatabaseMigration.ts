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
        `CREATE TABLE IF NOT EXISTS task_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            error TEXT,
            target_id TEXT,
            progress_current INTEGER,
            progress_total INTEGER,
            progress_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,
        // Schedule Slots: one business batch (e.g. 2026-09-08:morning). A slot
        // groups one run of each enabled target (a "cell"). External triggers
        // and restarts converge on the SAME slot row instead of re-running.
        //
        // A Slot is one durable execution occurrence of a Schedule. Its id is
        // schedule-scoped (`<scheduleId>@<occurrenceStamp>`); occurrence_at is
        // the canonical scheduled fire time in the schedule's own timezone.
        // target_ids snapshots the membership materialized at first run so a
        // later config reload cannot mutate an in-flight occurrence.
        `CREATE TABLE IF NOT EXISTS schedule_slots (
            id TEXT PRIMARY KEY,
            schedule_id TEXT NOT NULL,
            occurrence_at INTEGER,
            occurrence_date TEXT NOT NULL DEFAULT '',
            occurrence_label TEXT NOT NULL DEFAULT '',
            timezone TEXT NOT NULL DEFAULT 'UTC',
            target_ids TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            trigger_source TEXT,
            slot_date TEXT NOT NULL DEFAULT '',
            slot_name TEXT NOT NULL DEFAULT '',
            lease_owner TEXT,
            lease_until INTEGER,
            heartbeat_at INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            completed_at DATETIME,
            last_error TEXT
          )`,
        // One cell per (slot, target). UNIQUE(slot_id, target_id) is the core
        // business idempotency: a given slot can never emit two works for one
        // target even under duplicate triggers / restarts / outbox replay.
        `CREATE TABLE IF NOT EXISTS schedule_slot_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slot_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            work_id TEXT,
            work_type TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            UNIQUE(slot_id, target_id)
          )`,
        // Delivery ledger: confirmed downstream submissions. This is separate
        // from downloads (local file facts). The natural idempotency key makes
        // ACK-lost retries converge to one row; (target, type, pixiv_id) marks
        // which works are already CONFIRMED delivered to which target.
        `CREATE TABLE IF NOT EXISTS deliveries (
            id TEXT PRIMARY KEY,
            delivery_target TEXT NOT NULL,
            work_type TEXT NOT NULL,
            pixiv_id TEXT NOT NULL,
            slot_id TEXT,
            target_id TEXT,
            idempotency_key TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'pending',
            remote_id TEXT,
            remote_status TEXT,
            reuse_reason TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            delivered_at DATETIME
          )`,
        // Durable transactional outbox: every external side effect (content
        // delivery or notification) originates from one row here. The worker
        // leases due rows; crashes leave an expired lease that a restart claims.
        `CREATE TABLE IF NOT EXISTS outbox (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            idempotency_key TEXT,
            delivery_id TEXT,
            delivery_target TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 12,
            next_attempt_at INTEGER NOT NULL,
            lease_owner TEXT,
            lease_until INTEGER,
            last_error TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            completed_at INTEGER
          )`,
        // Lightweight Pixiv metadata cache (novel language, rating) to cut
        // repeated detail/full-text requests and 429 amplification.
        `CREATE TABLE IF NOT EXISTS pixiv_metadata (
            pixiv_id TEXT NOT NULL,
            work_type TEXT NOT NULL,
            language TEXT,
            x_restrict INTEGER,
            published_at TEXT,
            title TEXT,
            checked_at INTEGER NOT NULL,
            PRIMARY KEY (pixiv_id, work_type)
          )`,
      ];

      // Phase 1: create tables (idempotent). Must run before any PRAGMA-based
      // column check, otherwise a fresh DB would report the table as missing and
      // both CREATE and ADD COLUMN would create the same column.
      const createTables = this.db.transaction((stmts: string[]) => {
        for (const sql of stmts) {
          this.db.prepare(sql).run();
        }
      });
      createTables(migrations);

      // Phase 2: additive column migrations for databases created before the
      // canonical occurrence model. The table now exists, so PRAGMA reports the
      // true current columns; ALTER only the ones missing on upgraded DBs (fresh
      // DBs already have them from the CREATE above and skip these).
      const slotCols = (this.db.prepare(`PRAGMA table_info(schedule_slots)`).all() as Array<{ name: string }>).map((c) => c.name);
      const slotColumnMigrations: Record<string, string> = {
        occurrence_at: 'ALTER TABLE schedule_slots ADD COLUMN occurrence_at INTEGER',
        occurrence_date: `ALTER TABLE schedule_slots ADD COLUMN occurrence_date TEXT NOT NULL DEFAULT ''`,
        occurrence_label: `ALTER TABLE schedule_slots ADD COLUMN occurrence_label TEXT NOT NULL DEFAULT ''`,
        timezone: `ALTER TABLE schedule_slots ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC'`,
        target_ids: 'ALTER TABLE schedule_slots ADD COLUMN target_ids TEXT',
        lease_owner: 'ALTER TABLE schedule_slots ADD COLUMN lease_owner TEXT',
        lease_until: 'ALTER TABLE schedule_slots ADD COLUMN lease_until INTEGER',
        heartbeat_at: 'ALTER TABLE schedule_slots ADD COLUMN heartbeat_at INTEGER',
      };
      const columnAlters: string[] = [];
      for (const [col, sql] of Object.entries(slotColumnMigrations)) {
        if (!slotCols.includes(col)) columnAlters.push(sql);
      }

      // Create indexes for better query performance
      const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_downloads_pixiv_id_type ON downloads(pixiv_id, type)`,
        `CREATE INDEX IF NOT EXISTS idx_downloads_tag ON downloads(tag)`,
        `CREATE INDEX IF NOT EXISTS idx_downloads_downloaded_at ON downloads(downloaded_at)`,
        `CREATE INDEX IF NOT EXISTS idx_execution_log_tag_type ON execution_log(tag, type)`,
        `CREATE INDEX IF NOT EXISTS idx_scheduler_executions_number ON scheduler_executions(execution_number)`,
        `CREATE INDEX IF NOT EXISTS idx_scheduler_executions_status ON scheduler_executions(status)`,
        `CREATE INDEX IF NOT EXISTS idx_config_history_created_at ON config_history(created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id)`,
        `CREATE INDEX IF NOT EXISTS idx_task_history_status ON task_history(status)`,
        `CREATE INDEX IF NOT EXISTS idx_task_history_start_time ON task_history(start_time)`,
        `CREATE INDEX IF NOT EXISTS idx_slots_schedule_occ ON schedule_slots(schedule_id, occurrence_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_slot_items_slot ON schedule_slot_items(slot_id)`,
        `CREATE INDEX IF NOT EXISTS idx_slot_items_work ON schedule_slot_items(work_id, work_type)`,
        `CREATE INDEX IF NOT EXISTS idx_deliveries_dedupe ON deliveries(delivery_target, work_type, pixiv_id, status)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_key ON outbox(kind, idempotency_key) WHERE idempotency_key IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS idx_outbox_due ON outbox(status, next_attempt_at)`,
        `CREATE INDEX IF NOT EXISTS idx_outbox_delivery ON outbox(delivery_id)`,
        `CREATE INDEX IF NOT EXISTS idx_slots_lease ON schedule_slots(lease_until)`,
      ];

      const postMigration = this.db.transaction((stmts: string[]) => {
        for (const sql of stmts) {
          this.db.prepare(sql).run();
        }
      });
      postMigration([...columnAlters, ...indexes]);

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

      // Scope scheduler counters/history by plan while keeping old rows valid.
      try {
        const tableInfo = this.db.prepare(`PRAGMA table_info(scheduler_executions)`).all() as Array<{ name: string }>;
        if (!tableInfo.some(col => col.name === 'schedule_id')) {
          this.db.prepare(
            `ALTER TABLE scheduler_executions ADD COLUMN schedule_id TEXT NOT NULL DEFAULT 'default'`
          ).run();
        }
        this.db.prepare(
          `CREATE INDEX IF NOT EXISTS idx_scheduler_executions_schedule ON scheduler_executions(schedule_id, execution_number)`
        ).run();
      } catch (error) {
        logger.warn('Failed to add scheduler plan scope (may already exist)', { error });
      }

      // Add task_history table if it doesn't exist (for backward compatibility)
      try {
        const tableInfo = this.db.prepare(`PRAGMA table_info(task_history)`).all() as Array<{ name: string }>;
        if (tableInfo.length === 0) {
          // Table doesn't exist, but it should have been created by migrations above
          // This is just a safety check
          logger.debug('task_history table will be created by migrations');
        }
      } catch (error) {
        logger.warn('Failed to check task_history table (may already exist)', { error });
      }
    } catch (error) {
      throw new DatabaseError(
        'Failed to run database migrations',
        error instanceof Error ? error : undefined
      );
    }
  }
}





























































