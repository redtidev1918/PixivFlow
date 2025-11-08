import { setTimeout as delay } from 'node:timers/promises';
import { ProxyAgent } from 'undici';

import { StandaloneConfig, TargetConfig } from '../config';
import { logger } from '../logger';
import { NetworkError, is404Error } from '../utils/errors';
import { parseDateRange as parseDateRangeUtil, isDateInRange as isDateInRangeUtil } from '../utils/date-utils';
import { PixivAuth } from './AuthClient';

export interface PixivUser {
  id: string;
  name: string;
}

export interface PixivIllust {
  id: number;
  title: string;
  page_count: number;
  user: PixivUser;
  image_urls: {
    square_medium: string;
    medium: string;
    large: string;
  };
  meta_single_page?: {
    original_image_url?: string;
  };
  meta_pages?: Array<{
    image_urls: {
      square_medium: string;
      medium: string;
      large: string;
      original?: string;
    };
    meta_single_page?: {
      original_image_url?: string;
    };
  }>;
  create_date: string;
  // Popularity metrics (may not be present in all API responses)
  total_bookmarks?: number;
  total_view?: number;
  bookmark_count?: number;
  view_count?: number;
}

export type PixivIllustPage = NonNullable<PixivIllust['meta_pages']>[number];

export interface PixivNovel {
  id: number;
  title: string;
  user: PixivUser;
  create_date: string;
  // Popularity metrics (may not be present in all API responses)
  total_bookmarks?: number;
  total_view?: number;
  bookmark_count?: number;
  view_count?: number;
}

export interface PixivNovelTextResponse {
  novel_text: string;
}

export class PixivClient {
  private readonly baseUrl = 'https://app-api.pixiv.net/';
  private readonly proxyAgent?: ProxyAgent;

  constructor(private readonly auth: PixivAuth, private readonly config: StandaloneConfig) {
    // Setup proxy agent if configured
    const proxy = this.config.network?.proxy;
    if (proxy?.enabled && proxy.host && proxy.port) {
      const protocol = proxy.protocol || 'http';
      const auth = proxy.username && proxy.password 
        ? `${proxy.username}:${proxy.password}@` 
        : '';
      const proxyUrl = `${protocol}://${auth}${proxy.host}:${proxy.port}`;
      
      // undici ProxyAgent supports http, https, socks4, and socks5
      this.proxyAgent = new ProxyAgent(proxyUrl);
      
      logger.info('Proxy enabled', { 
        protocol, 
        host: proxy.host, 
        port: proxy.port 
      });
    }
  }

  /**
   * Safely parse date string to timestamp
   * Returns 0 for invalid dates to ensure consistent sorting
   */
  private parseDate(dateString: string | undefined | null): number {
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

  /**
   * Parse date range from target config
   * Returns { startDate, endDate } as Date objects, or null if invalid
   * Validates that startDate <= endDate
   */
  private parseDateRange(target: TargetConfig): { startDate: Date | null; endDate: Date | null } | null {
    return parseDateRangeUtil(target.startDate, target.endDate);
  }

  /**
   * Check if item date is within the specified range
   * Handles invalid dates gracefully
   */
  private isDateInRange(itemDate: Date | null, startDate: Date | null, endDate: Date | null): boolean {
    return isDateInRangeUtil(itemDate, startDate, endDate);
  }

  /**
   * Get popularity score for sorting
   * Uses bookmarks as primary metric, views as secondary
   * Handles missing or invalid values gracefully
   */
  private getPopularityScore(item: PixivIllust | PixivNovel): number {
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
   * Sort items based on sort parameter
   * Uses stable sorting with ID as secondary key to ensure consistent ordering
   */
  private sortItems<T extends PixivIllust | PixivNovel>(
    items: T[],
    sort?: 'date_desc' | 'date_asc' | 'popular_desc'
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
        const dateA = this.parseDate(a.create_date);
        const dateB = this.parseDate(b.create_date);
        
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
        const dateA = this.parseDate(a.create_date);
        const dateB = this.parseDate(b.create_date);
        
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
        const scoreA = this.getPopularityScore(a);
        const scoreB = this.getPopularityScore(b);
        
        // Primary sort: by popularity score
        if (scoreA !== scoreB) {
          return scoreB - scoreA; // Descending order
        }
        
        // Secondary sort: by date (newest first when popularity is equal)
        const dateA = this.parseDate(a.create_date);
        const dateB = this.parseDate(b.create_date);
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        
        // Tertiary sort: by ID (for stable sorting)
        return b.id - a.id;
      });
    }

