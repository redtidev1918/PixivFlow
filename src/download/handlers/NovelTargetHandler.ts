import { TargetConfig } from '../../config';
import { logger } from '../../logger';
import { IPixivClient } from '../../interfaces/IPixivClient';
import { IDatabase } from '../../interfaces/IDatabase';
import { RankingService } from '../RankingService';
import { DownloadPipeline, DownloadPipelineResult } from '../pipeline/DownloadPipeline';
import { NovelDownloader } from '../NovelDownloader';
import { NetworkError } from '../../utils/errors';
import { getTodayDate, getYesterdayDate } from '../../utils/pixiv-date-utils';
import { calculatePopularityScore } from '../../utils/pixiv-utils';
import { PixivNovel } from '../../pixiv/PixivClient';
import { DeliveryOutbox } from '../../delivery/DeliveryOutbox';
import type { TopicPipelineFactory } from '../../topic/createTopicPipeline';
import { getTargetLabel } from '../../utils/target-label';

export class NovelTargetHandler {
  constructor(
    private readonly client: IPixivClient,
    private readonly database: IDatabase,
    private readonly rankingService: RankingService,
    private readonly pipeline: DownloadPipeline,
    private readonly novelDownloader: NovelDownloader,
    private readonly deliveryOutbox?: DeliveryOutbox,
    private readonly topicPipelineFactory?: TopicPipelineFactory
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

    if (target.userId) {
      await this.handleUserNovels(target);
      return;
    }

    const mode = target.mode || 'search';
    const displayTag = getTargetLabel(target);
    logger.info(`Processing novel ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag}`);

    try {
      if (mode === 'topic' && target.languageFilter && (target.noMatchPolicy?.lookbackDays ?? 0) > 0) {
        await this.handleTopicWithLookback(target, displayTag);
        return;
      }
      const novels = await this.fetchNovels(target, mode);
      const result = await this.pipeline.run(
        novels,
        target,
        'novel',
        (novel, tag) => this.downloadAndDeliver(novel, tag, target)
      );
      await this.handleDownloadResult(result, target, mode, displayTag, novels.length);
    } catch (error) {
      await this.handleError(error, displayTag, mode, target);
    }
  }

  private async fetchNovels(target: TargetConfig, mode: string): Promise<PixivNovel[]> {
    if (mode === 'topic') {
      return this.fetchTopicNovels(target);
    }
    if (mode === 'ranking') {
      return this.fetchRankingNovels(target);
    } else {
      return this.fetchSearchNovels(target);
    }
  }

  private async fetchTopicNovels(target: TargetConfig): Promise<PixivNovel[]> {
    const topic = (target.topic ?? '').trim();
    const day = this.resolveTopicDay(target);
    const limit = target.limit || 1;
    const selectionLimit = target.languageFilter
      ? Math.max(limit, Math.min(target.languageCandidateLimit ?? 20, 100))
      : limit;
    logger.info(`Fetching ${day} novels for topic "${topic}", resolving dynamic tag space`);

    if (!this.topicPipelineFactory) {
      throw new Error('mode=topic requires the topic pipeline, which was not configured');
    }
    const pipeline = this.topicPipelineFactory();
    const { works, selection } = await pipeline.selectWorks<PixivNovel>(
      target,
      'novel',
      day,
      selectionLimit,
      target.topicDiscovery ?? {},
      target.candidateCollection ?? {}
    );
    logger.info(`Topic "${topic}" novel: tags=${selection.resolvedTagCount} raw=${selection.rawCount} deduped=${selection.dedupedCount} accepted=${selection.acceptedCount} candidates=${works.length} target=${limit}`);
    return works;
  }

