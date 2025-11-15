import { TargetConfig } from '../../config';
import { logger } from '../../logger';
import { IPixivClient } from '../../interfaces/IPixivClient';
import { IDatabase } from '../../interfaces/IDatabase';
import { RankingService } from '../RankingService';
import { IllustrationDownloader } from '../IllustrationDownloader';
import { DownloadPipeline } from '../pipeline/DownloadPipeline';
import { getTodayDate, getYesterdayDate } from '../../utils/pixiv-date-utils';
import { NetworkError } from '../../utils/errors';
import { calculatePopularityScore } from '../../utils/pixiv-utils';
import { PixivIllust } from '../../pixiv/PixivClient';

export class IllustrationTargetHandler {
  constructor(
    private readonly client: IPixivClient,
    private readonly database: IDatabase,
    private readonly rankingService: RankingService,
    private readonly illustrationDownloader: IllustrationDownloader,
    private readonly pipeline: DownloadPipeline
  ) {}

  async handle(target: TargetConfig): Promise<void> {
    if (target.illustId) {
      await this.handleSingleIllustration(target);
      return;
    }

    const mode = target.mode || 'search';
    const displayTag = target.filterTag || target.tag || 'unknown';
    logger.info(`Processing illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag}`);

    try {
      const illusts = await this.fetchIllustrations(target, mode);
      const result = await this.pipeline.run(
        illusts,
        target,
        'illustration',
        (illust, tag) => this.illustrationDownloader.downloadIllustration(illust, tag)
      );
      this.handleDownloadResult(result, target, mode, displayTag, illusts.length);
    } catch (error) {
      this.handleError(error, displayTag, mode);
    }
  }

  private async fetchIllustrations(target: TargetConfig, mode: string): Promise<PixivIllust[]> {
    if (mode === 'ranking') {
      return this.fetchRankingIllustrations(target);
    } else {
      return this.fetchSearchIllustrations(target);
    }
  }

  private async fetchRankingIllustrations(target: TargetConfig): Promise<PixivIllust[]> {
    if (target.filterTag) {
      logger.info(
        `Using search API with popularity sort for tag: ${target.filterTag} (more efficient than ranking + filter)`
      );
      const searchTarget = {
        ...target,
        tag: target.filterTag,
        sort: 'popular_desc' as const,
        limit: Math.max((target.limit || 10) * 2, 50),
      };
      let illusts = await this.client.searchIllustrations(searchTarget);
      logger.info(`Found ${illusts.length} illustration(s) from search API (sorted by popularity)`);

      if (target.limit && illusts.length > target.limit) {
        illusts = illusts.slice(0, target.limit);
        logger.info(`Selected top ${illusts.length} illustration(s) by popularity`);
      }
      return illusts;
    } else {
      const rankingMode = target.rankingMode || 'day';
      let rankingDate = target.rankingDate || getTodayDate();
      if (rankingDate === 'YESTERDAY') {
        rankingDate = getYesterdayDate();
      }

      logger.info(`Fetching ranking illustrations (mode: ${rankingMode}, date: ${rankingDate})`);
      const illusts = await this.rankingService.getRankingIllustrationsWithFallback(
        rankingMode,
        rankingDate,
        target.limit
      );
      logger.info(`Ranking API returned ${illusts.length} illustration(s)`);
      return illusts;
    }
  }

  private async fetchSearchIllustrations(target: TargetConfig): Promise<PixivIllust[]> {
    const targetLimit = target.limit || 10;
    const searchLimit =
      target.sort === 'popular_desc'
        ? targetLimit <= 5
          ? Math.max(targetLimit * 20, 100)
          : targetLimit * 2
        : targetLimit <= 5
        ? Math.max(targetLimit * 10, 50)
        : targetLimit * 2;
    const searchTarget = { ...target, limit: searchLimit };

    if (searchLimit > targetLimit) {
      logger.info(`Fetching up to ${searchLimit} search results to find ${targetLimit} valid illustration(s)`);
    }
    const illusts = await this.client.searchIllustrations(searchTarget);
    logger.info(`Found ${illusts.length} search results`);

    if (target.sort === 'popular_desc') {
      this.sortByPopularityAndLog(illusts, targetLimit, 'illustration');
    }
    return illusts;
  }

