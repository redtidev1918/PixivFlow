import { StandaloneConfig, TargetConfig } from '../config';
import { logger } from '../logger';
import { DownloadError, NetworkError, getErrorMessage, is404Error, isSkipableError } from '../utils/errors';
import { parseDateRange, isDateInRange } from '../utils/date-utils';
import { PixivClient, PixivIllust, PixivIllustPage, PixivNovel } from '../pixiv/PixivClient';
import { Database } from '../storage/Database';
import { FileService, FileMetadata, PixivMetadata } from './FileService';
import { detectLanguage } from '../utils/language-detection';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export class DownloadManager {
  private progressCallback?: (current: number, total: number, message?: string) => void;

  constructor(
    private readonly config: StandaloneConfig,
    private readonly client: PixivClient,
    private readonly database: Database,
    private readonly fileService: FileService
  ) {}

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (current: number, total: number, message?: string) => void): void {
    this.progressCallback = callback;
  }

  public async initialise() {
    await this.fileService.initialise();
  }

  public async runAllTargets() {
    const totalTargets = this.config.targets.length;
    let currentTarget = 0;
    const errors: Array<{ target: string; error: string }> = [];

    for (const target of this.config.targets) {
      currentTarget++;
      const targetName = target.filterTag || target.tag || 'unknown';
      this.updateProgress(currentTarget, totalTargets, `处理目标: ${targetName} (${target.type})`);

      try {
        switch (target.type) {
          case 'illustration':
            await this.handleIllustrationTarget(target);
            break;
          case 'novel':
            await this.handleNovelTarget(target);
            break;
          default:
            logger.warn(`Unsupported target type ${target.type}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ target: `${targetName} (${target.type})`, error: errorMessage });
        logger.error(`Target ${targetName} (${target.type}) failed, continuing with next target`, { error: errorMessage });
        // Continue to next target instead of stopping
      }
    }

    if (this.progressCallback) {
      this.progressCallback(totalTargets, totalTargets, '所有目标处理完成');
    }

    // Log summary if there were any errors
    if (errors.length > 0) {
      logger.warn(`Completed with ${errors.length} target(s) failed`, { 
        failedTargets: errors.length,
        totalTargets,
        errors: errors.map(e => `${e.target}: ${e.error}`).join('; ')
      });
      if (errors.length === totalTargets) {
        // All targets failed, throw an error
        throw new Error(`All ${totalTargets} target(s) failed. See logs for details.`);
      }
    }
  }

  /**
   * Update progress
   */
  private updateProgress(current: number, total: number, message?: string): void {
    if (this.progressCallback) {
      this.progressCallback(current, total, message);
    }
  }

  /**
   * Calculate popularity score for an illustration or novel
   * Uses total_bookmarks (preferred) or bookmark_count as primary metric
   */
  private getPopularityScore(item: PixivIllust | PixivNovel): number {
    // Prefer total_bookmarks, fallback to bookmark_count
    const bookmarks = item.total_bookmarks ?? item.bookmark_count ?? 0;
    // Use view count as secondary metric (weighted lower)
    const views = item.total_view ?? item.view_count ?? 0;
    // Combined score: bookmarks are primary, views are secondary (divide by 1000 to normalize)
    return bookmarks + (views / 1000);
  }

  /**
   * Sort items by popularity and log top results
   */
  private sortByPopularityAndLog<T extends PixivIllust | PixivNovel>(
    items: T[],
    limit: number,
    itemType: 'illustration' | 'novel'
  ): void {
    if (items.length === 0) {
      return;
    }

    items.sort((a, b) => {
      const scoreA = this.getPopularityScore(a);
      const scoreB = this.getPopularityScore(b);
      return scoreB - scoreA; // Descending order
    });

    const topN = Math.min(items.length, limit);
    const typeLabel = itemType === 'illustration' ? 'Illust' : 'Novel';
    logger.info(`Sorted ${items.length} matching ${itemType}s by popularity`);
    
    for (let i = 0; i < topN; i++) {
      const item = items[i];
      const bookmarks = item.total_bookmarks ?? item.bookmark_count ?? 0;
      const views = item.total_view ?? item.view_count ?? 0;
      logger.info(`  Rank ${i + 1}: ${typeLabel} ${item.id} - ${bookmarks} bookmarks, ${views} views`, {
        [`${itemType}Id`]: item.id,
        title: item.title,
        bookmarks,
        views,
      });
    }
  }

  /**
   * Sort items by date (newest first)
   */
  private sortByDate<T extends PixivIllust | PixivNovel>(
    items: T[],
    ascending: boolean = false
  ): void {
    items.sort((a, b) => {
      const dateA = a.create_date ? new Date(a.create_date).getTime() : 0;
      const dateB = b.create_date ? new Date(b.create_date).getTime() : 0;
      return ascending ? dateA - dateB : dateB - dateA;
    });
  }

  /**
   * Process items in parallel with intelligent concurrency control
   * Features:
   * - Queue-based processing (maintains stable concurrency)
   * - Request delay between API calls (rate limiting protection)
   * - Dynamic concurrency adjustment (reduces on rate limit errors)
   */
  private async processInParallel<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = 3
  ): Promise<Array<{ success: true; result: R } | { success: false; error: Error }>> {
    const results: Array<{ success: true; result: R } | { success: false; error: Error }> = [];
    
    if (items.length === 0) {
      return results;
    }
    
    // Get configuration
    const requestDelay = this.config.download?.requestDelay ?? 500;
    const dynamicConcurrency = this.config.download?.dynamicConcurrency ?? true;
    const minConcurrency = this.config.download?.minConcurrency ?? 1;
    
    // If concurrency is 1, process sequentially with delay
    if (concurrency === 1) {
      for (const item of items) {
        try {
          const result = await processor(item);
          results.push({ success: true, result });
          // Add delay between requests to avoid rate limiting
          if (requestDelay > 0 && items.indexOf(item) < items.length - 1) {
            await new Promise(resolve => setTimeout(resolve, requestDelay));
          }
        } catch (error) {
          results.push({ success: false, error: error instanceof Error ? error : new Error(String(error)) });
        }
      }
      return results;
    }
    
    // Queue-based processing with dynamic concurrency
    let currentConcurrency = concurrency;
    let rateLimitCount = 0;
    const queue = [...items];
    const inProgress = new Set<Promise<void>>();
    let lastRequestTime = 0;
    
    // Initialize results array
    results.length = items.length;
    
    const processItem = async (item: T, index: number): Promise<void> => {
      try {
        // Rate limiting: ensure minimum delay between requests
        if (requestDelay > 0) {
          const now = Date.now();
          const timeSinceLastRequest = now - lastRequestTime;
          if (timeSinceLastRequest < requestDelay) {
            await new Promise(resolve => setTimeout(resolve, requestDelay - timeSinceLastRequest));
          }
          lastRequestTime = Date.now();
        }
        
        const result = await processor(item);
        results[index] = { success: true, result };
        
        // On success, gradually increase concurrency if it was reduced
        if (dynamicConcurrency && currentConcurrency < concurrency && rateLimitCount > 0) {
          rateLimitCount = Math.max(0, rateLimitCount - 1);
          if (rateLimitCount === 0) {
            currentConcurrency = Math.min(concurrency, currentConcurrency + 1);
            logger.debug(`Concurrency increased to ${currentConcurrency} after successful requests`);
          }
        }
      } catch (error) {
        results[index] = { 
          success: false, 
          error: error instanceof Error ? error : new Error(String(error)) 
        };
        
        // Check if this is a rate limit error
        const isRateLimit = error instanceof NetworkError && error.isRateLimit === true;
        
        if (isRateLimit && dynamicConcurrency) {
          rateLimitCount++;
          const previousConcurrency = currentConcurrency;
          // Reduce concurrency on rate limit errors (halve it, but not below minimum)
          const newConcurrency = Math.max(minConcurrency, Math.floor(currentConcurrency * 0.5));
          if (newConcurrency < currentConcurrency) {
            currentConcurrency = newConcurrency;
            logger.warn(`Rate limit detected (429). Reducing concurrency from ${previousConcurrency} to ${currentConcurrency}`, {
              previousConcurrency,
              newConcurrency: currentConcurrency,
              minConcurrency,
              rateLimitCount,
              originalConcurrency: concurrency
            });
          } else {
            logger.warn(`Rate limit detected (429), but concurrency already at minimum (${minConcurrency})`, {
              currentConcurrency,
              minConcurrency,
              rateLimitCount,
              originalConcurrency: concurrency
            });
          }
        }
      }
    };
    
    // Process queue with dynamic concurrency
    let itemIndex = 0;
    while (itemIndex < queue.length || inProgress.size > 0) {
      // Start new tasks up to current concurrency limit
      while (inProgress.size < currentConcurrency && itemIndex < queue.length) {
        const item = queue[itemIndex];
        const index = itemIndex;
        itemIndex++;
        
        const task = processItem(item, index).finally(() => {
          inProgress.delete(task);
        });
        
        inProgress.add(task);
      }
      
      // Wait for at least one task to complete
      if (inProgress.size > 0) {
        await Promise.race(Array.from(inProgress));
      }
    }
    
    return results;
  }

  /**
   * Handle download error and determine if should skip
   */
  private handleDownloadError(
    error: unknown,
    itemId: number,
    itemType: 'illustration' | 'novel',
    itemTitle?: string
  ): { shouldSkip: boolean; is404: boolean; message: string } {
    const errorMessage = getErrorMessage(error);
    const is404 = is404Error(error);
    const shouldSkip = isSkipableError(error);
    
    if (is404) {
      logger.debug(`${itemType === 'illustration' ? 'Illustration' : 'Novel'} ${itemId} not found (deleted or private), skipping`);
      return { shouldSkip: true, is404: true, message: errorMessage };
    } else if (shouldSkip) {
      logger.warn(`Failed to download ${itemType} ${itemId} (will skip)`, {
        error: errorMessage,
        ...(itemTitle && { [`${itemType}Title`]: itemTitle }),
        [`${itemType}Id`]: itemId,
      });
      return { shouldSkip: true, is404: false, message: errorMessage };
    } else {
      // Non-skipable error - log as error
      logger.error(`Failed to download ${itemType} ${itemId}`, {
        error: errorMessage,
        ...(itemTitle && { [`${itemType}Title`]: itemTitle }),
        [`${itemType}Id`]: itemId,
      });
      return { shouldSkip: false, is404: false, message: errorMessage };
    }
  }

  /**
   * Filter items based on minBookmarks, startDate, and endDate criteria
   */
  private filterItems<T extends PixivIllust | PixivNovel>(
    items: T[],
    target: TargetConfig,
    itemType: 'illustration' | 'novel'
  ): T[] {
    let filtered = [...items];
    const originalCount = filtered.length;

    // Filter by minimum bookmarks
    if (target.minBookmarks !== undefined) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(item => {
        const bookmarks = item.total_bookmarks ?? item.bookmark_count ?? 0;
        return bookmarks >= target.minBookmarks!;
      });
      if (filtered.length < beforeCount) {
        logger.info(`Filtered by minBookmarks (>= ${target.minBookmarks}): ${beforeCount} -> ${filtered.length} ${itemType}(s)`);
      }
    }

    // Filter by date range
    if (target.startDate || target.endDate) {
      const beforeCount = filtered.length;
      const dateRange = parseDateRange(target.startDate, target.endDate);
      
      if (dateRange === null) {
        logger.warn('Invalid date range in filterItems, skipping date filter', {
          startDate: target.startDate,
          endDate: target.endDate
        });
      } else {
        const { startDate, endDate } = dateRange;
        
        filtered = filtered.filter(item => {
          if (!item.create_date) {
            return false; // Skip items without create_date
          }
          const itemDate = new Date(item.create_date);
          
          // Check if date is valid
          if (!itemDate || isNaN(itemDate.getTime())) {
            return false; // Skip items with invalid dates
          }
          
          return isDateInRange(itemDate, startDate, endDate);
        });

        if (filtered.length < beforeCount) {
          const dateRangeStr = [
            target.startDate || 'unlimited',
            target.endDate || 'unlimited'
          ].join(' ~ ');
          logger.info(`Filtered by date range (${dateRangeStr}): ${beforeCount} -> ${filtered.length} ${itemType}(s)`);
        }
      }
    }

    if (filtered.length < originalCount) {
      logger.info(`Total filtering: ${originalCount} -> ${filtered.length} ${itemType}(s) after applying all filters`);
    }

    return filtered;
  }

  /**
   * Generic download loop for illustrations or novels
   */
  private async downloadItems<T extends PixivIllust | PixivNovel>(
    items: T[],
    target: TargetConfig,
    itemType: 'illustration' | 'novel',
    downloadFn: (item: T, tag: string) => Promise<void>
  ): Promise<{ downloaded: number; skipped: number }> {
    let downloaded = 0;
    let skippedCount = 0;
    const tagForLog = target.filterTag || target.tag || 'unknown';
    const targetLimit = target.limit || (itemType === 'illustration' ? 10 : 10);

    // Apply filters (minBookmarks, startDate, endDate)
    const filteredItems = this.filterItems(items, target, itemType);

    // Update progress: starting download
    this.updateProgress(0, targetLimit, `准备下载 ${itemType === 'illustration' ? '插画' : '小说'}: ${tagForLog}`);

    // Batch check for already downloaded items to optimize database queries
    const itemIds = filteredItems.map(item => String(item.id));
    const downloadedIds = this.database.getDownloadedIds(itemIds, itemType);

    // Random selection mode
    if (target.random && filteredItems.length > 0) {
      // Filter out already downloaded items
      let available = filteredItems.filter(item => 
        !downloadedIds.has(String(item.id))
      );
      
      if (available.length === 0) {
        logger.info('All search results have already been downloaded');
      } else {
        // Try random items until we find one that works or exhaust all options
        const maxAttempts = Math.min(available.length, 50);
        const triedIds = new Set<number>();
        
        for (let attempt = 0; attempt < maxAttempts && downloaded < targetLimit; attempt++) {
          // Filter out already tried items
          const remaining = available.filter(item => !triedIds.has(item.id));
          if (remaining.length === 0) {
            logger.info(`All available ${itemType}s have been tried`);
            break;
          }
          
          // Randomly select from remaining items
          const randomIndex = Math.floor(Math.random() * remaining.length);
          const randomItem = remaining[randomIndex];
          triedIds.add(randomItem.id);
          
          const typeLabel = itemType === 'illustration' ? 'Illustration' : 'Novel';
          logger.info(`Randomly selected ${typeLabel.toLowerCase()} ${randomItem.id} from ${remaining.length} remaining results (attempt ${attempt + 1}/${maxAttempts})`);
          
          try {
            await downloadFn(randomItem, tagForLog);
            downloaded++;
            this.updateProgress(downloaded, targetLimit, `已下载 ${itemType === 'illustration' ? '插画' : '小说'} ${randomItem.id} (${downloaded}/${targetLimit})`);
            if (itemType === 'novel') {
              logger.info(`Successfully downloaded novel ${randomItem.id} (${downloaded}/${targetLimit})`);
            }
            // If we only need one and got it, we're done
            if (targetLimit === 1) {
              break;
            }
          } catch (error) {
            skippedCount++;
            const { shouldSkip } = this.handleDownloadError(
              error,
              randomItem.id,
              itemType,
              randomItem.title
            );
            if (!shouldSkip) {
              // For non-skip errors, continue trying
              continue;
            }
          }
        }
      }
    } else {
      // Sequential download mode
      for (let i = 0; i < filteredItems.length && downloaded < targetLimit; i++) {
        const item = filteredItems[i];
        
        if (downloadedIds.has(String(item.id))) {
          logger.debug(`${itemType === 'illustration' ? 'Illustration' : 'Novel'} ${item.id} already downloaded, skipping`);
          skippedCount++;
          continue;
        }

        try {
          await downloadFn(item, tagForLog);
          downloaded++;
          this.updateProgress(downloaded, targetLimit, `已下载 ${itemType === 'illustration' ? '插画' : '小说'} ${item.id} (${downloaded}/${targetLimit})`);
          if (itemType === 'novel') {
            logger.info(`Successfully downloaded novel ${item.id} (${downloaded}/${targetLimit})`);
          }
          // If we only need one and got it, we're done
          if (targetLimit === 1) {
            break;
          }
        } catch (error) {
          skippedCount++;
          this.handleDownloadError(error, item.id, itemType, item.title);
          // Continue to next item
          continue;
        }
      }
    }

    // Update progress: completed
    this.updateProgress(downloaded, targetLimit, `完成下载: ${downloaded} 个 ${itemType === 'illustration' ? '插画' : '小说'}`);

    return { downloaded, skipped: skippedCount };
  }

  private async handleIllustrationTarget(target: TargetConfig) {
    const mode = target.mode || 'search';
    const displayTag = target.filterTag || target.tag || 'unknown';
    logger.info(`Processing illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag}`);
    
    try {
      let illusts: PixivIllust[] = [];
      
      if (mode === 'ranking') {
        // If filterTag is specified, use search API with popularity sort instead of ranking API
        // This avoids making many detail API calls which can trigger rate limits
        if (target.filterTag) {
          logger.info(`Using search API with popularity sort for tag: ${target.filterTag} (more efficient than ranking + filter)`);
          const searchTarget = {
            ...target,
            tag: target.filterTag,
            sort: 'popular_desc' as const,
            // Fetch more results to ensure we get enough valid ones after filtering
            limit: Math.max((target.limit || 10) * 2, 50),
          };
          illusts = await this.client.searchIllustrations(searchTarget);
          logger.info(`Found ${illusts.length} illustration(s) from search API (sorted by popularity)`);
          
          // Apply limit after getting results
          if (target.limit && illusts.length > target.limit) {
            illusts = illusts.slice(0, target.limit);
            logger.info(`Selected top ${illusts.length} illustration(s) by popularity`);
          }
        } else {
          // No filterTag, use ranking API directly with automatic fallback
          const rankingMode = target.rankingMode || 'day';
          let rankingDate = target.rankingDate || this.getTodayDate();
          // Process YESTERDAY placeholder
          if (rankingDate === 'YESTERDAY') {
            rankingDate = this.getYesterdayDate();
          }
          
          logger.info(`Fetching ranking illustrations (mode: ${rankingMode}, date: ${rankingDate})`);
          // Use ranking API directly - follow "use API if available" principle
          illusts = await this.getRankingIllustrationsWithFallback(rankingMode, rankingDate, target.limit);
          logger.info(`Ranking API returned ${illusts.length} illustration(s)`);
        }
      } else {
        // Search by tag (default mode)
        // Optimize fetch limit for search mode to handle 404s better
        // If using popularity sort, fetch more results to ensure we get enough valid ones
        const targetLimit = target.limit || 10;
        const searchLimit = target.sort === 'popular_desc' 
          ? (targetLimit <= 5 ? Math.max(targetLimit * 20, 100) : targetLimit * 2)
          : (targetLimit <= 5 ? Math.max(targetLimit * 10, 50) : targetLimit * 2);
        const searchTarget = { ...target, limit: searchLimit };
        
        if (searchLimit > targetLimit) {
          logger.info(`Fetching up to ${searchLimit} search results to find ${targetLimit} valid illustration(s)`);
        }
        illusts = await this.client.searchIllustrations(searchTarget);
        logger.info(`Found ${illusts.length} search results`);
        
        // If using popularity sort, results are already sorted by API
        // But we can still apply our own sorting for consistency
        if (target.sort === 'popular_desc') {
          this.sortByPopularityAndLog(illusts, targetLimit, 'illustration');
        }
      }
      
      const { downloaded, skipped: skippedCount } = await this.downloadItems(
        illusts,
        target,
        'illustration',
        (illust, tag) => this.downloadIllustration(illust, tag)
      );

      const targetLimit = target.limit || 10;
      const tagForLog = target.filterTag || target.tag || 'unknown';

      // Check if download actually succeeded
      if (downloaded === 0 && targetLimit > 0) {
        let errorMessage: string;
        if (skippedCount > 0) {
          errorMessage = `Failed to download any illustrations. Requested ${targetLimit}, but all ${skippedCount} attempt(s) failed or were skipped (likely already downloaded or inaccessible).`;
        } else {
          errorMessage = `Failed to download any illustrations. Requested ${targetLimit}, but no matching illustrations were found or all were already downloaded.`;
        }
        this.database.logExecution(tagForLog, 'illustration', 'failed', errorMessage);
        logger.error(`Illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${tagForLog} failed: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      // Warn if downloaded significantly less than requested
      if (downloaded > 0 && downloaded < targetLimit * 0.5 && skippedCount > 0) {
        logger.warn(`Only downloaded ${downloaded} out of ${targetLimit} requested illustration(s). ${skippedCount} illustration(s) were skipped due to errors.`);
      }

      if (skippedCount > 0) {
        logger.info(`Skipped ${skippedCount} illustration(s) (deleted, private, or inaccessible)`);
      }

      this.database.logExecution(tagForLog, 'illustration', 'success', `${downloaded} items downloaded`);
      logger.info(`Illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${tagForLog} completed`, { downloaded });
    } catch (error) {
      // Get detailed error information
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Add more context if it's a NetworkError
      if (error instanceof NetworkError && error.cause) {
        const causeMsg = error.cause instanceof Error ? error.cause.message : String(error.cause);
        errorMessage = `${errorMessage} (原因: ${causeMsg})`;
      }
      
      // Add URL information if available
      if (error instanceof NetworkError && error.url) {
        errorMessage = `${errorMessage} [URL: ${error.url}]`;
      }
      
      this.database.logExecution(displayTag, 'illustration', 'failed', errorMessage);
      logger.error(`Illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag} failed`, { 
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw to allow upper level handling
      throw error;
    }
  }

  private async handleNovelTarget(target: TargetConfig) {
    // Check if this is a single novel download
    if (target.novelId) {
      logger.info(`Processing single novel ${target.novelId}`);
      try {
        if (this.database.hasDownloaded(String(target.novelId), 'novel')) {
          logger.info(`Novel ${target.novelId} already downloaded, skipping`);
          return;
        }

        // Get novel detail first
        const detail = await this.client.getNovelDetail(target.novelId);
        const novel: PixivNovel = {
          id: detail.id,
          title: detail.title,
          user: detail.user,
          create_date: detail.create_date,
        };

        await this.downloadNovel(novel, `novel-${target.novelId}`, target);
        logger.info(`Successfully downloaded novel ${target.novelId}`);
      } catch (error) {
        // Get detailed error information
        let errorMessage = error instanceof Error ? error.message : String(error);
        
        // Add more context if it's a NetworkError
        if (error instanceof NetworkError && error.cause) {
          const causeMsg = error.cause instanceof Error ? error.cause.message : String(error.cause);
          errorMessage = `${errorMessage} (原因: ${causeMsg})`;
        }
        
        // Add URL information if available
        if (error instanceof NetworkError && error.url) {
          errorMessage = `${errorMessage} [URL: ${error.url}]`;
        }
        
        logger.error(`Failed to download novel ${target.novelId}`, {
          error: errorMessage,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }
      return;
    }
    
    // Check if this is a series download
    if (target.seriesId) {
      logger.info(`Processing novel series ${target.seriesId}`);
      try {
        const novels = await this.client.getNovelSeries(target.seriesId);
        logger.info(`Found ${novels.length} novels in series ${target.seriesId}`);
        
        let downloaded = 0;
        const targetLimit = target.limit || novels.length; // Default to all novels in series
        
        for (let i = 0; i < novels.length && downloaded < targetLimit; i++) {
          const novel = novels[i];
          
          if (this.database.hasDownloaded(String(novel.id), 'novel')) {
            logger.debug(`Novel ${novel.id} already downloaded, skipping`);
            continue;
          }

          try {
            await this.downloadNovel(novel, `series-${target.seriesId}`, target);
            downloaded++;
            logger.info(`Successfully downloaded novel ${novel.id} from series (${downloaded}/${Math.min(targetLimit, novels.length)})`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn(`Failed to download novel ${novel.id} from series`, { 
              error: errorMessage,
              novelTitle: novel.title,
              novelId: novel.id
            });
            // Continue with next novel
            continue;
          }
        }
        
        logger.info(`Series download completed: ${downloaded} novel(s) downloaded from series ${target.seriesId}`);
        return;
      } catch (error) {
        logger.error(`Failed to download novel series ${target.seriesId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
    
    const mode = target.mode || 'search';
    const displayTag = target.filterTag || target.tag || 'unknown';
    logger.info(`Processing novel ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag}`);
    
    try {
      let novels: PixivNovel[] = [];
      
      if (mode === 'ranking') {
        // If filterTag is specified, use search API with popularity sort instead of ranking API
        // This avoids making many detail API calls which can trigger rate limits
        if (target.filterTag) {
          logger.info(`Using search API with popularity sort for tag: ${target.filterTag} (more efficient than ranking + filter)`);
          const searchTarget = {
            ...target,
            tag: target.filterTag,
            sort: 'popular_desc' as const,
            // Fetch more results to ensure we get enough valid ones after filtering
            limit: Math.max((target.limit || 10) * 2, 50),
          };
          novels = await this.client.searchNovels(searchTarget);
          logger.info(`Found ${novels.length} novel(s) from search API (sorted by popularity)`);
          
          // Apply limit after getting results
          if (target.limit && novels.length > target.limit) {
            novels = novels.slice(0, target.limit);
            logger.info(`Selected top ${novels.length} novel(s) by popularity`);
          }
        } else {
          // No filterTag, use ranking API directly with automatic fallback
          const rankingMode = target.rankingMode || 'day';
          let rankingDate = target.rankingDate || this.getTodayDate();
          // Process YESTERDAY placeholder
          if (rankingDate === 'YESTERDAY') {
            rankingDate = this.getYesterdayDate();
          }
          
          logger.info(`Fetching ranking novels (mode: ${rankingMode}, date: ${rankingDate})`);
          // Use ranking API directly - follow "use API if available" principle
          novels = await this.getRankingNovelsWithFallback(rankingMode, rankingDate, target.limit);
          logger.info(`Ranking API returned ${novels.length} novel(s)`);
        }
      } else {
        // Search by tag (default mode)
        // Optimize fetch limit for search mode to handle 404s better
        // If using popularity sort, fetch more results to ensure we get enough valid ones
        const targetLimit = target.limit || 10;
        const searchLimit = target.sort === 'popular_desc' 
          ? (targetLimit <= 5 ? Math.max(targetLimit * 20, 100) : targetLimit * 2)
          : (targetLimit <= 5 ? Math.max(targetLimit * 10, 50) : targetLimit * 2);
        const searchTarget = { ...target, limit: searchLimit };
        
        if (searchLimit > targetLimit) {
          logger.info(`Fetching up to ${searchLimit} search results to find ${targetLimit} valid novel(s)`);
        }
        novels = await this.client.searchNovels(searchTarget);
        logger.info(`Found ${novels.length} search results`);
        
        // If using popularity sort, results are already sorted by API
        // But we can still apply our own sorting for consistency
        if (target.sort === 'popular_desc') {
          this.sortByPopularityAndLog(novels, targetLimit, 'novel');
        }
      }
      
      const targetLimit = target.limit || 10;
      const { downloaded, skipped: skippedCount } = await this.downloadItems(
        novels,
        target,
        'novel',
        (novel, tag) => this.downloadNovel(novel, tag, target)
      );
      
      const tagForLog = target.filterTag || target.tag || 'unknown';

      // Check if download actually succeeded
      if (downloaded === 0 && targetLimit > 0) {
        const errorMessage = `Failed to download any novels. Requested ${targetLimit}, but all ${skippedCount} attempt(s) failed or were skipped.`;
        this.database.logExecution(tagForLog, 'novel', 'failed', errorMessage);
        logger.error(`Novel ${mode === 'ranking' ? 'ranking' : 'tag'} ${tagForLog} failed: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      // Warn if downloaded significantly less than requested
      if (downloaded > 0 && downloaded < targetLimit * 0.5 && skippedCount > 0) {
        logger.warn(`Only downloaded ${downloaded} out of ${targetLimit} requested novel(s). ${skippedCount} novel(s) were skipped due to 404 errors or other issues.`);
      }

      if (skippedCount > 0) {
        logger.info(`Skipped ${skippedCount} novel(s) (deleted, private, or inaccessible)`);
      }

      this.database.logExecution(tagForLog, 'novel', 'success', `${downloaded} items downloaded`);
      logger.info(`Novel ${mode === 'ranking' ? 'ranking' : 'tag'} ${tagForLog} completed`, { downloaded });
    } catch (error) {
      // Get detailed error information
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Add more context if it's a NetworkError
      if (error instanceof NetworkError && error.cause) {
        const causeMsg = error.cause instanceof Error ? error.cause.message : String(error.cause);
        errorMessage = `${errorMessage} (原因: ${causeMsg})`;
      }
      
      // Add URL information if available
      if (error instanceof NetworkError && error.url) {
        errorMessage = `${errorMessage} [URL: ${error.url}]`;
      }
      
      this.database.logExecution(displayTag, 'novel', 'failed', errorMessage);
      logger.error(`Novel ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag} failed`, { 
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw to allow upper level handling
      throw error;
    }
  }

  /**
   * Format date in YYYY-MM-DD format (Japan timezone)
   * Pixiv rankings are based on Japan time (JST, UTC+9)
   */
  private formatDateInJST(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')!.value;
    const month = parts.find(p => p.type === 'month')!.value;
    const day = parts.find(p => p.type === 'day')!.value;
    
    return `${year}-${month}-${day}`;
  }

  /**
   * Get today's date in YYYY-MM-DD format (Japan timezone)
   * Pixiv rankings are based on Japan time (JST, UTC+9)
   */
  private getTodayDate(): string {
    return this.formatDateInJST(new Date());
  }

  /**
   * Get yesterday's date in YYYY-MM-DD format (Japan timezone)
   * Pixiv rankings are based on Japan time (JST, UTC+9)
   */
  private getYesterdayDate(): string {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    // Get current date components in JST
    const todayParts = formatter.formatToParts(now);
    const year = parseInt(todayParts.find(p => p.type === 'year')!.value, 10);
    const month = parseInt(todayParts.find(p => p.type === 'month')!.value, 10) - 1; // 0-indexed
    const day = parseInt(todayParts.find(p => p.type === 'day')!.value, 10);
    
    // Create a date object in JST and subtract one day
    // We create a date at noon JST to avoid timezone edge cases
    const jstNoon = new Date(Date.UTC(year, month, day, 3, 0, 0, 0)); // 12:00 JST = 03:00 UTC
    jstNoon.setUTCDate(jstNoon.getUTCDate() - 1);
    
    return this.formatDateInJST(jstNoon);
  }

  /**
   * Get this week's Monday date in YYYY-MM-DD format (Japan timezone)
   * Pixiv rankings are based on Japan time (JST, UTC+9)
   */
  private getThisWeekMonday(): string {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
    });
    
    // Get current date components in JST
    const todayParts = formatter.formatToParts(now);
    const year = parseInt(todayParts.find(p => p.type === 'year')!.value, 10);
    const month = parseInt(todayParts.find(p => p.type === 'month')!.value, 10) - 1; // 0-indexed
    const day = parseInt(todayParts.find(p => p.type === 'day')!.value, 10);
    const weekday = todayParts.find(p => p.type === 'weekday')!.value;
    
    // Calculate days to subtract to get Monday (Monday = 0, Sunday = 6)
    const weekdayMap: Record<string, number> = {
      'Monday': 0,
      'Tuesday': 1,
      'Wednesday': 2,
      'Thursday': 3,
      'Friday': 4,
      'Saturday': 5,
      'Sunday': 6,
    };
    const daysToSubtract = weekdayMap[weekday] || 0;
    
    // Create a date object in JST at noon to avoid timezone edge cases
    const jstNoon = new Date(Date.UTC(year, month, day, 3, 0, 0, 0)); // 12:00 JST = 03:00 UTC
    jstNoon.setUTCDate(jstNoon.getUTCDate() - daysToSubtract);
    
    return this.formatDateInJST(jstNoon);
  }

  /**
   * Get last week's Monday date in YYYY-MM-DD format (Japan timezone)
   * Pixiv rankings are based on Japan time (JST, UTC+9)
   */
  private getLastWeekMonday(): string {
    const thisWeekMonday = this.getThisWeekMonday();
    const [year, month, day] = thisWeekMonday.split('-').map(Number);
    
    // Create a date object in JST at noon and subtract 7 days
    const jstNoon = new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0)); // 12:00 JST = 03:00 UTC
    jstNoon.setUTCDate(jstNoon.getUTCDate() - 7);
    
    return this.formatDateInJST(jstNoon);
  }

  /**
   * Get ranking illustrations with automatic fallback for week mode
   * If week ranking fails, automatically tries:
   * 1. This week's ranking (without date or with this week's date)
   * 2. Day ranking with last week's Monday date
   */
  private async getRankingIllustrationsWithFallback(
    mode: string,
    date: string | undefined,
    limit: number | undefined
  ): Promise<PixivIllust[]> {
    // If not week mode, use normal ranking API directly
    if (mode !== 'week') {
      return await this.client.getRankingIllustrations(mode, date, limit);
    }

    // For week mode: try API first, only fallback if API throws an error
    try {
      logger.info(`Using week ranking API with date: ${date || 'current week'}`);
      const results = await this.client.getRankingIllustrations(mode, date, limit);
      logger.info(`Week ranking API returned ${results.length} illustrations`);
      return results; // Use API result directly, even if empty
    } catch (error) {
      logger.warn(`Week ranking API failed for date: ${date || 'current week'}`, { error: error instanceof Error ? error.message : String(error) });
      
      // Only fallback if API throws an error
      // Fallback 1: Try this week's ranking
      try {
        const thisWeekMonday = this.getThisWeekMonday();
        logger.info(`Fallback: Trying this week's ranking (date: ${thisWeekMonday})`);
        const results = await this.client.getRankingIllustrations(mode, thisWeekMonday, limit);
        logger.info(`This week's ranking API returned ${results.length} illustrations`);
        return results;
      } catch (fallbackError) {
        logger.warn(`This week's ranking API also failed`, { error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) });
        
        // Fallback 2: Try day ranking with last week's Monday
        try {
          const lastWeekMonday = this.getLastWeekMonday();
          logger.info(`Fallback: Trying day ranking with last week's Monday (date: ${lastWeekMonday})`);
          const results = await this.client.getRankingIllustrations('day', lastWeekMonday, limit);
          logger.info(`Day ranking API returned ${results.length} illustrations`);
          return results;
        } catch (finalError) {
          logger.error(`All ranking API calls failed. Returning empty results.`, { error: finalError instanceof Error ? finalError.message : String(finalError) });
          return [];
        }
      }
    }
  }

  /**
   * Get ranking novels with automatic fallback for week mode
   * If week ranking API throws an error, automatically tries:
   * 1. This week's ranking (without date or with this week's date)
   * 2. Day ranking with last week's Monday date
   */
  private async getRankingNovelsWithFallback(
    mode: string,
    date: string | undefined,
    limit: number | undefined
  ): Promise<PixivNovel[]> {
    // If not week mode, use normal ranking API directly
    if (mode !== 'week') {
      return await this.client.getRankingNovels(mode, date, limit);
    }

    // For week mode: try API first, only fallback if API throws an error
    try {
      logger.info(`Using week ranking API with date: ${date || 'current week'}`);
      const results = await this.client.getRankingNovels(mode, date, limit);
      logger.info(`Week ranking API returned ${results.length} novels`);
      return results; // Use API result directly, even if empty
    } catch (error) {
      logger.warn(`Week ranking API failed for date: ${date || 'current week'}`, { error: error instanceof Error ? error.message : String(error) });
      
      // Only fallback if API throws an error
      // Fallback 1: Try this week's ranking
      try {
        const thisWeekMonday = this.getThisWeekMonday();
        logger.info(`Fallback: Trying this week's ranking (date: ${thisWeekMonday})`);
        const results = await this.client.getRankingNovels(mode, thisWeekMonday, limit);
        logger.info(`This week's ranking API returned ${results.length} novels`);
        return results;
      } catch (fallbackError) {
        logger.warn(`This week's ranking API also failed`, { error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) });
        
        // Fallback 2: Try day ranking with last week's Monday
        try {
          const lastWeekMonday = this.getLastWeekMonday();
          logger.info(`Fallback: Trying day ranking with last week's Monday (date: ${lastWeekMonday})`);
          const results = await this.client.getRankingNovels('day', lastWeekMonday, limit);
          logger.info(`Day ranking API returned ${results.length} novels`);
          return results;
        } catch (finalError) {
          logger.error(`All ranking API calls failed. Returning empty results.`, { error: finalError instanceof Error ? finalError.message : String(finalError) });
          return [];
        }
      }
    }
  }

  /**
   * Check if illustration files already exist in the file system
   * Returns array of existing file paths, or empty array if none found
   */
  private async findExistingIllustrationFiles(illustId: number): Promise<string[]> {
    const baseDirectory = this.config.storage!.illustrationDirectory ?? this.config.storage!.downloadDirectory!;
    const existingFiles: string[] = [];
    
    try {
      // Search for files matching the pattern: {illustId}_*.{ext}
      // We need to search recursively in case files are organized by date/author/tag
      const searchPattern = new RegExp(`^${illustId}_.+\\.[^.]+$`);
      
      const searchDirectory = async (dir: string): Promise<void> => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              await searchDirectory(fullPath);
            } else if (entry.isFile() && searchPattern.test(entry.name)) {
              existingFiles.push(fullPath);
            }
          }
        } catch (error) {
          // Ignore errors when reading directories (permissions, etc.)
          logger.debug(`Error searching directory ${dir}: ${getErrorMessage(error)}`);
        }
      };
      
      await searchDirectory(baseDirectory);
    } catch (error) {
      logger.debug(`Error finding existing files for illustration ${illustId}: ${getErrorMessage(error)}`);
    }
    
    return existingFiles;
  }

  private async downloadIllustration(illust: PixivIllust, tag: string) {
    // Check if files already exist in file system but not in database
    const existingFiles = await this.findExistingIllustrationFiles(illust.id);
    if (existingFiles.length > 0 && !this.database.hasDownloaded(String(illust.id), 'illustration')) {
      // Files exist but not in database - update database and skip download
      logger.info(`Found existing files for illustration ${illust.id} but missing database record. Updating database...`);
      
      // Get illustration detail with tags to get full information
      const { illust: detail, tags } = await Promise.race([
        this.client.getIllustDetailWithTags(illust.id),
        new Promise<{ illust: PixivIllust; tags: Array<{ name: string; translated_name?: string }> }>((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout: Failed to get illustration detail for ${illust.id} within 60 seconds`)), 60000)
        )
      ]);
      
      // Insert database records for existing files
      for (const filePath of existingFiles) {
        this.database.insertDownload({
          pixivId: String(detail.id),
          type: 'illustration',
          tag,
          title: detail.title,
          filePath,
          author: detail.user?.name,
          userId: detail.user?.id,
        });
      }
      
      logger.info(`Updated database with ${existingFiles.length} existing file(s) for illustration ${detail.id}`);
      return; // Skip download
    }
    
    // Add timeout protection for getIllustDetailWithTags to prevent hanging
    const { illust: detail, tags } = await Promise.race([
      this.client.getIllustDetailWithTags(illust.id),
      new Promise<{ illust: PixivIllust; tags: Array<{ name: string; translated_name?: string }> }>((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout: Failed to get illustration detail for ${illust.id} within 60 seconds`)), 60000)
      )
    ]);
    const pages = this.getIllustrationPages(detail);

    // Use parallel download for multiple pages to improve performance
    const concurrency = this.config.download?.concurrency || 3;
    const downloadConcurrency = Math.min(concurrency, pages.length);
    
    if (pages.length > 1) {
      logger.debug(`Downloading ${pages.length} pages for illustration ${detail.id} in parallel (concurrency: ${downloadConcurrency})`);
    }

    const downloadResults = await this.processInParallel(
      pages.map((page, index) => ({ page, index })),
      async ({ page, index }) => {
        const originalUrl = this.resolveImageUrl(page, detail);
        if (!originalUrl) {
          throw new Error(`Original image url missing for page ${index + 1}`);
        }

        const extension = this.extractExtension(originalUrl) ?? '.jpg';
        const fileName = this.fileService.sanitizeFileName(
          `${detail.id}_${detail.title}_${index + 1}${extension}`
        );

        const metadata: FileMetadata = {
          author: detail.user?.name,
          tag: tag,
          date: detail.create_date ? new Date(detail.create_date) : new Date(),
        };

        // Add timeout protection for image download (2 minutes per image)
        const buffer = await Promise.race([
          this.client.downloadImage(originalUrl),
          new Promise<ArrayBuffer>((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout: Failed to download image for illustration ${detail.id} page ${index + 1} within 120 seconds`)), 120000)
          )
        ]);
        const filePath = await this.fileService.saveImage(buffer, fileName, metadata);

        // Save metadata JSON file
        const pixivMetadata: PixivMetadata = {
          pixiv_id: detail.id,
          title: detail.title,
          author: {
            id: detail.user?.id || '',
            name: detail.user?.name || 'Unknown',
          },
          tags: tags,
          original_url: `https://www.pixiv.net/artworks/${detail.id}`,
          create_date: detail.create_date,
          download_tag: tag,
          type: 'illustration',
          page_number: index + 1,
          total_pages: pages.length,
          total_bookmarks: detail.total_bookmarks,
          total_view: detail.total_view,
          bookmark_count: detail.bookmark_count,
          view_count: detail.view_count,
        };
        await this.fileService.saveMetadata(filePath, pixivMetadata);

        return { filePath, index: index + 1 };
      },
      downloadConcurrency
    );

    // Insert download records and log results
    let successCount = 0;
    for (const result of downloadResults) {
      if (result.success) {
        this.database.insertDownload({
          pixivId: String(detail.id),
          type: 'illustration',
          tag,
          title: detail.title,
          filePath: result.result.filePath,
          author: detail.user?.name,
          userId: detail.user?.id,
        });
        logger.info(`Saved illustration ${detail.id} page ${result.result.index}`, { 
          filePath: result.result.filePath 
        });
        successCount++;
      } else {
        logger.warn(`Failed to download page ${result.error.message}`, { 
          illustId: detail.id,
          error: result.error.message 
        });
      }
    }

    if (successCount === 0) {
      throw new Error(`Failed to download any pages for illustration ${detail.id}`);
    }
  }

  private async downloadNovel(novel: PixivNovel, tag: string, target: TargetConfig) {
    // First verify the novel exists and get updated details with tags
    const { novel: detail, tags } = await this.client.getNovelDetailWithTags(novel.id);
    
    // Then get the novel text
    const text = await this.client.getNovelText(novel.id);

    // Language detection (if enabled, default to true)
    const enableDetection = target.detectLanguage !== false;
    let detectedLang: ReturnType<typeof detectLanguage> = null;
    
    if (enableDetection) {
      // Use full content (header + text) for detection to get more context
      const fullContent = `${detail.title}\n${text}`;
      detectedLang = detectLanguage(fullContent);
      
      if (detectedLang) {
        logger.info(`Detected language for novel ${detail.id}: ${detectedLang.name} (${detectedLang.code})`, {
          novelId: detail.id,
          language: detectedLang.name,
          code: detectedLang.code,
          isChinese: detectedLang.isChinese,
        });
      } else {
        logger.debug(`Language detection inconclusive for novel ${detail.id} (text may be too short)`);
      }
    }

    // Apply language filter if specified
    if (target.languageFilter && detectedLang) {
      const shouldDownload = 
        (target.languageFilter === 'chinese' && detectedLang.isChinese) ||
        (target.languageFilter === 'non-chinese' && !detectedLang.isChinese);
      
      if (!shouldDownload) {
        const filterReason = target.languageFilter === 'chinese' 
          ? 'not Chinese' 
          : 'is Chinese';
        logger.info(`Skipping novel ${detail.id} due to language filter (detected: ${detectedLang.name}, filter: ${target.languageFilter})`, {
          novelId: detail.id,
          detectedLanguage: detectedLang.name,
          filter: target.languageFilter,
          reason: filterReason,
        });
        // Use a regular Error that will be caught and handled as a skipable error
        throw new Error(
          `Novel ${detail.id} skipped: language filter mismatch (detected: ${detectedLang.name}, required: ${target.languageFilter})`
        );
      }
    } else if (target.languageFilter && !detectedLang) {
      // Language filter is set but detection failed (text too short)
      // Default behavior: download it (to avoid false negatives)
      logger.debug(`Language filter is set but detection failed for novel ${detail.id}, downloading anyway`);
    }

    // Format tags for display
    const tagsDisplay = tags.map(t => {
      if (t.translated_name) {
        return `${t.name} (${t.translated_name})`;
      }
      return t.name;
    }).join(', ');

    const header = [
      `Title: ${detail.title}`,
      `Author: ${detail.user?.name ?? 'Unknown'}`,
      `Author ID: ${detail.user?.id ?? 'Unknown'}`,
      `Tags: ${tagsDisplay || 'None'}`,
      `Download Tag: ${tag}`,
      `Original URL: https://www.pixiv.net/novel/show.php?id=${detail.id}`,
      `Created: ${new Date(detail.create_date).toISOString()}`,
      ...(detectedLang ? [`Detected Language: ${detectedLang.name} (${detectedLang.code})`] : []),
      '',
      '---',
      '',
    ].join('\n');

    const content = `${header}\n${text}`;
    const fileName = this.fileService.sanitizeFileName(`${detail.id}_${detail.title}.txt`);
    
    const metadata: FileMetadata = {
      author: detail.user?.name,
      tag: tag,
      date: detail.create_date ? new Date(detail.create_date) : new Date(),
    };
    
    const filePath = await this.fileService.saveText(content, fileName, metadata);

    // Save metadata JSON file
    const pixivMetadata: PixivMetadata = {
      pixiv_id: detail.id,
      title: detail.title,
      author: {
        id: detail.user?.id || '',
        name: detail.user?.name || 'Unknown',
      },
      tags: tags,
      original_url: `https://www.pixiv.net/novel/show.php?id=${detail.id}`,
      create_date: detail.create_date,
      download_tag: tag,
      type: 'novel',
      total_bookmarks: detail.total_bookmarks,
      total_view: detail.total_view,
      bookmark_count: detail.bookmark_count,
      view_count: detail.view_count,
      ...(detectedLang ? {
        detected_language: {
          code: detectedLang.code,
          name: detectedLang.name,
          is_chinese: detectedLang.isChinese,
        },
      } : {}),
    };
    await this.fileService.saveMetadata(filePath, pixivMetadata);

    this.database.insertDownload({
      pixivId: String(detail.id),
      type: 'novel',
      tag,
      title: detail.title,
      filePath,
      author: detail.user?.name,
      userId: detail.user?.id,
    });

    logger.info(`Saved novel ${detail.id}`, { 
      filePath,
      ...(detectedLang ? { language: detectedLang.name, isChinese: detectedLang.isChinese } : {}),
    });
  }

  private getIllustrationPages(detail: PixivIllust): PixivIllustPage[] {
    if (detail.meta_pages && detail.meta_pages.length > 0) {
      return detail.meta_pages;
    }

    return [
      {
        image_urls: {
          square_medium: detail.image_urls.square_medium,
          medium: detail.image_urls.medium,
          large: detail.image_urls.large,
          original: detail.meta_single_page?.original_image_url,
        },
        meta_single_page: detail.meta_single_page,
      },
    ];
  }

  private resolveImageUrl(page: PixivIllustPage, detail: PixivIllust) {
    if (page.meta_single_page?.original_image_url) {
      return page.meta_single_page.original_image_url;
    }

    const imageUrls = page.image_urls;
    if (imageUrls.original) {
      return imageUrls.original;
    }

    if (detail.meta_single_page?.original_image_url) {
      return detail.meta_single_page.original_image_url;
    }

    return imageUrls.large ?? imageUrls.medium;
  }

  private extractExtension(url: string): string | null {
    const path = new URL(url).pathname;
    const index = path.lastIndexOf('.');
    if (index === -1) {
      return null;
    }
    return path.slice(index);
  }
}

