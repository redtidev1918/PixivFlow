/**
 * Pixiv item sorting utilities
 */

import { logger } from '../logger';
import { parsePixivDate, calculatePopularityScore } from './pixiv-utils';
import type { PixivIllust, PixivNovel } from '../pixiv/types';

export type SortMode = 'date_desc' | 'date_asc' | 'popular_desc';

/**
 * Sort items based on sort parameter
 * Uses stable sorting with ID as secondary key to ensure consistent ordering
 */
export function sortPixivItems<T extends PixivIllust | PixivNovel>(
  items: T[],
  sort?: SortMode
): T[] {
  if (!items || items.length === 0) {
    return items;
  }

  // Create a copy to avoid mutating the original array
  const sortedItems = [...items];

  if (!sort || sort === 'date_desc') {
    // Default: sort by date descending (newest first)
    // Use ID as secondary key for stable sorting
    sortedItems.sort((a, b) => {
      const dateA = parsePixivDate(a.create_date);
      const dateB = parsePixivDate(b.create_date);
      
      // Primary sort: by date
      if (dateA !== dateB) {
        return dateB - dateA; // Descending order
      }
      
      // Secondary sort: by ID (for stable sorting when dates are equal)
      return b.id - a.id;
    });
  } else if (sort === 'date_asc') {
    // Sort by date ascending (oldest first)
    sortedItems.sort((a, b) => {
      const dateA = parsePixivDate(a.create_date);
      const dateB = parsePixivDate(b.create_date);
      
      // Primary sort: by date
      if (dateA !== dateB) {
        return dateA - dateB; // Ascending order
      }
      
      // Secondary sort: by ID (for stable sorting when dates are equal)
      return a.id - b.id;
    });
  } else if (sort === 'popular_desc') {
    // Sort by popularity descending (most popular first)
    sortedItems.sort((a, b) => {
      const scoreA = calculatePopularityScore(a);
      const scoreB = calculatePopularityScore(b);
      
      // Primary sort: by popularity score
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Descending order
      }
      
      // Secondary sort: by date (newest first when popularity is equal)
      const dateA = parsePixivDate(a.create_date);
      const dateB = parsePixivDate(b.create_date);
      if (dateA !== dateB) {
        return dateB - dateA;
      }
      
      // Tertiary sort: by ID (for stable sorting)
      return b.id - a.id;
    });
  }

  // Log sorting statistics for debugging
  const invalidDates = sortedItems.filter(item => !item.create_date || parsePixivDate(item.create_date) === 0).length;
  if (invalidDates > 0) {
    logger.debug('Sorting completed with some invalid dates', { 
      totalItems: sortedItems.length, 
      invalidDates,
      sortType: sort || 'date_desc'
    });
  }

  return sortedItems;
}










