  private handleDownloadResult(
    result: { downloaded: number; skipped: number; alreadyDownloaded: number; filteredOut: number },
    target: TargetConfig,
    mode: string,
    displayTag: string,
    totalFound: number
  ): void {
    const { downloaded, skipped, alreadyDownloaded, filteredOut } = result;
    const targetLimit = target.limit || 10;
    const tagForLog = target.filterTag || target.tag || 'unknown';

    if (downloaded === 0 && targetLimit > 0) {
      this.handleZeroDownloads(alreadyDownloaded, skipped, filteredOut, totalFound, targetLimit, tagForLog, mode);
    }

    if (downloaded > 0 && downloaded < targetLimit * 0.5 && skipped > 0) {
      logger.warn(
        `Only downloaded ${downloaded} out of ${targetLimit} requested illustration(s). ${skipped} illustration(s) were skipped due to errors.`
      );
    }

    if (alreadyDownloaded > 0) {
      logger.info(`Skipped ${alreadyDownloaded} illustration(s) (already downloaded)`);
    }
    if (skipped > 0) {
      logger.info(`Skipped ${skipped} illustration(s) (deleted, private, or inaccessible)`);
    }

    this.database.logExecution(tagForLog, 'illustration', 'success', `${downloaded} items downloaded`);
    logger.info(`Illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${tagForLog} completed`, { downloaded });
  }

  private handleZeroDownloads(
    alreadyDownloaded: number,
    skipped: number,
    filteredOut: number,
    totalFound: number,
    targetLimit: number,
    tagForLog: string,
    mode: string
  ): void {
    if (alreadyDownloaded > 0 && skipped === 0) {
      logger.info(`All ${alreadyDownloaded} illustration(s) for tag ${tagForLog} were already downloaded`);
      this.database.logExecution(tagForLog, 'illustration', 'success', `All ${alreadyDownloaded} items were already downloaded`);
    } else if (filteredOut > 0 && skipped === 0 && alreadyDownloaded === 0) {
      logger.info(`All ${filteredOut} illustration(s) for tag ${tagForLog} were filtered out (no matching items found)`);
      this.database.logExecution(
        tagForLog,
        'illustration',
        'success',
        `All ${filteredOut} items were filtered out (no matching items found)`
      );
    } else if (totalFound === 0 && skipped === 0 && alreadyDownloaded === 0) {
      logger.info(`No illustrations found for tag ${tagForLog}`);
      this.database.logExecution(tagForLog, 'illustration', 'success', `No matching illustrations found`);
    } else {
      const errorMessage = skipped > 0
        ? `Failed to download any illustrations. Requested ${targetLimit}, but all ${skipped} attempt(s) failed or were skipped (likely inaccessible).`
        : `Failed to download any illustrations. Requested ${targetLimit}, but no matching illustrations were found.`;
      this.database.logExecution(tagForLog, 'illustration', 'failed', errorMessage);
      logger.error(`Illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${tagForLog} failed: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  private handleError(error: unknown, displayTag: string, mode: string): void {
    let errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof NetworkError && error.cause) {
      const causeMsg = error.cause instanceof Error ? error.cause.message : String(error.cause);
      errorMessage = `${errorMessage} (原因: ${causeMsg})`;
    }

    if (error instanceof NetworkError && error.url) {
      errorMessage = `${errorMessage} [URL: ${error.url}]`;
    }

    this.database.logExecution(displayTag, 'illustration', 'failed', errorMessage);
    logger.error(`Illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag} failed`, {
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }

  private async handleSingleIllustration(target: TargetConfig): Promise<void> {
    const illustId = Number(target.illustId);
    if (!Number.isFinite(illustId)) {
      throw new Error(`Invalid illustId: ${target.illustId}`);
    }

    logger.info(`Processing single illustration ${illustId}`);
    try {
      if (this.database.hasDownloaded(String(illustId), 'illustration')) {
        logger.info(`Illustration ${illustId} already downloaded, skipping`);
        return;
      }

      const detail = await this.client.getIllustration(illustId);
      // Use the detail directly as it's already a PixivIllust
      await this.illustrationDownloader.downloadIllustration(detail, `illust-${illustId}`);
      logger.info(`Successfully downloaded illustration ${illustId}`);
    } catch (error) {
      this.logError(error, `Failed to download illustration ${illustId}`);
      throw error;
    }
  }

  private sortByPopularityAndLog(
    items: PixivIllust[],
    limit: number,
    itemType: 'illustration' | 'novel'
  ): void {
    if (items.length === 0) {
      return;
    }

    items.sort((a, b) => {
      const scoreA = calculatePopularityScore(a);
      const scoreB = calculatePopularityScore(b);
      return scoreB - scoreA;
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

  private logError(error: unknown, message: string): void {
    let errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof NetworkError && error.cause) {
      const causeMsg = error.cause instanceof Error ? error.cause.message : String(error.cause);
      errorMessage = `${errorMessage} (原因: ${causeMsg})`;
    }

    if (error instanceof NetworkError && error.url) {
      errorMessage = `${errorMessage} [URL: ${error.url}]`;
    }

    logger.error(message, {
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}