    // Log sorting statistics for debugging
    const invalidDates = sortedItems.filter(item => !item.create_date || this.parseDate(item.create_date) === 0).length;
    if (invalidDates > 0) {
      logger.debug('Sorting completed with some invalid dates', { 
        totalItems: sortedItems.length, 
        invalidDates,
        sortType: sort || 'date_desc'
      });
    }

    return sortedItems;
  }

  public async searchIllustrations(target: TargetConfig): Promise<PixivIllust[]> {
    if (!target.tag) {
      throw new Error('tag is required for illustration search');
    }
    
    // AND relation: multiple tags separated by spaces are searched together
    // Pixiv API will return works that contain all specified tags
    return this.searchIllustrationsSingleTag(target, target.tag);
  }
  
  /**
   * Search illustrations for a single tag (internal method)
   */
  private async searchIllustrationsSingleTag(target: TargetConfig, tag: string): Promise<PixivIllust[]> {
    const results: PixivIllust[] = [];
    logger.debug('Searching illustrations', { 
      tag, 
      sort: target.sort,
      searchTarget: target.searchTarget,
      startDate: target.startDate,
      endDate: target.endDate
    });
    
    // Try to use API sort parameter if available, fallback to local sorting
    const params: Record<string, string> = {
      word: tag,
      search_target: target.searchTarget ?? 'partial_match_for_tags',
      filter: 'for_ios',
      include_translated_tag_results: 'true',
    };
    
    // Add sort parameter if specified (API may support: date_desc, date_asc, popular_desc)
    if (target.sort) {
      params.sort = target.sort;
    }
    
    // Parse date range for early stopping and filtering
    const dateRange = this.parseDateRange(target);
    if (dateRange === null && (target.startDate || target.endDate)) {
      // Invalid date range, return empty results
      logger.warn('Invalid date range specified, returning empty results', {
        startDate: target.startDate,
        endDate: target.endDate
      });
      return [];
    }
    
    const { startDate, endDate } = dateRange || { startDate: null, endDate: null };
    
    let nextUrl: string | null = this.createRequestUrl('v1/search/illust', params);

    // Fetch all results first (or up to a reasonable limit for sorting)
    // If limit is specified, fetch more to ensure we have enough to sort properly
    // For popular_desc with date filtering, fetch even more to account for filtered items
    const sortMode = target.sort || 'date_desc';
    const hasDateFilter = startDate || endDate;
    const fetchLimit = target.limit 
      ? (target.limit < 50 
          ? Math.max(target.limit * (sortMode === 'popular_desc' && hasDateFilter ? 10 : 5), 100)
          : Math.max(target.limit * (sortMode === 'popular_desc' && hasDateFilter ? 3 : 2), 200))
      : undefined;
    
    // Get request delay from config to avoid rate limiting between pagination requests
    const requestDelay = this.config.download?.requestDelay ?? 3000;
    let pageCount = 0;
    let shouldStop = false;
    
    while (nextUrl && (!fetchLimit || results.length < fetchLimit) && !shouldStop) {
      const requestUrl = nextUrl;
      pageCount++;
      
      const response: { illusts: PixivIllust[]; next_url: string | null } =
        await this.request<{ illusts: PixivIllust[]; next_url: string | null }>(
          requestUrl,
        { method: 'GET' }
      );

      for (const illust of response.illusts) {
        // Parse item date
        const itemDate = illust.create_date ? new Date(illust.create_date) : null;
        
        // Check if date is valid
        if (!itemDate || isNaN(itemDate.getTime())) {
          // Invalid date: only include if no date filter is specified
          if (!startDate && !endDate) {
            results.push(illust);
            if (fetchLimit && results.length >= fetchLimit) {
              break;
            }
          } else {
            logger.debug(`Skipping item ${illust.id} with invalid date ${illust.create_date}`);
          }
          continue;
        }
        
        // Check date range
        const inRange = this.isDateInRange(itemDate, startDate, endDate);
        
        if (sortMode === 'date_desc') {
          // When sorting by date_desc (newest first):
          // - Skip items after endDate (too new), but continue searching
          // - Stop when encountering items before startDate (too old)
          if (!inRange) {
            if (endDate && itemDate > endDate) {
              logger.debug(`Skipping item ${illust.id} with date ${illust.create_date} after endDate ${target.endDate}`);
              continue; // Skip this item but continue searching
            }
            if (startDate && itemDate < startDate) {
              logger.debug(`Stopping search: encountered item ${illust.id} with date ${illust.create_date} before startDate ${target.startDate}`);
              shouldStop = true;
              break; // Stop searching entirely
            }
          }
        } else if (sortMode === 'date_asc') {
          // When sorting by date_asc (oldest first):
          // - Skip items before startDate (too old), but continue searching
          // - Stop when encountering items after endDate (too new)
          if (!inRange) {
            if (startDate && itemDate < startDate) {
              logger.debug(`Skipping item ${illust.id} with date ${illust.create_date} before startDate ${target.startDate}`);
              continue; // Skip this item but continue searching
            }
            if (endDate && itemDate > endDate) {
              logger.debug(`Stopping search: encountered item ${illust.id} with date ${illust.create_date} after endDate ${target.endDate}`);
              shouldStop = true;
              break; // Stop searching entirely
            }
          }
        } else if (sortMode === 'popular_desc') {
          // When sorting by popular_desc (most popular first):
          // Results are not ordered by date, so we can't early stop
          // But we can filter items outside date range to reduce memory usage
          if (!inRange) {
            logger.debug(`Skipping item ${illust.id} with date ${illust.create_date} outside date range (popular_desc mode)`);
            continue; // Skip this item but continue searching
          }
        }
        
        // Item is within date range (or no date filter), add it
        if (inRange || (!startDate && !endDate)) {
          results.push(illust);
          if (fetchLimit && results.length >= fetchLimit) {
            break;
          }
        }
      }

      nextUrl = response.next_url;
      
      // Add delay between pagination requests to avoid rate limiting (except after last page)
      if (nextUrl && requestDelay > 0 && !shouldStop) {
        logger.debug(`Tag "${tag}" page ${pageCount}: found ${response.illusts.length} illusts, total collected: ${results.length}, waiting ${requestDelay}ms before next page...`);
        await delay(requestDelay);
      }
    }

    // Log filtering statistics for popular_desc mode with date filtering
    if (sortMode === 'popular_desc' && hasDateFilter && results.length > 0) {
      const validResults = results.filter(item => {
        if (!item.create_date) return false;
        const itemDate = new Date(item.create_date);
        return itemDate && !isNaN(itemDate.getTime()) && this.isDateInRange(itemDate, startDate, endDate);
      });
      if (validResults.length < results.length) {
        logger.debug(`Date filtering in popular_desc mode: ${results.length} total results, ${validResults.length} within date range`);
      }
    }
    
    // Sort results according to sort parameter
    const sortedResults = this.sortItems(results, target.sort);
    
    // Apply limit after sorting
    if (target.limit && sortedResults.length > target.limit) {
      return sortedResults.slice(0, target.limit);
    }
    
    // Warn if we didn't get enough results in popular_desc mode with date filtering
    if (sortMode === 'popular_desc' && hasDateFilter && target.limit && sortedResults.length < target.limit) {
      logger.warn(`Only found ${sortedResults.length} result(s) within date range, requested ${target.limit}`, {
        tag,
        startDate: target.startDate,
        endDate: target.endDate,
        found: sortedResults.length,
        requested: target.limit
      });
    }
    
    return sortedResults;
  }

  public async searchNovels(target: TargetConfig): Promise<PixivNovel[]> {
    if (!target.tag) {
      throw new Error('tag is required for novel search');
    }
    
    // AND relation: multiple tags separated by spaces are searched together
    // Pixiv API will return works that contain all specified tags
    return this.searchNovelsSingleTag(target, target.tag);
  }
  
  /**
   * Search novels for a single tag (internal method)
   */
  private async searchNovelsSingleTag(target: TargetConfig, tag: string): Promise<PixivNovel[]> {
    const results: PixivNovel[] = [];
    logger.debug('Searching novels', { 
      tag, 
      sort: target.sort,
      searchTarget: target.searchTarget,
      startDate: target.startDate,
      endDate: target.endDate
    });
    
    // Try to use API sort parameter if available, fallback to local sorting
    const params: Record<string, string> = {
      word: tag,
      search_target: target.searchTarget ?? 'partial_match_for_tags',
    };
    
    // Add sort parameter if specified (API may support: date_desc, date_asc, popular_desc)
    if (target.sort) {
      params.sort = target.sort;
    }
    
    // Parse date range for early stopping and filtering
    const dateRange = this.parseDateRange(target);
    if (dateRange === null && (target.startDate || target.endDate)) {
      // Invalid date range, return empty results
      logger.warn('Invalid date range specified, returning empty results', {
        startDate: target.startDate,
        endDate: target.endDate
      });
      return [];
    }
    
    const { startDate, endDate } = dateRange || { startDate: null, endDate: null };
    
    let nextUrl: string | null = this.createRequestUrl('v1/search/novel', params);

    // Fetch all results first (or up to a reasonable limit for sorting)
    // If limit is specified, fetch more to ensure we have enough to sort properly
    // For popular_desc with date filtering, fetch even more to account for filtered items
    const sortMode = target.sort || 'date_desc';
    const hasDateFilter = startDate || endDate;
    const fetchLimit = target.limit 
      ? (target.limit < 50 
          ? Math.max(target.limit * (sortMode === 'popular_desc' && hasDateFilter ? 10 : 5), 100)
          : Math.max(target.limit * (sortMode === 'popular_desc' && hasDateFilter ? 3 : 2), 200))
      : undefined;
    
    // Get request delay from config to avoid rate limiting between pagination requests
    const requestDelay = this.config.download?.requestDelay ?? 3000;
    let pageCount = 0;
    let shouldStop = false;
    
    while (nextUrl && (!fetchLimit || results.length < fetchLimit) && !shouldStop) {
      const requestUrl = nextUrl;
      pageCount++;
      
      const response: { novels: PixivNovel[]; next_url: string | null } =
        await this.request<{ novels: PixivNovel[]; next_url: string | null }>(
          requestUrl,
        { method: 'GET' }
      );

      for (const novel of response.novels) {
        // Parse item date
        const itemDate = novel.create_date ? new Date(novel.create_date) : null;
        
        // Check if date is valid
        if (!itemDate || isNaN(itemDate.getTime())) {
          // Invalid date: only include if no date filter is specified
          if (!startDate && !endDate) {
            results.push(novel);
            if (fetchLimit && results.length >= fetchLimit) {
              break;
            }
          } else {
            logger.debug(`Skipping novel ${novel.id} with invalid date ${novel.create_date}`);
          }
          continue;
        }
        
        // Check date range
        const inRange = this.isDateInRange(itemDate, startDate, endDate);
        
        if (sortMode === 'date_desc') {
          // When sorting by date_desc (newest first):
          // - Skip items after endDate (too new), but continue searching
          // - Stop when encountering items before startDate (too old)
          if (!inRange) {
            if (endDate && itemDate > endDate) {
              logger.debug(`Skipping novel ${novel.id} with date ${novel.create_date} after endDate ${target.endDate}`);
              continue; // Skip this item but continue searching
            }
            if (startDate && itemDate < startDate) {
              logger.debug(`Stopping search: encountered novel ${novel.id} with date ${novel.create_date} before startDate ${target.startDate}`);
              shouldStop = true;
              break; // Stop searching entirely
            }
          }
        } else if (sortMode === 'date_asc') {
          // When sorting by date_asc (oldest first):
          // - Skip items before startDate (too old), but continue searching
          // - Stop when encountering items after endDate (too new)
          if (!inRange) {
            if (startDate && itemDate < startDate) {
              logger.debug(`Skipping novel ${novel.id} with date ${novel.create_date} before startDate ${target.startDate}`);
              continue; // Skip this item but continue searching
            }
            if (endDate && itemDate > endDate) {
              logger.debug(`Stopping search: encountered novel ${novel.id} with date ${novel.create_date} after endDate ${target.endDate}`);
              shouldStop = true;
              break; // Stop searching entirely
            }
          }
        } else if (sortMode === 'popular_desc') {
          // When sorting by popular_desc (most popular first):
          // Results are not ordered by date, so we can't early stop
          // But we can filter items outside date range to reduce memory usage
          if (!inRange) {
            logger.debug(`Skipping novel ${novel.id} with date ${novel.create_date} outside date range (popular_desc mode)`);
            continue; // Skip this item but continue searching
          }
        }
        
        // Item is within date range (or no date filter), add it
        if (inRange || (!startDate && !endDate)) {
          results.push(novel);
          if (fetchLimit && results.length >= fetchLimit) {
            break;
          }
        }
      }

      nextUrl = response.next_url;
      
      // Add delay between pagination requests to avoid rate limiting (except after last page)
      if (nextUrl && requestDelay > 0 && !shouldStop) {
        logger.debug(`Tag "${tag}" page ${pageCount}: found ${response.novels.length} novels, total collected: ${results.length}, waiting ${requestDelay}ms before next page...`);
        await delay(requestDelay);
      }
    }

    // Log filtering statistics for popular_desc mode with date filtering
    if (sortMode === 'popular_desc' && hasDateFilter && results.length > 0) {
      const validResults = results.filter(item => {
        if (!item.create_date) return false;
        const itemDate = new Date(item.create_date);
        return itemDate && !isNaN(itemDate.getTime()) && this.isDateInRange(itemDate, startDate, endDate);
      });
      if (validResults.length < results.length) {
        logger.debug(`Date filtering in popular_desc mode: ${results.length} total results, ${validResults.length} within date range`);
      }
    }
    
    // Sort results according to sort parameter
    const sortedResults = this.sortItems(results, target.sort);
    
    // Apply limit after sorting
    if (target.limit && sortedResults.length > target.limit) {
      return sortedResults.slice(0, target.limit);
    }
    
    // Warn if we didn't get enough results in popular_desc mode with date filtering
    if (sortMode === 'popular_desc' && hasDateFilter && target.limit && sortedResults.length < target.limit) {
      logger.warn(`Only found ${sortedResults.length} result(s) within date range, requested ${target.limit}`, {
        tag,
        startDate: target.startDate,
        endDate: target.endDate,
        found: sortedResults.length,
        requested: target.limit
      });
    }
    
    return sortedResults;
  }

  /**
   * Get ranking illustrations
   * @param mode Ranking mode (day, week, month, etc.)
   * @param date Date in YYYY-MM-DD format (optional, defaults to today)
   * @param limit Maximum number of results
   */
  public async getRankingIllustrations(
    mode: string = 'day',
    date?: string,
    limit?: number
  ): Promise<PixivIllust[]> {
    const results: PixivIllust[] = [];
    const params: Record<string, string> = {
      mode,
      filter: 'for_ios',
    };

    if (date) {
      params.date = date;
    }

    let nextUrl: string | null = this.createRequestUrl('v1/illust/ranking', params);

    while (nextUrl && (!limit || results.length < limit)) {
      const requestUrl = nextUrl;
      const response: { illusts: PixivIllust[]; next_url: string | null } =
        await this.request<{ illusts: PixivIllust[]; next_url: string | null }>(
          requestUrl,
        { method: 'GET' }
      );

      for (const illust of response.illusts) {
        results.push(illust);
        if (limit && results.length >= limit) {
          break;
        }
      }

      nextUrl = response.next_url;
    }

    return results;
  }

  /**
   * Get ranking novels
   * @param mode Ranking mode (day, week, month, etc.)
   * @param date Date in YYYY-MM-DD format (optional, defaults to today)
   * @param limit Maximum number of results
   */
  public async getRankingNovels(
    mode: string = 'day',
    date?: string,
    limit?: number
  ): Promise<PixivNovel[]> {
    const results: PixivNovel[] = [];
    const params: Record<string, string> = {
      mode,
    };

    if (date) {
      params.date = date;
    }

    let nextUrl: string | null = this.createRequestUrl('v1/novel/ranking', params);

    while (nextUrl && (!limit || results.length < limit)) {
      const requestUrl = nextUrl;
      const response: { novels: PixivNovel[]; next_url: string | null } =
        await this.request<{ novels: PixivNovel[]; next_url: string | null }>(
          requestUrl,
        { method: 'GET' }
      );

      for (const novel of response.novels) {
        results.push(novel);
        if (limit && results.length >= limit) {
          break;
        }
      }

      nextUrl = response.next_url;
    }

    return results;
  }

  /**
   * Get illustration detail with tags for filtering
   */
  public async getIllustDetailWithTags(illustId: number): Promise<{
    illust: PixivIllust;
    tags: Array<{ name: string; translated_name?: string }>;
  }> {
    const url = this.createRequestUrl('v1/illust/detail', { illust_id: String(illustId) });
    const response = await this.request<{
      illust: PixivIllust & { tags: Array<{ name: string; translated_name?: string }> };
    }>(url, { method: 'GET' });
    
    const tags = response.illust.tags || [];
    const { tags: _, ...illust } = response.illust;
    
    return { illust, tags };
  }

  /**
   * Get novel detail with tags for filtering
   */
  public async getNovelDetailWithTags(novelId: number): Promise<{
    novel: PixivNovel;
    tags: Array<{ name: string; translated_name?: string }>;
  }> {
    // Try v2 API first, fallback to v1 if needed
    let url = this.createRequestUrl('v2/novel/detail', { novel_id: String(novelId) });
    logger.debug('Fetching novel detail with tags', { novelId, url });
    try {
      const response = await this.request<{
        novel: PixivNovel & { tags: Array<{ name: string; translated_name?: string }> };
      }>(url, { method: 'GET' });
      
      const tags = response.novel.tags || [];
      const { tags: _, ...novel } = response.novel;
      
      return { novel, tags };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // If v2 fails with 404 or endpoint error, try v1
      if (errorMessage.includes('404') || errorMessage.includes('end-point')) {
        logger.debug('v2 API failed, trying v1 for novel detail with tags', { novelId });
        url = this.createRequestUrl('v1/novel/detail', { novel_id: String(novelId) });
        try {
          const response = await this.request<{
            novel: PixivNovel & { tags: Array<{ name: string; translated_name?: string }> };
          }>(url, { method: 'GET' });
          
          const tags = response.novel.tags || [];
          const { tags: _, ...novel } = response.novel;
          
          return { novel, tags };
        } catch (v1Error) {
          logger.error('Failed to get novel detail with tags (both v1 and v2)', { 
            novelId, 
            v2Url: this.createRequestUrl('v2/novel/detail', { novel_id: String(novelId) }),
            v1Url: url,
            v2Error: errorMessage,
            v1Error: v1Error instanceof Error ? v1Error.message : String(v1Error)
          });
          throw v1Error;
        }
      } else {
        logger.error('Failed to get novel detail with tags', { 
          novelId, 
          url,
          error: errorMessage
        });
        throw error;
      }
    }
  }

  public async getIllustDetail(illustId: number): Promise<PixivIllust> {
    const url = this.createRequestUrl('v1/illust/detail', { illust_id: String(illustId) });
    const response = await this.request<{ illust: PixivIllust }>(url, { method: 'GET' });
    return response.illust;
  }

  public async getNovelDetail(novelId: number): Promise<PixivNovel> {
    // Try v2 API first, fallback to v1 if needed
    let url = this.createRequestUrl('v2/novel/detail', { novel_id: String(novelId) });
    logger.debug('Fetching novel detail', { novelId, url });
    try {
      const response = await this.request<{ novel: PixivNovel }>(url, { method: 'GET' });
      logger.debug('Novel detail response received', { novelId, hasNovel: !!response.novel });
      return response.novel;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // If v2 fails with 404, try v1
      if (errorMessage.includes('404') || errorMessage.includes('end-point')) {
        logger.debug('v2 API failed, trying v1', { novelId });
        url = this.createRequestUrl('v1/novel/detail', { novel_id: String(novelId) });
        try {
          const response = await this.request<{ novel: PixivNovel }>(url, { method: 'GET' });
          logger.debug('Novel detail response received (v1)', { novelId, hasNovel: !!response.novel });
          return response.novel;
        } catch (v1Error) {
          logger.error('Failed to get novel detail (both v1 and v2)', { 
            novelId, 
            v2Url: this.createRequestUrl('v2/novel/detail', { novel_id: String(novelId) }),
            v1Url: url,
            v2Error: errorMessage,
            v1Error: v1Error instanceof Error ? v1Error.message : String(v1Error)
          });
          throw v1Error;
        }
      } else {
        logger.error('Failed to get novel detail', { 
          novelId, 
          url,
          error: errorMessage
        });
        throw error;
      }
    }
  }

  public async getNovelText(novelId: number): Promise<string> {
    // Try v1 API first (v2/novel/text doesn't exist)
    const url = this.createRequestUrl('v1/novel/text', { novel_id: String(novelId) });
    logger.debug('Fetching novel text', { novelId, url });
    try {
      const response = await this.request<PixivNovelTextResponse>(url, { method: 'GET' });
      return response.novel_text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('Primary API endpoint failed, trying alternative API endpoint', { 
        novelId, 
        url,
        error: errorMessage
      });
      
      // Fallback: Try alternative API endpoint (www.pixiv.net/ajax/novel)
      // This is also an API endpoint, not web scraping - following "use API if available" principle
      try {
        const webUrl = `https://www.pixiv.net/ajax/novel/${novelId}`;
        const token = await this.auth.getAccessToken();
        
        // Use fetch with proxy support if configured
        const fetchOptions: RequestInit = {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': this.config.pixiv.userAgent,
            'Referer': 'https://www.pixiv.net/',
            'Accept': 'application/json',
          },
        };
        
        // Add proxy agent if configured
        if (this.proxyAgent) {
          (fetchOptions as any).dispatcher = this.proxyAgent;
        }
        
        const webResponse = await fetch(webUrl, fetchOptions);
        
        if (webResponse.ok) {
          const webData: any = await webResponse.json();
          if (webData.body && webData.body.content) {
            logger.info('Successfully retrieved novel text from alternative API endpoint', { novelId });
            return webData.body.content;
          }
        }
      } catch (webError) {
        logger.debug('Alternative API endpoint fallback failed', { novelId, error: webError });
      }
      
      throw new Error(`Unable to retrieve novel text for novel ${novelId}: ${errorMessage}`);
    }
  }

  /**
   * Get all novels in a series
   */
  public async getNovelSeries(seriesId: number): Promise<PixivNovel[]> {
    const results: PixivNovel[] = [];
    let nextUrl: string | null = this.createRequestUrl('v1/novel/series', {
      series_id: String(seriesId),
    });

    while (nextUrl) {
      const requestUrl: string = nextUrl;
      const response: any = await this.request<any>(requestUrl, { method: 'GET' });
      
      // Debug: log response structure
      logger.debug('Novel series API response', { 
        keys: Object.keys(response),
        hasNovelSeriesDetail: !!response.novel_series_detail,
        hasSeriesContent: !!response.novel_series_detail?.series_content
      });

      // Handle different possible response structures
      let seriesContent: Array<{ id: number; title: string; user: PixivUser; create_date: string }> = [];
      
      if (response.novel_series_detail?.series_content) {
        seriesContent = response.novel_series_detail.series_content;
      } else if (response.series_content) {
        seriesContent = response.series_content;
      } else if (Array.isArray(response.novels)) {
        // Fallback: if response has novels array directly
        seriesContent = response.novels;
      } else {
        logger.warn('Unexpected novel series response structure', { response });
        throw new Error(`Unexpected response structure from novel series API. Response keys: ${Object.keys(response).join(', ')}`);
      }

      for (const content of seriesContent) {
        results.push({
          id: content.id,
          title: content.title,
          user: content.user,
          create_date: content.create_date,
        });
      }

      nextUrl = response.next_url || null;
    }

    return results;
  }

  public async downloadImage(originalUrl: string): Promise<ArrayBuffer> {
    const headers = {
      Referer: 'https://app-api.pixiv.net/',
      'User-Agent': this.config.pixiv.userAgent,
    };

    return this.fetchBinary(originalUrl, headers);
  }

  private async fetchBinary(url: string, headers: Record<string, string>): Promise<ArrayBuffer> {
    let lastError: unknown;
    const network = this.config.network!;
    for (let attempt = 0; attempt < (network.retries ?? 3); attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), network.timeoutMs ?? 30000);
        try {
          const fetchOptions: RequestInit = {
            method: 'GET',
            headers,
            signal: controller.signal,
          };
          
          // Add proxy agent if configured
          if (this.proxyAgent) {
            (fetchOptions as any).dispatcher = this.proxyAgent;
          }
          
          const response = await fetch(url, fetchOptions);

          if (!response.ok) {
            throw new Error(`Failed to fetch binary: ${response.status}`);
          }

          const buffer = await response.arrayBuffer();
          return buffer;
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
        logger.warn('Binary fetch failed', { url, attempt: attempt + 1, error: `${error}` });
        await delay(Math.min(1000 * (attempt + 1), 5000));
      }
    }

    throw new Error(`Unable to download resource ${url}: ${lastError}`);
  }

  private createRequestUrl(path: string, params: Record<string, string>): string {
    const url = new URL(path, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
    return url.toString();
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let lastError: unknown;
    const network = this.config.network!;
    let maxAttempts = network.retries ?? 3;
    let hasRateLimitError = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const token = await this.auth.getAccessToken();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), network.timeoutMs ?? 30000);
        try {
          const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            'User-Agent': this.config.pixiv.userAgent,
            'App-OS': 'ios',
            'App-OS-Version': '14.6',
            'App-Version': '7.13.3',
            Referer: 'https://app-api.pixiv.net/',
          };

          const fetchOptions: RequestInit = {
            ...init,
            headers: {
              ...headers,
              ...(init.headers ?? {}),
            },
            signal: controller.signal,
          };
          
          // Add proxy agent if configured
          if (this.proxyAgent) {
            (fetchOptions as any).dispatcher = this.proxyAgent;
          }

          const response = await fetch(url, fetchOptions);

          if (response.status === 401) {
            // Token expired, refresh and retry
            logger.warn('Received 401 from Pixiv API, refreshing token');
            await this.auth.getAccessToken();
            continue;
          }

          if (response.status === 404) {
            // 404 means resource not found, don't retry
            // Try to get response body for debugging
            let errorBody = '';
            try {
              const text = await response.text();
              errorBody = text;
              logger.debug('404 response body', { url, body: text });
            } catch (e) {
              // Ignore errors reading body
            }
            throw new NetworkError(
              `Pixiv API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
              url,
              undefined
            );
          }

          if (response.status === 429) {
            // Rate limit error - use longer wait time
            hasRateLimitError = true;
            // Increase max attempts for rate limit errors (up to 10 attempts)
            if (maxAttempts < 10) {
              maxAttempts = 10;
            }
            
            let errorBody = '';
            try {
              const text = await response.text();
              errorBody = text;
              logger.warn('429 Rate Limit response body', { url, body: text });
            } catch (e) {
              // Ignore errors reading body
            }
            // Check if Retry-After header is present
            const retryAfter = response.headers.get('Retry-After');
            let waitTime: number;
            if (retryAfter) {
              // Use Retry-After header value, but ensure minimum 60 seconds
              waitTime = Math.max(parseInt(retryAfter, 10) * 1000, 60000);
            } else {
              // Exponential backoff with longer wait times: 60s, 120s, 240s, 480s, 600s, max 600s
              // For rate limits, we need to wait longer
              waitTime = Math.min(60000 * Math.pow(2, attempt), 600000); // 1min, 2min, 4min, 8min, max 10min
            }
            
            logger.warn(`Rate limited (429). Waiting ${waitTime / 1000}s before retry...`, {
              url,
              attempt: attempt + 1,
              maxAttempts,
              retryAfter,
              waitTime: waitTime / 1000,
            });
            
            throw new NetworkError(
              `Pixiv API error: ${response.status} ${response.statusText} - Rate Limit${errorBody ? ` - ${errorBody}` : ''}`,
              url,
              undefined,
              { isRateLimit: true, waitTime }
            );
          }

          if (!response.ok) {
            // Try to get response body for debugging
            let errorBody = '';
            try {
              const text = await response.text();
              errorBody = text;
              logger.debug('Error response body', { url, status: response.status, body: text });
            } catch (e) {
              // Ignore errors reading body
            }
            throw new NetworkError(
              `Pixiv API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
              url,
              undefined
            );
          }

          return (await response.json()) as T;
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
        
        // Don't retry on 404 errors - resource doesn't exist
        if (is404Error(error)) {
          throw error;
        }
        
        // Handle rate limit errors with longer wait time
        const isRateLimit = error instanceof NetworkError && error.isRateLimit;
        const waitTime = error instanceof NetworkError && error.waitTime 
          ? error.waitTime 
          : Math.min(1000 * (attempt + 1), 5000);
        
        // Check if this is the last attempt
        if (attempt >= maxAttempts - 1) {
          // Last attempt failed, throw error
          throw error;
        }
        
        logger.warn('Pixiv API request failed', {
          url,
          attempt: attempt + 1,
          maxAttempts,
          isRateLimit,
          waitTime: waitTime / 1000,
          error: error instanceof Error ? error.message : String(error),
        });
        
        await delay(waitTime);
      }
    }

    const errorMessage = lastError instanceof Error 
      ? lastError.message 
      : String(lastError);
    throw new NetworkError(
      `Pixiv API request to ${url} failed after ${maxAttempts} attempts: ${errorMessage}`,
      url,
      lastError instanceof Error ? lastError : undefined
    );
  }
}

