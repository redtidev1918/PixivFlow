import type { TargetConfig } from '../../config';
import type { PixivIllust, PixivNovel } from '../../pixiv/types';
import { parseDateRange, isDateInRange } from '../../utils/date-utils';
import { logger } from '../../logger';
import type { IDatabase } from '../../interfaces/IDatabase';

export type DownloadItem = PixivIllust | PixivNovel;

interface FilterResult<T extends DownloadItem> {
  items: T[];
  filteredOut: number;
  originalCount: number;
}

export interface PlannedDownload<T extends DownloadItem> {
  queue: T[];
  mode: 'sequential' | 'random';
  limit: number;
  filteredOut: number;
  deduplicated: number;
  alreadyDownloaded: number;
  availableCount: number;
  originalCount: number;
  random?: {
    maxAttempts: number;
  };
}

/**
 * Centralizes planning logic (filtering, deduplication, already-downloaded detection, random selection).
 */
export class DownloadPlanner {
  constructor(private readonly database: IDatabase) {}

  planDownloads<T extends DownloadItem>(
    items: T[],
    target: TargetConfig,
    itemType: 'illustration' | 'novel'
  ): PlannedDownload<T> {
    const filtered = this.filterItems(items, target, itemType);
    const { items: deduplicatedItems, removed } = this.deduplicate(filtered.items);

    const itemIds = deduplicatedItems.map((item) => String(item.id));
    const downloadedIds =
      itemIds.length > 0 ? this.database.getDownloadedIds(itemIds, itemType) : new Set<string>();
    const available = deduplicatedItems.filter((item) => !downloadedIds.has(String(item.id)));
    const alreadyDownloadedCount = deduplicatedItems.length - available.length;

    const limit = target.limit && target.limit > 0 ? target.limit : 10;

    if (target.random) {
      const shuffled = this.shuffle(available);
      const maxAttempts = Math.min(shuffled.length, 50);
      const queue = shuffled.slice(0, maxAttempts);
      return {
        queue,
        mode: 'random',
        limit,
        filteredOut: filtered.filteredOut,
        deduplicated: removed,
        alreadyDownloaded: alreadyDownloadedCount,
        availableCount: available.length,
        originalCount: filtered.originalCount,
        random: { maxAttempts },
      };
    }

    const queue = available.slice(0, Math.min(available.length, limit));

    return {
      queue,
      mode: 'sequential',
      limit,
      filteredOut: filtered.filteredOut,
      deduplicated: removed,
      alreadyDownloaded: alreadyDownloadedCount,
      availableCount: available.length,
      originalCount: filtered.originalCount,
    };
  }

  private filterItems<T extends DownloadItem>(
    items: T[],
    target: TargetConfig,
    itemType: 'illustration' | 'novel'
  ): FilterResult<T> {
    let filtered = [...items];
    const originalCount = filtered.length;

    if (target.minBookmarks !== undefined) {
      const beforeCount = filtered.length;
      filtered = filtered.filter((item) => {
        const bookmarks = (item as any).total_bookmarks ?? (item as any).bookmark_count ?? 0;
        return bookmarks >= target.minBookmarks!;
      });
      if (filtered.length < beforeCount) {
        logger.info(
          `Filtered by minBookmarks (>= ${target.minBookmarks}): ${beforeCount} -> ${filtered.length} ${itemType}(s)`
        );
      }
    }

    if (target.startDate || target.endDate) {
      const beforeCount = filtered.length;
      const dateRange = parseDateRange(target.startDate, target.endDate);

      if (dateRange === null) {
        logger.warn('Invalid date range in DownloadPlanner.filterItems, skipping date filter', {
          startDate: target.startDate,
          endDate: target.endDate,
        });
      } else {
        const { startDate, endDate } = dateRange;
        filtered = filtered.filter((item) => {
          if (!item.create_date) return false;
          const itemDate = new Date(item.create_date);
          if (!itemDate || isNaN(itemDate.getTime())) return false;
          return isDateInRange(itemDate, startDate, endDate);
        });

        if (filtered.length < beforeCount) {
          const dateRangeStr = [target.startDate || 'unlimited', target.endDate || 'unlimited'].join(' ~ ');
          logger.info(
            `Filtered by date range (${dateRangeStr}): ${beforeCount} -> ${filtered.length} ${itemType}(s)`
          );
        }
      }
    }

    if (filtered.length < originalCount) {
      logger.info(
        `Total filtering: ${originalCount} -> ${filtered.length} ${itemType}(s) after applying all filters`
      );
    }

    return {
      items: filtered,
      filteredOut: originalCount - filtered.length,
      originalCount,
    };
  }

  private deduplicate<T extends DownloadItem>(items: T[]): { items: T[]; removed: number } {
    if (items.length === 0) {
      return { items, removed: 0 };
    }

    const seen = new Set<string>();
    const deduplicated: T[] = [];
    for (const item of items) {
      const key = String(item.id);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduplicated.push(item);
    }

    const removed = items.length - deduplicated.length;
    if (removed > 0) {
      logger.debug(`Deduplicated ${removed} duplicate item(s) before planning`);
    }
    return { items: deduplicated, removed };
  }

  private shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

