import { BaseRepository } from './BaseRepository';
import { ExecutionStatus } from '../Database';
import { logger } from '../../logger';

/**
 * Repository for managing execution logs
 */
export class ExecutionRepository extends BaseRepository {
  /**
   * Log an execution
   */
  public logExecution(tag: string, type: 'illustration' | 'novel', status: ExecutionStatus, message?: string): void {
    const stmt = this.db.prepare(
      `INSERT INTO execution_log (tag, type, status, message)
       VALUES (@tag, @type, @status, @message)`
    );

    stmt.run({
      tag,
      type,
      status,
      message: message ?? null,
    });
  }

  /**
   * Record execution log (alias for logExecution)
   */
  public recordExecutionLog(
    tag: string,
    type: 'illustration' | 'novel',
    status: ExecutionStatus,
    message?: string
  ): void {
    this.logExecution(tag, type, status, message);
  }

  /**
   * Get incomplete tasks (failed or partial executions)
   */
  public getIncompleteTasks(limit: number = 50): Array<{
    id: number;
    tag: string;
    type: 'illustration' | 'novel';
    status: ExecutionStatus;
    message: string | null;
    executedAt: string;
  }> {
    const stmt = this.db.prepare(
      `SELECT id, tag, type, status, message, executed_at
       FROM execution_log
       WHERE status IN ('failed', 'partial')
       ORDER BY executed_at DESC
       LIMIT ?`
    );

    const rows = stmt.all(limit) as Array<{
      id: number;
      tag: string;
      type: string;
      status: string;
      message: string | null;
      executed_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      tag: row.tag,
      type: row.type as 'illustration' | 'novel',
      status: row.status as ExecutionStatus,
      message: row.message,
      executedAt: row.executed_at,
    }));
  }

  /**
   * Delete an incomplete task by id
   * Returns an object with success status and message
   */
  public deleteIncompleteTask(id: number): { success: boolean; message?: string } {
    try {
      // Validate input
      if (!Number.isInteger(id) || id <= 0) {
        return { success: false, message: `Invalid task ID: ${id} (must be a positive integer)` };
      }

      // Use a transaction to ensure atomicity
      const transaction = this.db.transaction(() => {
        // First check if the task exists and get its status
        const checkStmt = this.db.prepare(
          `SELECT id, status, tag, type FROM execution_log WHERE id = ?`
        );
        const task = checkStmt.get(id) as { 
          id: number; 
          status: string; 
          tag: string; 
          type: string;
        } | undefined;
        
        if (!task) {
          throw new Error(`Task not found (ID: ${id})`);
        }
        
        // Check if the task is in a deletable state
        if (task.status !== 'failed' && task.status !== 'partial') {
          throw new Error(
            `Task cannot be deleted: status is '${task.status}' (only 'failed' or 'partial' tasks can be deleted)`
          );
        }
        
        // Delete the task
        const deleteStmt = this.db.prepare(
          `DELETE FROM execution_log 
           WHERE id = ? AND status IN ('failed', 'partial')`
        );
        const result = deleteStmt.run(id);
        
        if (result.changes === 0) {
          throw new Error(
            `Failed to delete task: no rows affected (task may have been deleted or status changed)`
          );
        }
        
        return { success: true, task };
      });

      const result = transaction();
      logger.info('Successfully deleted incomplete task', { 
        taskId: id, 
        tag: result.task.tag, 
        type: result.task.type 
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to delete incomplete task', { 
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
  public deleteAllIncompleteTasks(): { success: boolean; deletedCount: number; message?: string } {
    try {
      // Use a transaction to ensure atomicity
      const transaction = this.db.transaction(() => {
        // First get count of tasks to be deleted
        const countStmt = this.db.prepare(
          `SELECT COUNT(*) as count FROM execution_log WHERE status IN ('failed', 'partial')`
        );
        const countResult = countStmt.get() as { count: number };
        const count = countResult.count;
        
        if (count === 0) {
          return { success: true, deletedCount: 0 };
        }
        
        // Delete all incomplete tasks
        const deleteStmt = this.db.prepare(
          `DELETE FROM execution_log WHERE status IN ('failed', 'partial')`
        );
        const result = deleteStmt.run();
        
        return { success: true, deletedCount: result.changes };
      });

      const result = transaction();
      logger.info('Successfully deleted all incomplete tasks', { 
        deletedCount: result.deletedCount 
      });
      return { 
        success: true, 
        deletedCount: result.deletedCount 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to delete all incomplete tasks', { 
        error: errorMessage 
      });
      return { 
        success: false, 
        deletedCount: 0,
        message: errorMessage 
      };
    }
  }
}















































