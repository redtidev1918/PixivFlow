import { BaseRepository } from './BaseRepository';
import { SchedulerExecutionRecord } from '../Database';

/**
 * Repository for managing scheduler execution records
 */
export class SchedulerRepository extends BaseRepository {
  /**
   * Get the next execution number for the scheduler
   */
  public getNextExecutionNumber(): number {
    const stmt = this.db.prepare(
      `SELECT COALESCE(MAX(execution_number), 0) + 1 as next FROM scheduler_executions`
    );
    const row = stmt.get() as { next: number };
    return row.next;
  }

  /**
   * Log a scheduler execution
   */
  public logSchedulerExecution(
    executionNumber: number,
    status: 'success' | 'failed' | 'timeout' | 'skipped',
    startTime: Date,
    endTime: Date | null,
    durationMs: number | null,
    errorMessage: string | null,
    itemsDownloaded: number = 0
  ): void {
    const stmt = this.db.prepare(
      `INSERT INTO scheduler_executions 
       (execution_number, status, start_time, end_time, duration_ms, error_message, items_downloaded)
       VALUES (@execution_number, @status, @start_time, @end_time, @duration_ms, @error_message, @items_downloaded)`
    );

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
   * Record scheduler execution (alias for logSchedulerExecution)
   */
  public recordSchedulerExecution(
    executionNumber: number,
    status: 'success' | 'failed' | 'timeout' | 'skipped',
    startTime: Date,
    endTime: Date | null,
    duration: number | null,
    errorMessage: string | null,
    itemsDownloaded: number
  ): void {
    this.logSchedulerExecution(
      executionNumber,
      status,
      startTime,
      endTime,
      duration,
      errorMessage,
      itemsDownloaded
    );
  }

  /**
   * Get scheduler execution statistics
   */
  public getSchedulerStats(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    lastExecutionTime: string | null;
    averageDuration: number | null;
    totalItemsDownloaded: number;
  } {
    const statsStmt = this.db.prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' OR status = 'timeout' THEN 1 ELSE 0 END) as failed,
        MAX(start_time) as last_execution,
        AVG(duration_ms) as avg_duration,
        SUM(items_downloaded) as total_items
       FROM scheduler_executions`
    );

    const row = statsStmt.get() as {
      total: number;
      successful: number;
      failed: number;
      last_execution: string | null;
      avg_duration: number | null;
      total_items: number;
    };

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
  public getRecentSchedulerExecutions(limit: number = 10): SchedulerExecutionRecord[] {
    const stmt = this.db.prepare(
      `SELECT 
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
       LIMIT ?`
    );

    const rows = stmt.all(limit) as Array<{
      id: number;
      execution_number: number;
      status: string;
      start_time: string;
      end_time: string | null;
      duration_ms: number | null;
      error_message: string | null;
      items_downloaded: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      executionNumber: row.execution_number,
      status: row.status as 'success' | 'failed' | 'timeout' | 'skipped',
      startTime: row.start_time,
      endTime: row.end_time,
      duration: row.duration_ms,
      errorMessage: row.error_message,
      itemsDownloaded: row.items_downloaded,
    }));
  }

  /**
   * Get scheduler executions (alias for getRecentSchedulerExecutions)
   */
  public getSchedulerExecutions(limit?: number): SchedulerExecutionRecord[] {
    return this.getRecentSchedulerExecutions(limit || 10);
  }

  /**
   * Get consecutive failure count
   */
  public getConsecutiveFailures(): number {
    const stmt = this.db.prepare(
      `SELECT status FROM scheduler_executions 
       ORDER BY execution_number DESC 
       LIMIT 100`
    );

    const rows = stmt.all() as Array<{ status: string }>;
    let count = 0;

    for (const row of rows) {
      if (row.status === 'failed' || row.status === 'timeout') {
        count++;
      } else {
        break;
      }
    }

    return count;
  }
}

























