import { setTimeout as delay } from 'node:timers/promises';
import { PixivApiCore } from './PixivApiCore';
import type { PixivIllust, PixivNovel } from '../types';
import { logger } from '../../logger';
import { sortPixivItems } from '../../utils/pixiv-sort';
import type { TargetConfig } from '../../config';
import { SearchFilters } from './search/SearchFilters';

/**
 * Search service for illustrations and novels with pagination, filtering and sorting.
 * Depends on PixivApiCore for HTTP concerns.
 */
export class SearchService {
  constructor(private readonly api: PixivApiCore) {}

  async searchIllustrations(target: TargetConfig, requestDelayMs: number): Promise<PixivIllust[]> {
    if (!target.tag) {
      throw new Error('tag is required for illustration search');
    }

    // Support tagRelation === 'or': split space-separated tags, query sequentially, merge & dedupe
    if (target.tagRelation === 'or') {
      const tags = target.tag.split(/\s+/).map((t) => t.trim()).filter(Boolean);
      if (tags.length <= 1) {
        return this.searchIllustrationsSingleTag(target, target.tag, requestDelayMs);
      }

      const seen = new Set<string>();
      const merged: PixivIllust[] = [];

      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        const part = await this.searchIllustrationsSingleTag(target, tag, requestDelayMs);
        for (const item of part) {
          const key = String((item as any).id);
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }
        // Respect global limit early if possible
        if (target.limit && merged.length >= target.limit) {
          break;
        }
        // Add delay between tag requests to reduce rate limiting
        if (i < tags.length - 1 && requestDelayMs > 0) {
          await delay(requestDelayMs);
        }
      }

      const sorted = sortPixivItems(merged, target.sort);
      if (target.limit && sorted.length > target.limit) {
        return sorted.slice(0, target.limit);
      }
      return sorted;
    }

