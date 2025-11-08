/**
 * Parse date string in YYYY-MM-DD format to Date object
 * Uses UTC timezone to avoid timezone issues
 * Returns null if date is invalid
 */
export declare function parseDateString(dateString: string | undefined | null): Date | null;
/**
 * Parse date range from target config
 * Returns { startDate, endDate } as Date objects, or null if invalid
 * Validates that startDate <= endDate
 */
export declare function parseDateRange(startDateStr: string | undefined | null, endDateStr: string | undefined | null): {
    startDate: Date | null;
    endDate: Date | null;
} | null;
/**
 * Check if item date is within the specified range
 * Handles invalid dates gracefully
 */
export declare function isDateInRange(itemDate: Date | null, startDate: Date | null, endDate: Date | null): boolean;
//# sourceMappingURL=date-utils.d.ts.map