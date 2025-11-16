import { BaseRepository } from './BaseRepository';
import { logger } from '../../logger';

export interface TaskHistoryRecord {
  id: number;
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  startTime: string;
  endTime: string | null;
  error: string | null;
  targetId: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  progressMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Repository for managing task history
 */
export class TaskHistoryRepository extends BaseRepository {
  /**
   * Save or update a task history record
   */
  public saveTaskHistory(taskId: string, data: {
    status: 'running' | 'completed' | 'failed' | 'stopped';
    startTime: Date;
    endTime?: Date;
    error?: string;
    targetId?: string;
    progressCurrent?: number;
    progressTotal?: number;
    progressMessage?: string;
  }): void {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO task_history (
          task_id, status, start_time, end_time, error, target_id,
          progress_current, progress_total, progress_message, updated_at
        ) VALUES (
          @taskId, @status, @startTime, @endTime, @error, @targetId,
          @progressCurrent, @progressTotal, @progressMessage, CURRENT_TIMESTAMP
        )
        ON CONFLICT(task_id) DO UPDATE SET
          status = @status,
          end_time = @endTime,
          error = @error,
          target_id = @targetId,
          progress_current = @progressCurrent,
          progress_total = @progressTotal,
          progress_message = @progressMessage,
          updated_at = CURRENT_TIMESTAMP`
      );

      stmt.run({
        taskId,
        status: data.status,
        startTime: data.startTime.toISOString(),
        endTime: data.endTime?.toISOString() || null,
        error: data.error || null,
        targetId: data.targetId || null,
        progressCurrent: data.progressCurrent ?? null,
        progressTotal: data.progressTotal ?? null,
        progressMessage: data.progressMessage || null,
      });
    } catch (error) {
      logger.error('Failed to save task history', { taskId, error });
      // Don't throw - task history is not critical
    }
  }

  /**
   * Get task history by task ID
   */
  public getTaskHistory(taskId: string): TaskHistoryRecord | null {
    try {
      const stmt = this.db.prepare(
        `SELECT * FROM task_history WHERE task_id = ?`
      );
      const row = stmt.get(taskId) as any;
      
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        taskId: row.task_id,
        status: row.status,
        startTime: row.start_time,
        endTime: row.end_time,
        error: row.error,
        targetId: row.target_id,
        progressCurrent: row.progress_current,
        progressTotal: row.progress_total,
        progressMessage: row.progress_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error('Failed to get task history', { taskId, error });
      return null;
    }
  }

  /**
   * Get all task history records, sorted by start time (newest first)
   */
  public getAllTaskHistory(limit: number = 100): TaskHistoryRecord[] {
    try {
      const stmt = this.db.prepare(
        `SELECT * FROM task_history 
         ORDER BY start_time DESC 
         LIMIT ?`
      );
      const rows = stmt.all(limit) as any[];

      return rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        status: row.status,
        startTime: row.start_time,
        endTime: row.end_time,
        error: row.error,
        targetId: row.target_id,
        progressCurrent: row.progress_current,
        progressTotal: row.progress_total,
        progressMessage: row.progress_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error('Failed to get all task history', { error });
      return [];
    }
  }

  /**
   * Delete a task history record by task ID
   */
  public deleteTaskHistory(taskId: string): { success: boolean; message?: string } {
    try {
      const stmt = this.db.prepare(
        `DELETE FROM task_history WHERE task_id = ?`
      );
      const result = stmt.run(taskId);
      
      if (result.changes === 0) {
        return { success: false, message: `Task history not found: ${taskId}` };
      }
      
      logger.info('Successfully deleted task history', { taskId });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to delete task history', { taskId, error: errorMessage });
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Delete all task history records
   */
  public deleteAllTaskHistory(): { success: boolean; deletedCount: number; message?: string } {
    try {
      // First get count
      const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM task_history`);
      const countResult = countStmt.get() as { count: number };
      const count = countResult.count;
      
      if (count === 0) {
        return { success: true, deletedCount: 0 };
      }
      
      // Delete all records
      const stmt = this.db.prepare(`DELETE FROM task_history`);
      const result = stmt.run();
      
      logger.info('Successfully deleted all task history', { deletedCount: result.changes });
      return { success: true, deletedCount: result.changes };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to delete all task history', { error: errorMessage });
      return { success: false, deletedCount: 0, message: errorMessage };
    }
  }

  /**
   * Delete old task history records (keep only the most recent N records)
   */
  public cleanupOldTaskHistory(keepCount: number = 100): number {
    try {
      const stmt = this.db.prepare(
        `DELETE FROM task_history 
         WHERE id NOT IN (
           SELECT id FROM task_history 
           ORDER BY start_time DESC 
           LIMIT ?
         )`
      );
      const result = stmt.run(keepCount);
      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup old task history', { error });
      return 0;
    }
  }
}

