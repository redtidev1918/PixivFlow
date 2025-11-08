"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDateString = parseDateString;
exports.parseDateRange = parseDateRange;
exports.isDateInRange = isDateInRange;
const logger_1 = require("../logger");
/**
 * Parse date string in YYYY-MM-DD format to Date object
 * Uses UTC timezone to avoid timezone issues
 * Returns null if date is invalid
 */
function parseDateString(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
        logger_1.logger.warn('Invalid date format, expected YYYY-MM-DD', { dateString });
        return null;
    }
    // Parse date components
    const parts = dateString.split('-');
    if (parts.length !== 3) {
        logger_1.logger.warn('Invalid date format, expected YYYY-MM-DD', { dateString });
        return null;
    }
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const day = parseInt(parts[2], 10);
    // Validate date components
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        logger_1.logger.warn('Invalid date components', { dateString, year, month: month + 1, day });
        return null;
    }
    // Create date in UTC to avoid timezone issues
    const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    // Verify the date is valid (handles invalid dates like 2024-02-30)
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
        logger_1.logger.warn('Invalid date (out of range)', { dateString, year, month: month + 1, day });
        return null;
    }
    return date;
}
/**
 * Parse date range from target config
 * Returns { startDate, endDate } as Date objects, or null if invalid
 * Validates that startDate <= endDate
 */
function parseDateRange(startDateStr, endDateStr) {
    const startDate = startDateStr ? parseDateString(startDateStr) : null;
    const endDate = endDateStr ? parseDateString(endDateStr) : null;
    // Validate date range
    if (startDate && endDate && startDate > endDate) {
        logger_1.logger.error('Invalid date range: startDate must be <= endDate', {
            startDate: startDateStr,
            endDate: endDateStr
        });
        return null;
    }
    // For endDate, set time to 23:59:59.999 UTC to include the entire day
    if (endDate) {
        endDate.setUTCHours(23, 59, 59, 999);
    }
    return { startDate, endDate };
}
/**
 * Check if item date is within the specified range
 * Handles invalid dates gracefully
 */
function isDateInRange(itemDate, startDate, endDate) {
    if (!itemDate || isNaN(itemDate.getTime())) {
        return false; // Invalid date, exclude from range
    }
    if (startDate && itemDate < startDate) {
        return false;
    }
    if (endDate && itemDate > endDate) {
        return false;
    }
    return true;
}
//# sourceMappingURL=date-utils.js.map