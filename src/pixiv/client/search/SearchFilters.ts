import type { PixivIllust, PixivNovel } from '../../types';
import { parseDateRange, isDateInRange } from '../../../utils/date-utils';
import { logger } from '../../../logger';
import type { TargetConfig } from '../../../config';

/**
 * Filter utilities for search results based on date range and sort mode.
 */
export class SearchFilters {
  /**
   * Check if an item should be included based on date range and sort mode.
   * Returns { shouldInclude, shouldStop } where shouldStop indicates if we should stop fetching more pages.
   */
  static filterItemByDate<T extends PixivIllust | PixivNovel>(
    item: T,
    target: TargetConfig,
    startDate: Date | null,
    endDate: Date | null,
    sortMode: string
  ): { shouldInclude: boolean; shouldStop: boolean } {
    const itemDate = item.create_date ? new Date(item.create_date) : null;
    
    // Handle invalid dates
    if (!itemDate || isNaN(itemDate.getTime())) {
      if (!startDate && !endDate) {
        return { shouldInclude: true, shouldStop: false };
      } else {
        logger.debug(`Skipping item ${item.id} with invalid date ${item.create_date}`);
        return { shouldInclude: false, shouldStop: false };
      }
    }

    const inRange = isDateInRange(itemDate, startDate, endDate);

    // Handle different sort modes
    if (sortMode === 'date_desc') {
      if (!inRange) {
        if (endDate && itemDate > endDate) {
          logger.debug(`Skipping item ${item.id} with date ${item.create_date} after endDate ${target.endDate}`);
          return { shouldInclude: false, shouldStop: false };
        }
        if (startDate && itemDate < startDate) {
          logger.debug(
            `Stopping search: encountered item ${item.id} with date ${item.create_date} before startDate ${target.startDate}`
          );
          return { shouldInclude: false, shouldStop: true };
        }
      }
    } else if (sortMode === 'date_asc') {
      if (!inRange) {
        if (startDate && itemDate < startDate) {
          logger.debug(`Skipping item ${item.id} with date ${item.create_date} before startDate ${target.startDate}`);
          return { shouldInclude: false, shouldStop: false };
        }
        if (endDate && itemDate > endDate) {
          logger.debug(
            `Stopping search: encountered item ${item.id} with date ${item.create_date} after endDate ${target.endDate}`
          );
          return { shouldInclude: false, shouldStop: true };
        }
      }
    } else if (sortMode === 'popular_desc') {
      if (!inRange) {
        logger.debug(`Skipping item ${item.id} with date ${item.create_date} outside date range (popular_desc mode)`);
        return { shouldInclude: false, shouldStop: false };
      }
    }

    return { shouldInclude: inRange || (!startDate && !endDate), shouldStop: false };
  }

  /**
   * Calculate fetch limit based on target limit and sort mode.
   */
  static calculateFetchLimit(target: TargetConfig, sortMode: string, hasDateFilter: boolean): number | undefined {
    if (!target.limit) {
      return undefined;
    }

    if (target.limit < 50) {
      return Math.max(
        target.limit * (sortMode === 'popular_desc' && hasDateFilter ? 10 : 5),
        100
      );
    }

    return Math.max(
      target.limit * (sortMode === 'popular_desc' && hasDateFilter ? 3 : 2),
      200
    );
  }

  /**
   * Parse date range from target config.
   */
  static parseDateRangeFromTarget(target: TargetConfig): { startDate: Date | null; endDate: Date | null } | null {
    const dateRange = parseDateRange(target.startDate, target.endDate);
    if (dateRange === null && (target.startDate || target.endDate)) {
      logger.warn('Invalid date range specified, returning empty results', {
        startDate: target.startDate,
        endDate: target.endDate,
      });
      return null;
    }
    return dateRange || { startDate: null, endDate: null };
  }

  /**
   * Filter results by date range for popular_desc mode (post-processing).
   */
  static filterResultsByDateRange<T extends PixivIllust | PixivNovel>(
    results: T[],
    startDate: Date | null,
    endDate: Date | null
  ): T[] {
    if (!startDate && !endDate) {
      return results;
    }

    return results.filter((item) => {
      if (!item.create_date) return false;
      const itemDate = new Date(item.create_date);
      return itemDate && !isNaN(itemDate.getTime()) && isDateInRange(itemDate, startDate, endDate);
    });
  }
}

