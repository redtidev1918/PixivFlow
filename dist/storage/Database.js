"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const errors_1 = require("../utils/errors");
const logger_1 = require("../logger");
class Database {
    databasePath;
    db;
    constructor(databasePath) {
        this.databasePath = databasePath;
        try {
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(this.databasePath), { recursive: true });
            this.db = new better_sqlite3_1.default(this.databasePath);
            // Enable WAL mode for better concurrency
            this.db.pragma('journal_mode = WAL');
            // Optimize for read-heavy workloads
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('cache_size = -64000'); // 64MB cache
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to initialize database at ${this.databasePath}`, error instanceof Error ? error : undefined);
        }
    }
    migrate() {
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
            ];
            // Create indexes for better query performance
            const indexes = [
                `CREATE INDEX IF NOT EXISTS idx_downloads_pixiv_id_type ON downloads(pixiv_id, type)`,
                `CREATE INDEX IF NOT EXISTS idx_downloads_tag ON downloads(tag)`,
                `CREATE INDEX IF NOT EXISTS idx_downloads_downloaded_at ON downloads(downloaded_at)`,
                `CREATE INDEX IF NOT EXISTS idx_execution_log_tag_type ON execution_log(tag, type)`,
                `CREATE INDEX IF NOT EXISTS idx_scheduler_executions_number ON scheduler_executions(execution_number)`,
                `CREATE INDEX IF NOT EXISTS idx_scheduler_executions_status ON scheduler_executions(status)`,
            ];
            const transaction = this.db.transaction((stmts) => {
                for (const sql of stmts) {
                    this.db.prepare(sql).run();
                }
            });
            transaction([...migrations, ...indexes]);
        }
        catch (error) {
            throw new errors_1.DatabaseError('Failed to run database migrations', error instanceof Error ? error : undefined);
        }
    }
    getToken(key) {
        const stmt = this.db.prepare(`SELECT value FROM tokens WHERE key = ?`);
        const row = stmt.get(key);
        if (!row) {
            return null;
        }
        return JSON.parse(row.value);
    }
    setToken(key, value) {
        const stmt = this.db.prepare(`INSERT INTO tokens (key, value, updated_at)
       VALUES (@key, @value, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`);
        stmt.run({ key, value: JSON.stringify(value) });
    }
    hasDownloaded(pixivId, type) {
        const stmt = this.db.prepare(`SELECT 1 FROM downloads WHERE pixiv_id = ? AND type = ? LIMIT 1`);
        const row = stmt.get(pixivId, type);
        return !!row;
    }
    /**
     * Batch check if multiple items are already downloaded
     * Returns a Set of pixivIds that are already downloaded
     * Optimized for large batches by chunking queries
     */
    getDownloadedIds(pixivIds, type) {
        if (pixivIds.length === 0) {
            return new Set();
        }
        // SQLite has a limit on the number of parameters (default 999)
        // Chunk large arrays to avoid hitting this limit
        const CHUNK_SIZE = 500;
        const downloadedSet = new Set();
        try {
            for (let i = 0; i < pixivIds.length; i += CHUNK_SIZE) {
                const chunk = pixivIds.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => '?').join(',');
                const stmt = this.db.prepare(`SELECT pixiv_id FROM downloads WHERE pixiv_id IN (${placeholders}) AND type = ?`);
                const rows = stmt.all(...chunk, type);
                rows.forEach(row => downloadedSet.add(row.pixiv_id));
            }
        }
        catch (error) {
            logger_1.logger.warn('Error checking downloaded IDs', {
                error: error instanceof Error ? error.message : String(error),
                type,
                count: pixivIds.length,
            });
            // Return empty set on error to allow downloads to proceed
        }
        return downloadedSet;
    }
    insertDownload(record) {
        const stmt = this.db.prepare(`INSERT OR IGNORE INTO downloads (pixiv_id, type, tag, title, file_path, author, user_id)
       VALUES (@pixiv_id, @type, @tag, @title, @file_path, @author, @user_id)`);
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
     * Update file path in database
     */
    updateFilePath(pixivId, type, oldPath, newPath) {
        const stmt = this.db.prepare(`UPDATE downloads 
       SET file_path = ? 
       WHERE pixiv_id = ? AND type = ? AND file_path = ?`);
        const result = stmt.run(newPath, pixivId, type, oldPath);
        return result.changes;
    }
    logExecution(tag, type, status, message) {
        const stmt = this.db.prepare(`INSERT INTO execution_log (tag, type, status, message)
       VALUES (@tag, @type, @status, @message)`);
        stmt.run({
            tag,
            type,
            status,
            message: message ?? null,
        });
    }
    /**
     * Get incomplete tasks (failed or partial executions)
     */
    getIncompleteTasks(limit = 50) {
        const stmt = this.db.prepare(`SELECT id, tag, type, status, message, executed_at
       FROM execution_log
       WHERE status IN ('failed', 'partial')
       ORDER BY executed_at DESC
       LIMIT ?`);
        const rows = stmt.all(limit);
        return rows.map(row => ({
            id: row.id,
            tag: row.tag,
            type: row.type,
            status: row.status,
            message: row.message,
            executedAt: row.executed_at,
        }));
    }
    /**
     * Delete an incomplete task by id
     * Returns an object with success status and message
     */
    deleteIncompleteTask(id) {
        try {
            // Validate input
            if (!Number.isInteger(id) || id <= 0) {
                return { success: false, message: `Invalid task ID: ${id} (must be a positive integer)` };
            }
            // Use a transaction to ensure atomicity
            const transaction = this.db.transaction(() => {
                // First check if the task exists and get its status
                const checkStmt = this.db.prepare(`SELECT id, status, tag, type FROM execution_log WHERE id = ?`);
                const task = checkStmt.get(id);
                if (!task) {
                    throw new Error(`Task not found (ID: ${id})`);
                }
                // Check if the task is in a deletable state
                if (task.status !== 'failed' && task.status !== 'partial') {
                    throw new Error(`Task cannot be deleted: status is '${task.status}' (only 'failed' or 'partial' tasks can be deleted)`);
                }
                // Delete the task
                const deleteStmt = this.db.prepare(`DELETE FROM execution_log 
           WHERE id = ? AND status IN ('failed', 'partial')`);
                const result = deleteStmt.run(id);
                if (result.changes === 0) {
                    throw new Error(`Failed to delete task: no rows affected (task may have been deleted or status changed)`);
                }
                return { success: true, task };
            });
            const result = transaction();
            logger_1.logger.info('Successfully deleted incomplete task', {
                taskId: id,
                tag: result.task.tag,
                type: result.task.type
            });
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger_1.logger.error('Failed to delete incomplete task', {
                taskId: id,
                error: errorMessage
            });
            return {
                success: false,
                message: errorMessage
            };
        }
    }
    /**
     * Delete all incomplete tasks (failed or partial)
     * Returns an object with success status, deleted count, and message
     */
    deleteAllIncompleteTasks() {
        try {
            // Use a transaction to ensure atomicity
            const transaction = this.db.transaction(() => {
                // First get count of tasks to be deleted
                const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM execution_log WHERE status IN ('failed', 'partial')`);
                const countResult = countStmt.get();
                const count = countResult.count;
                if (count === 0) {
                    return { success: true, deletedCount: 0 };
                }
                // Delete all incomplete tasks
                const deleteStmt = this.db.prepare(`DELETE FROM execution_log WHERE status IN ('failed', 'partial')`);
                const result = deleteStmt.run();
                return { success: true, deletedCount: result.changes };
            });
            const result = transaction();
            logger_1.logger.info('Successfully deleted all incomplete tasks', {
                deletedCount: result.deletedCount
            });
            return {
                success: true,
                deletedCount: result.deletedCount
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger_1.logger.error('Failed to delete all incomplete tasks', {
                error: errorMessage
            });
            return {
                success: false,
                deletedCount: 0,
                message: errorMessage
            };
        }
    }
    /**
     * Get the next execution number for the scheduler
     */
    getNextExecutionNumber() {
        const stmt = this.db.prepare(`SELECT COALESCE(MAX(execution_number), 0) + 1 as next FROM scheduler_executions`);
        const row = stmt.get();
        return row.next;
    }
    /**
     * Log a scheduler execution
     */
    logSchedulerExecution(executionNumber, status, startTime, endTime, durationMs, errorMessage, itemsDownloaded = 0) {
        const stmt = this.db.prepare(`INSERT INTO scheduler_executions 
       (execution_number, status, start_time, end_time, duration_ms, error_message, items_downloaded)
       VALUES (@execution_number, @status, @start_time, @end_time, @duration_ms, @error_message, @items_downloaded)`);
        stmt.run({
            execution_number: executionNumber,
            status,
            start_time: startTime.toISOString(),
            end_time: endTime?.toISOString() ?? null,
            duration_ms: durationMs ?? null,
            error_message: errorMessage ?? null,
            items_downloaded: itemsDownloaded,
        });
    }
    /**
     * Get scheduler execution statistics
     */
    getSchedulerStats() {
        const statsStmt = this.db.prepare(`SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' OR status = 'timeout' THEN 1 ELSE 0 END) as failed,
        MAX(start_time) as last_execution,
        AVG(duration_ms) as avg_duration,
        SUM(items_downloaded) as total_items
       FROM scheduler_executions`);
        const row = statsStmt.get();
        return {
            totalExecutions: row.total ?? 0,
            successfulExecutions: row.successful ?? 0,
            failedExecutions: row.failed ?? 0,
            lastExecutionTime: row.last_execution,
            averageDuration: row.avg_duration ? Math.round(row.avg_duration) : null,
            totalItemsDownloaded: row.total_items ?? 0,
        };
    }
    /**
     * Get recent scheduler executions
     */
    getRecentSchedulerExecutions(limit = 10) {
        const stmt = this.db.prepare(`SELECT 
        id,
        execution_number,
        status,
        start_time,
        end_time,
        duration_ms,
        error_message,
        items_downloaded
       FROM scheduler_executions
       ORDER BY execution_number DESC
       LIMIT ?`);
        const rows = stmt.all(limit);
        return rows.map((row) => ({
            id: row.id,
            executionNumber: row.execution_number,
            status: row.status,
            startTime: row.start_time,
            endTime: row.end_time,
            duration: row.duration_ms,
            errorMessage: row.error_message,
            itemsDownloaded: row.items_downloaded,
        }));
    }
    /**
     * Get consecutive failure count
     */
    getConsecutiveFailures() {
        const stmt = this.db.prepare(`SELECT status FROM scheduler_executions 
       ORDER BY execution_number DESC 
       LIMIT 100`);
        const rows = stmt.all();
        let count = 0;
        for (const row of rows) {
            if (row.status === 'failed' || row.status === 'timeout') {
                count++;
            }
            else {
                break;
            }
        }
        return count;
    }
    /**
     * Get download history with pagination and filtering
     */
    getDownloadHistory(options) {
        const { page = 1, limit = 20, type, tag, author, startDate, endDate, sortBy = 'downloadedAt', sortOrder = 'desc' } = options;
        // Build query
        let whereClause = '1=1';
        const params = [];
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
        const sortColumnMap = {
            downloadedAt: 'downloaded_at',
            title: 'title',
            author: 'author',
            pixivId: 'pixiv_id',
        };
        const sortColumn = sortColumnMap[sortBy] || 'downloaded_at';
        const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        // Get total count
        const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM downloads WHERE ${whereClause}`);
        const countRow = countStmt.get(...params);
        const total = countRow.total || 0;
        // Get paginated results
        const offset = (Number(page) - 1) * Number(limit);
        const stmt = this.db.prepare(`SELECT * FROM downloads 
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${orderDirection}
       LIMIT ? OFFSET ?`);
        const items = stmt.all(...params, Number(limit), offset);
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
     * Get overview statistics
     */
    getOverviewStats() {
        // Get total downloads
        const totalStmt = this.db.prepare('SELECT COUNT(*) as total FROM downloads');
        const totalRow = totalStmt.get();
        const totalDownloads = totalRow.total || 0;
        // Get downloads by type
        const illustrationsStmt = this.db.prepare("SELECT COUNT(*) as total FROM downloads WHERE type = 'illustration'");
        const illustrationsRow = illustrationsStmt.get();
        const illustrations = illustrationsRow.total || 0;
        const novelsStmt = this.db.prepare("SELECT COUNT(*) as total FROM downloads WHERE type = 'novel'");
        const novelsRow = novelsStmt.get();
        const novels = novelsRow.total || 0;
        // Get recent downloads (last 7 days)
        const recentStmt = this.db.prepare(`SELECT COUNT(*) as total FROM downloads 
       WHERE downloaded_at >= datetime('now', '-7 days')`);
        const recentRow = recentStmt.get();
        const recentDownloads = recentRow.total || 0;
        return {
            totalDownloads,
            illustrations,
            novels,
            recentDownloads,
        };
    }
    /**
     * Get downloads by period
     */
    getDownloadsByPeriod(days) {
        const stmt = this.db.prepare(`SELECT * FROM downloads 
       WHERE downloaded_at >= datetime('now', '-${days} days')
       ORDER BY downloaded_at DESC`);
        return stmt.all();
    }
    /**
     * Get tag statistics
     */
    getTagStats(limit = 10) {
        const stmt = this.db.prepare(`SELECT tag, COUNT(*) as count 
       FROM downloads 
       GROUP BY tag 
       ORDER BY count DESC 
       LIMIT ?`);
        const tags = stmt.all(limit);
        return tags.map(t => ({ name: t.tag, count: t.count }));
    }
    /**
     * Get author statistics
     */
    getAuthorStats(limit = 10) {
        const stmt = this.db.prepare(`SELECT author, COUNT(*) as count 
       FROM downloads 
       WHERE author IS NOT NULL
       GROUP BY author 
       ORDER BY count DESC 
       LIMIT ?`);
        const authors = stmt.all(limit);
        return authors.map(a => ({ name: a.author, count: a.count }));
    }
    close() {
        this.db.close();
    }
}
exports.Database = Database;
//# sourceMappingURL=Database.js.map