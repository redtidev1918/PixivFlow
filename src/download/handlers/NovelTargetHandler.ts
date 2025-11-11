import { TargetConfig } from '../../config';
import { logger } from '../../logger';
import { IPixivClient } from '../../interfaces/IPixivClient';
import { IDatabase } from '../../interfaces/IDatabase';
import { RankingService } from '../RankingService';
import { DownloadPipeline } from '../pipeline/DownloadPipeline';
import { NovelDownloader } from '../NovelDownloader';
import { NetworkError } from '../../utils/errors';
import { getTodayDate, getYesterdayDate } from '../../utils/pixiv-date-utils';
import { calculatePopularityScore } from '../../utils/pixiv-utils';
import { PixivNovel } from '../../pixiv/PixivClient';

export class NovelTargetHandler {
  constructor(
    private readonly client: IPixivClient,
    private readonly database: IDatabase,
    private readonly rankingService: RankingService,
    private readonly pipeline: DownloadPipeline,
    private readonly novelDownloader: NovelDownloader
  ) {}

  async handle(target: TargetConfig): Promise<void> {
    if (target.novelId) {
      await this.handleSingleNovel(target);
      return;
    }

    if (target.seriesId) {
      await this.handleSeries(target);
      return;
    }

    const mode = target.mode || 'search';
    const displayTag = target.filterTag || target.tag || 'unknown';
    logger.info(`Processing novel ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag}`);

    try {
      const novels = await this.fetchNovels(target, mode);
      const result = await this.pipeline.run(
        novels,
        target,
        'novel',
        (novel, tag) => this.novelDownloader.download(novel, tag, target)
      );
      this.handleDownloadResult(result, target, mode, displayTag, novels.length);
    } catch (error) {
      this.handleError(error, displayTag, mode);
    }
  }

  private async fetchNovels(target: TargetConfig, mode: string): Promise<PixivNovel[]> {
    if (mode === 'ranking') {
      return this.fetchRankingNovels(target);
    } else {
      return this.fetchSearchNovels(target);
    }
  }