  private async handleTopicWithLookback(target: TargetConfig, displayTag: string): Promise<void> {
    const requested = target.limit || 1;
    const additionalDays = Math.max(0, Math.min(target.noMatchPolicy?.lookbackDays ?? 0, 7));
    const baseDay = this.resolveTopicDay(target);
    const checkedDays: string[] = [];
    const aggregate: DownloadPipelineResult = {
      downloaded: 0,
      skipped: 0,
      alreadyDownloaded: 0,
      filteredOut: 0,
    };
    let totalFound = 0;

    for (let offset = 0; offset <= additionalDays && aggregate.downloaded < requested; offset++) {
      const day = this.shiftDay(baseDay, -offset);
      const attemptTarget: TargetConfig = {
        ...target,
        date: day,
        limit: requested - aggregate.downloaded,
      };
      checkedDays.push(day);
      if (offset > 0) {
        logger.warn(`No matching ${target.languageFilter} novel found yet; checking fallback day ${day}`, {
          topic: target.topic,
          requestedDay: baseDay,
          fallbackOffset: offset,
        });
      }
      const novels = await this.fetchTopicNovels(attemptTarget);
      totalFound += novels.length;
      const result = await this.pipeline.run(
        novels,
        attemptTarget,
        'novel',
        (novel, tag) => this.downloadAndDeliver(novel, tag, attemptTarget)
      );
      aggregate.downloaded += result.downloaded;
      aggregate.skipped += result.skipped;
      aggregate.alreadyDownloaded += result.alreadyDownloaded;
      aggregate.filteredOut += result.filteredOut;
    }

    await this.handleDownloadResult(
      aggregate,
      target,
      'topic',
      displayTag,
      totalFound,
      checkedDays
    );
  }

  private resolveTopicDay(target: TargetConfig): string {
    return target.date === 'TODAY'
      ? getTodayDate()
      : target.date && target.date !== 'YESTERDAY'
        ? target.date
        : getYesterdayDate();
  }

