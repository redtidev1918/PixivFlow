import { logger } from '../logger';
import { PixivIllust, PixivNovel } from '../pixiv/PixivClient';

/**
 * Calculate popularity score for an illustration or novel
 * 
 * Uses bookmarks as primary metric, views as secondary metric.
 * Handles missing or invalid values gracefully.
 * 
 * @param item - Pixiv illustration or novel item
 * @returns Popularity score (higher is more popular)
 * 
 * @example
 * ```typescript
 * const score = calculatePopularityScore(illust);
 * // Returns: bookmarks + (views / 1000)
 * ```
 */
export function calculatePopularityScore(item: PixivIllust | PixivNovel): number {
  // Safely extract numeric values, defaulting to 0
  const bookmarks = Number(item.total_bookmarks ?? item.bookmark_count ?? 0);
  const views = Number(item.total_view ?? item.view_count ?? 0);
  
  // Ensure values are valid numbers (not NaN or negative)
  const safeBookmarks = isNaN(bookmarks) || bookmarks < 0 ? 0 : bookmarks;
  const safeViews = isNaN(views) || views < 0 ? 0 : views;
  
  // Combined score: bookmarks are primary, views are secondary (divide by 1000 to normalize)
  return safeBookmarks + (safeViews / 1000);
}

/**
 * Safely parse Pixiv date string to timestamp
 * 
 * Returns 0 for invalid dates to ensure consistent sorting.
 * Logs a warning for invalid dates.
 * 
 * @param dateString - Date string from Pixiv API (ISO format)
 * @returns Timestamp in milliseconds, or 0 if invalid
 * 
 * @example
 * ```typescript
 * const timestamp = parsePixivDate('2024-01-01T00:00:00+09:00');
 * // Returns: 1704067200000
 * ```
 */
export function parsePixivDate(dateString: string | undefined | null): number {
  if (!dateString || typeof dateString !== 'string') {
    return 0;
  }
  const date = new Date(dateString);
  const timestamp = date.getTime();
  // Check if date is valid (not NaN)
  if (isNaN(timestamp)) {
    logger.warn('Invalid date string encountered', { dateString });
    return 0;
  }
  return timestamp;
}