  private async fetchRankingNovels(target: TargetConfig): Promise<PixivNovel[]> {
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
      let novels = await this.client.searchNovels(searchTarget);
      logger.info(`Found ${novels.length} novel(s) from search API (sorted by popularity)`);

      if (target.limit && novels.length > target.limit) {
        novels = novels.slice(0, target.limit);
        logger.info(`Selected top ${novels.length} novel(s) by popularity`);
      }
      return novels;
    } else {
      const rankingMode = target.rankingMode || 'day';
      let rankingDate = target.rankingDate || getTodayDate();
      if (rankingDate === 'YESTERDAY') {
        rankingDate = getYesterdayDate();
      }

      logger.info(`Fetching ranking novels (mode: ${rankingMode}, date: ${rankingDate})`);
      const novels = await this.rankingService.getRankingNovelsWithFallback(rankingMode, rankingDate, target.limit);
      logger.info(`Ranking API returned ${novels.length} novel(s)`);
      return novels;
    }
  }

  private async fetchSearchNovels(target: TargetConfig): Promise<PixivNovel[]> {
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
      logger.info(`Fetching up to ${searchLimit} search results to find ${targetLimit} valid novel(s)`);
    }
    const novels = await this.client.searchNovels(searchTarget);
    logger.info(`Found ${novels.length} search results`);

    if (target.sort === 'popular_desc') {
      this.sortByPopularityAndLog(novels, targetLimit);
    }
    return novels;
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
      this.handleZeroDownloads(alreadyDownloaded, skipped, filteredOut, targetLimit, tagForLog, mode);
    }

    if (downloaded > 0 && downloaded < targetLimit * 0.5 && skipped > 0) {
      logger.warn(
        `Only downloaded ${downloaded} out of ${targetLimit} requested novel(s). ${skipped} novel(s) were skipped due to 404 errors or other issues.`
      );
    }

    if (alreadyDownloaded > 0) {
      logger.info(`Skipped ${alreadyDownloaded} novel(s) (already downloaded)`);
    }
    if (skipped > 0) {
      logger.info(`Skipped ${skipped} novel(s) (deleted, private, or inaccessible)`);
    }

    this.database.logExecution(tagForLog, 'novel', 'success', `${downloaded} items downloaded`);
    logger.info(`Novel ${mode === 'ranking' ? 'ranking' : 'tag'} ${tagForLog} completed`, { downloaded });
  }

  private handleZeroDownloads(
    alreadyDownloaded: number,
    skipped: number,
    filteredOut: number,
    targetLimit: number,
    tagForLog: string,
    mode: string
  ): void {
    if (alreadyDownloaded > 0 && skipped === 0) {
      logger.info(`All ${alreadyDownloaded} novel(s) for tag ${tagForLog} were already downloaded`);
      this.database.logExecution(
        tagForLog,
        'novel',
        'success',
        `All ${alreadyDownloaded} items were already downloaded`
      );
    } else if (filteredOut > 0 && skipped === 0 && alreadyDownloaded === 0) {
      logger.info(`All ${filteredOut} novel(s) for tag ${tagForLog} were filtered out (no matching items found)`);
      this.database.logExecution(
        tagForLog,
        'novel',
        'success',
        `All ${filteredOut} items were filtered out (no matching items found)`
      );
    } else {
      const errorMessage = `Failed to download any novels. Requested ${targetLimit}, but all ${skipped} attempt(s) failed or were skipped.`;
      this.database.logExecution(tagForLog, 'novel', 'failed', errorMessage);
      logger.error(`Novel ${mode === 'ranking' ? 'ranking' : 'tag'} ${tagForLog} failed: ${errorMessage}`);
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

    this.database.logExecution(displayTag, 'novel', 'failed', errorMessage);
    logger.error(`Novel ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag} failed`, {
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }

  private async handleSingleNovel(target: TargetConfig): Promise<void> {
    const novelId = Number(target.novelId);
    if (!Number.isFinite(novelId)) {
      throw new Error(`Invalid novelId: ${target.novelId}`);
    }

    logger.info(`Processing single novel ${novelId}`);
    try {
      if (this.database.hasDownloaded(String(novelId), 'novel')) {
        logger.info(`Novel ${novelId} already downloaded, skipping`);
        return;
      }

      const detail = await this.client.getNovelDetail(novelId);
      const novel: PixivNovel = {
        id: detail.id,
        title: detail.title,
        user: detail.user,
        create_date: detail.create_date,
      };

      await this.novelDownloader.download(novel, `novel-${novelId}`, target);
      logger.info(`Successfully downloaded novel ${novelId}`);
    } catch (error) {
      this.logError(error, `Failed to download novel ${novelId}`);
      throw error;
    }
  }

  private async handleSeries(target: TargetConfig): Promise<void> {
    const seriesId = Number(target.seriesId);
    if (!Number.isFinite(seriesId)) {
      throw new Error(`Invalid seriesId: ${target.seriesId}`);
    }

    logger.info(`Processing novel series ${seriesId}`);
    try {
      const novels = await this.client.getNovelSeries(seriesId);
      logger.info(`Found ${novels.length} novels in series ${seriesId}`);

      let downloaded = 0;
      const targetLimit = target.limit || novels.length;

      for (let i = 0; i < novels.length && downloaded < targetLimit; i++) {
        const novel = novels[i];

        if (this.database.hasDownloaded(String(novel.id), 'novel')) {
          logger.debug(`Novel ${novel.id} already downloaded, skipping`);
          continue;
        }

        try {
          await this.novelDownloader.download(novel, `series-${seriesId}`, target);
          downloaded++;
          logger.info(
            `Successfully downloaded novel ${novel.id} from series (${downloaded}/${Math.min(targetLimit, novels.length)})`
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to download novel ${novel.id} from series`, {
            error: errorMessage,
            novelTitle: novel.title,
            novelId: novel.id,
          });
          continue;
        }
      }

      logger.info(`Series download completed: ${downloaded} novel(s) downloaded from series ${seriesId}`);
    } catch (error) {
      logger.error(`Failed to download novel series ${seriesId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private sortByPopularityAndLog(items: PixivNovel[], limit: number): void {
    if (items.length === 0) {
      return;
    }

    items.sort((a, b) => {
      const scoreA = calculatePopularityScore(a);
      const scoreB = calculatePopularityScore(b);
      return scoreB - scoreA;
    });

    const topN = Math.min(items.length, limit);
    logger.info(`Sorted ${items.length} matching novels by popularity`);

    for (let i = 0; i < topN; i++) {
      const item = items[i];
      const bookmarks = item.total_bookmarks ?? item.bookmark_count ?? 0;
      const views = item.total_view ?? item.view_count ?? 0;
      logger.info(`  Rank ${i + 1}: Novel ${item.id} - ${bookmarks} bookmarks, ${views} views`, {
        novelId: item.id,
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