    return this.searchIllustrationsSingleTag(target, target.tag, requestDelayMs);
  }

  async searchNovels(target: TargetConfig, requestDelayMs: number): Promise<PixivNovel[]> {
    if (!target.tag) {
      throw new Error('tag is required for novel search');
    }

    // Support tagRelation === 'or': split space-separated tags, query sequentially, merge & dedupe
    if (target.tagRelation === 'or') {
      const tags = target.tag.split(/\s+/).map((t) => t.trim()).filter(Boolean);
      if (tags.length <= 1) {
        return this.searchNovelsSingleTag(target, target.tag, requestDelayMs);
      }

      const seen = new Set<string>();
      const merged: PixivNovel[] = [];

      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        const part = await this.searchNovelsSingleTag(target, tag, requestDelayMs);
        for (const item of part) {
          const key = String((item as any).id);
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }
        // Respect global limit early if possible
        if (target.limit && merged.length >= target.limit) {
          break;
        }
        // Add delay between tag requests to reduce rate limiting
        if (i < tags.length - 1 && requestDelayMs > 0) {
          await delay(requestDelayMs);
        }
      }

      const sorted = sortPixivItems(merged, target.sort);
      if (target.limit && sorted.length > target.limit) {
        return sorted.slice(0, target.limit);
      }
      return sorted;
    }

    return this.searchNovelsSingleTag(target, target.tag, requestDelayMs);
  }

  private async searchIllustrationsSingleTag(
    target: TargetConfig,
    tag: string,
    requestDelayMs: number
  ): Promise<PixivIllust[]> {
    logger.debug('Searching illustrations', {
      tag,
      sort: target.sort,
      searchTarget: target.searchTarget,
      startDate: target.startDate,
      endDate: target.endDate,
    });

    const dateRange = SearchFilters.parseDateRangeFromTarget(target);
    if (dateRange === null) {
      return [];
    }
    const { startDate, endDate } = dateRange;

    const params = new URLSearchParams({
      word: tag,
      search_target: target.searchTarget ?? 'partial_match_for_tags',
      filter: 'for_ios',
      include_translated_tag_results: 'true',
    });
    if (target.sort) params.set('sort', target.sort);

    const sortMode = target.sort || 'date_desc';
    const hasDateFilter = !!(startDate || endDate);
    const fetchLimit = SearchFilters.calculateFetchLimit(target, sortMode, hasDateFilter);

    return this.searchWithPagination<PixivIllust>(
      `/v1/search/illust?${params.toString()}`,
      'illusts',
      target,
      tag,
      requestDelayMs,
      sortMode,
      startDate,
      endDate,
      hasDateFilter,
      fetchLimit
    );
  }

  private async searchNovelsSingleTag(
    target: TargetConfig,
    tag: string,
    requestDelayMs: number
  ): Promise<PixivNovel[]> {
    logger.debug('Searching novels', {
      tag,
      sort: target.sort,
      searchTarget: target.searchTarget,
      startDate: target.startDate,
      endDate: target.endDate,
    });

    const dateRange = SearchFilters.parseDateRangeFromTarget(target);
    if (dateRange === null) {
      return [];
    }
    const { startDate, endDate } = dateRange;

    const params = new URLSearchParams({
      word: tag,
      search_target: target.searchTarget ?? 'partial_match_for_tags',
    });
    if (target.sort) params.set('sort', target.sort);

    const sortMode = target.sort || 'date_desc';
    const hasDateFilter = !!(startDate || endDate);
    const fetchLimit = SearchFilters.calculateFetchLimit(target, sortMode, hasDateFilter);

    return this.searchWithPagination<PixivNovel>(
      `/v1/search/novel?${params.toString()}`,
      'novels',
      target,
      tag,
      requestDelayMs,
      sortMode,
      startDate,
      endDate,
      hasDateFilter,
      fetchLimit
    );
  }

  /**
   * Generic pagination search method that works for both illustrations and novels.
   */
  private async searchWithPagination<T extends PixivIllust | PixivNovel>(
    initialUrl: string,
    itemsKey: 'illusts' | 'novels',
    target: TargetConfig,
    tag: string,
    requestDelayMs: number,
    sortMode: string,
    startDate: Date | null,
    endDate: Date | null,
    hasDateFilter: boolean,
    fetchLimit: number | undefined
  ): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | null = initialUrl;
    let pageCount = 0;
    let shouldStop = false;

    while (nextUrl && (!fetchLimit || results.length < fetchLimit) && !shouldStop) {
      pageCount++;
      const response = await this.api.request<{ [key: string]: T[] | string | null }>(
        nextUrl,
        { method: 'GET' }
      );

      const items = (response[itemsKey] as T[]) || [];
      const responseNextUrl = response.next_url as string | null;

      for (const item of items) {
        const filterResult = SearchFilters.filterItemByDate(item, target, startDate, endDate, sortMode);
        
        if (filterResult.shouldStop) {
          shouldStop = true;
          break;
        }

        if (filterResult.shouldInclude) {
          results.push(item);
          if (fetchLimit && results.length >= fetchLimit) {
            break;
          }
        }
      }

      nextUrl = responseNextUrl;
      if (nextUrl && requestDelayMs > 0 && !shouldStop) {
        logger.debug(
          `Tag "${tag}" page ${pageCount}: found ${items.length} ${itemsKey}, total collected: ${results.length}, waiting ${requestDelayMs}ms before next page...`
        );
        await delay(requestDelayMs);
      }
    }

    // Post-process for popular_desc mode with date filter
    let finalResults = results;
    if (sortMode === 'popular_desc' && hasDateFilter && results.length > 0) {
      const validResults = SearchFilters.filterResultsByDateRange(results, startDate, endDate);
      if (validResults.length < results.length) {
        logger.debug(
          `Date filtering in popular_desc mode: ${results.length} total results, ${validResults.length} within date range`
        );
      }
      finalResults = validResults as T[];
    }

    const sortedResults = sortPixivItems(finalResults, target.sort);
    if (target.limit && sortedResults.length > target.limit) {
      return sortedResults.slice(0, target.limit) as T[];
    }
    return sortedResults as T[];
  }
}