  private shiftDay(day: string, offset: number): string {
    const date = new Date(`${day}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  private async fetchRankingNovels(target: TargetConfig): Promise<PixivNovel[]> {
    if (target.filterTag) {
      const rankingDate = target.rankingDate === 'YESTERDAY'
        ? getYesterdayDate()
        : target.rankingDate || getTodayDate();
      const targetLimit = target.limit || 10;
      logger.info(`Fetching ${rankingDate} novels for tag ${target.filterTag}, then ranking by popularity`);
      const searchTarget = {
        ...target,
        tag: target.filterTag,
        sort: 'date_desc' as const,
        startDate: rankingDate,
        endDate: rankingDate,
        limit: Math.max(targetLimit * 20, 100),
      };
      let novels = await this.client.searchNovels(searchTarget);
      logger.info(`Found ${novels.length} novel(s) for ${rankingDate}`);
      this.sortByPopularityAndLog(novels, targetLimit);

      if (novels.length > targetLimit) {
        novels = novels.slice(0, targetLimit);
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

  private async handleDownloadResult(
    result: { downloaded: number; skipped: number; alreadyDownloaded: number; filteredOut: number },
    target: TargetConfig,
    mode: string,
    displayTag: string,
    totalFound: number,
    checkedDays: string[] = []
  ): Promise<void> {
    const { downloaded, skipped, alreadyDownloaded, filteredOut } = result;
    const targetLimit = target.limit || 10;
    const tagForLog = getTargetLabel(target);

    if (downloaded === 0 && targetLimit > 0) {
      await this.handleZeroDownloads(
        alreadyDownloaded,
        skipped,
        filteredOut,
        targetLimit,
        tagForLog,
        mode,
        target,
        totalFound,
        checkedDays
      );
      return;
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

  private async handleZeroDownloads(
    alreadyDownloaded: number,
    skipped: number,
    filteredOut: number,
    targetLimit: number,
    tagForLog: string,
    mode: string,
    target: TargetConfig,
    totalFound: number,
    checkedDays: string[]
  ): Promise<void> {
    const expectedLanguageNoMatch = mode === 'topic' && Boolean(target.languageFilter);
    if (expectedLanguageNoMatch) {
      const days = checkedDays.length > 0 ? checkedDays : [this.resolveTopicDay(target)];
      const message = `No matching ${target.languageFilter} novels found after checking ${totalFound} candidate(s) across ${days.length} day(s): ${days.join(', ')}`;
      this.database.logExecution(tagForLog, 'novel', 'success', message);
      logger.warn(`Novel topic ${tagForLog} produced no matching result`, {
        languageFilter: target.languageFilter,
        candidates: totalFound,
        checkedDays: days,
      });
      await this.notifyNoMatch(target, tagForLog, totalFound, days);
    } else if (alreadyDownloaded > 0 && skipped === 0) {
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

  private async notifyNoMatch(
    target: TargetConfig,
    label: string,
    candidateCount: number,
    checkedDays: string[]
  ): Promise<void> {
    if (target.noMatchPolicy?.notify !== true) return;
    if (!this.deliveryOutbox) {
      logger.warn('No-match notification requested but delivery outbox is unavailable');
      return;
    }
    const language = target.languageFilter === 'chinese' ? '中文正文' : '非中文正文';
    const text = [
      '⚠️ PixivFlow 本次没有可投稿内容',
      `目标：${target.id || label}（${label} · 小说）`,
      `要求：${language}，主题与语言条件未放宽`,
      `检查日期：${checkedDays.join('、')}`,
      `候选数量：${candidateCount}`,
      '处理结果：未创建空投稿；下次定时任务会继续正常执行。',
    ].join('\n');
    const key = `pixivflow:no-match:${target.id || label}:novel:${checkedDays[0]}:${checkedDays.at(-1)}`;
    try {
      await this.deliveryOutbox.notifyNoMatch(target, text, key);
    } catch (error) {
      logger.warn('Failed to send no-match notification', {
        target: target.id || label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleError(error: unknown, displayTag: string, mode: string, target?: TargetConfig): Promise<void> {
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

    await this.notifyDownloadFailure(target, displayTag, errorMessage);

    throw error;
  }

  /** Notify the review group when a target's download hard-fails (not just a no-match). */
  private async notifyDownloadFailure(target: TargetConfig | undefined, label: string, errorMessage: string): Promise<void> {
    if (!target?.delivery?.target?.trim()) return;
    if (!this.deliveryOutbox) {
      logger.warn('Download-failure notification requested but delivery outbox is unavailable');
      return;
    }
    const truncated = errorMessage.length > 200 ? `${errorMessage.slice(0, 200)}…` : errorMessage;
    const text = [
      '❌ PixivFlow 本次下载失败',
      `目标：${target.id || label}（${label} · 小说）`,
      `错误：${truncated}`,
      '处理结果：本次未投递；可点击「🔄 重抓/换一张」重试，或等待下次定时任务。',
    ].join('\n');
    const key = `pixivflow:hard-fail:${target.id || label}:novel:${getTodayDate()}`;
    try {
      await this.deliveryOutbox.notifyNoMatch(target, text, key);
    } catch (notifyError) {
      logger.warn('Failed to send download-failure notification', { label, errorMessage, notifyError });
    }
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

      await this.downloadAndDeliver(novel, `novel-${novelId}`, target);
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
          await this.downloadAndDeliver(novel, `series-${seriesId}`, target);
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

  private async handleUserNovels(target: TargetConfig): Promise<void> {
    const userId = target.userId;
    if (!userId || userId.trim() === '') {
      throw new Error(`Invalid userId: ${userId}`);
    }

    logger.info(`Processing user novels for user ${userId}`);
    try {
      const targetLimit = target.limit;
      const novels = await this.client.getUserNovels(userId, {
        limit: targetLimit,
        offset: 0,
      });
      logger.info(`Found ${novels.length} novel(s) from user ${userId}`);

      if (novels.length === 0) {
        logger.info(`No novels found for user ${userId}`);
        return;
      }

      const result = await this.pipeline.run(
        novels,
        target,
        'novel',
        (novel, tag) => this.downloadAndDeliver(novel, tag, target)
      );
      this.handleDownloadResult(result, target, 'user', `user-${userId}`, novels.length);
    } catch (error) {
      this.logError(error, `Failed to download novels for user ${userId}`);
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

  private async downloadAndDeliver(
    novel: PixivNovel,
    tag: string,
    target: TargetConfig
  ): Promise<void> {
    const artifact = await this.novelDownloader.download(novel, tag, target);
    if (artifact && this.deliveryOutbox) {
      await this.deliveryOutbox.deliver(artifact, target);
    }
  }
}
