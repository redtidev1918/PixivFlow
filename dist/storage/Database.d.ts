export interface AccessTokenStore {
    accessToken: string;
    expiresAt: number;
    refreshToken?: string;
    tokenType: string;
}
export interface DownloadRecordInput {
    pixivId: string;
    type: 'illustration' | 'novel';
    tag: string;
    title: string;
    filePath: string;
    userId?: string;
    author?: string;
}
export type ExecutionStatus = 'success' | 'partial' | 'failed';
export interface SchedulerExecutionRecord {
    id: number;
    executionNumber: number;
    status: 'success' | 'failed' | 'timeout' | 'skipped';
    startTime: string;
    endTime: string | null;
    duration: number | null;
    errorMessage: string | null;
    itemsDownloaded: number;
}
export declare class Database {
    private readonly databasePath;
    private db;
    constructor(databasePath: string);
    migrate(): void;
    getToken(key: string): AccessTokenStore | null;
    setToken(key: string, value: AccessTokenStore): void;
    hasDownloaded(pixivId: string, type: 'illustration' | 'novel'): boolean;
    /**
     * Batch check if multiple items are already downloaded
     * Returns a Set of pixivIds that are already downloaded
     * Optimized for large batches by chunking queries
     */
    getDownloadedIds(pixivIds: string[], type: 'illustration' | 'novel'): Set<string>;
    insertDownload(record: DownloadRecordInput): void;
    /**
     * Update file path in database
     */
    updateFilePath(pixivId: string, type: 'illustration' | 'novel', oldPath: string, newPath: string): number;
    logExecution(tag: string, type: 'illustration' | 'novel', status: ExecutionStatus, message?: string): void;
    /**
     * Get incomplete tasks (failed or partial executions)
     */
    getIncompleteTasks(limit?: number): Array<{
        id: number;
        tag: string;
        type: 'illustration' | 'novel';
        status: ExecutionStatus;
        message: string | null;
        executedAt: string;
    }>;
    /**
     * Delete an incomplete task by id
     * Returns an object with success status and message
     */
    deleteIncompleteTask(id: number): {
        success: boolean;
        message?: string;
    };
    /**
     * Delete all incomplete tasks (failed or partial)
     * Returns an object with success status, deleted count, and message
     */
    deleteAllIncompleteTasks(): {
        success: boolean;
        deletedCount: number;
        message?: string;
    };
    /**
     * Get the next execution number for the scheduler
     */
    getNextExecutionNumber(): number;
    /**
     * Log a scheduler execution
     */
    logSchedulerExecution(executionNumber: number, status: 'success' | 'failed' | 'timeout' | 'skipped', startTime: Date, endTime: Date | null, durationMs: number | null, errorMessage: string | null, itemsDownloaded?: number): void;
    /**
     * Get scheduler execution statistics
     */
    getSchedulerStats(): {
        totalExecutions: number;
        successfulExecutions: number;
        failedExecutions: number;
        lastExecutionTime: string | null;
        averageDuration: number | null;
        totalItemsDownloaded: number;
    };
    /**
     * Get recent scheduler executions
     */
    getRecentSchedulerExecutions(limit?: number): SchedulerExecutionRecord[];
    /**
     * Get consecutive failure count
     */
    getConsecutiveFailures(): number;
    /**
     * Get download history with pagination and filtering
     */
    getDownloadHistory(options: {
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
    };
    /**
     * Get overview statistics
     */
    getOverviewStats(): {
        totalDownloads: number;
        illustrations: number;
        novels: number;
        recentDownloads: number;
    };
    /**
     * Get downloads by period
     */
    getDownloadsByPeriod(days: number): Array<{
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
    /**
     * Get tag statistics
     */
    getTagStats(limit?: number): Array<{
        name: string;
        count: number;
    }>;
    /**
     * Get author statistics
     */
    getAuthorStats(limit?: number): Array<{
        name: string;
        count: number;
    }>;
    close(): void;
}
//# sourceMappingURL=Database.d.ts.map