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
import { DeliveryService } from '../../delivery/DeliveryService';
import { TargetOutcome } from '../../scheduler/TargetOutcome';
import type { TopicPipelineFactory } from '../../topic/createTopicPipeline';
import { getTargetLabel } from '../../utils/target-label';

export class IllustrationTargetHandler {
  /** Outcomes produced during this handle() call (deliveries + terminal non-matches). */
  private outcomes: TargetOutcome[] = [];

  constructor(
    private readonly client: IPixivClient,
    private readonly database: IDatabase,
    private readonly rankingService: RankingService,
    private readonly illustrationDownloader: IllustrationDownloader,
    private readonly pipeline: DownloadPipeline,
    private readonly topicPipelineFactory?: TopicPipelineFactory,
    private readonly deliveryService?: DeliveryService
  ) {}

  async handle(target: TargetConfig): Promise<TargetOutcome> {
    this.outcomes = [];
    if (target.illustId) {
      await this.handleSingleIllustration(target);
      return this.summarize(target);
    }

    if (target.userId) {
      await this.handleUserIllustrations(target);
      return this.summarize(target);
    }

    const mode = target.mode || 'search';
    const displayTag = getTargetLabel(target);
    logger.info(`Processing illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag}`);

    try {
      if (mode === 'topic') {
        await this.handleTopicWithLookback(target, displayTag);
        return this.summarize(target);
      }
      const illusts = await this.fetchIllustrations(target, mode);
      const result = await this.pipeline.run(
        illusts,
        target,
        'illustration',
        (illust, tag) => this.downloadAndDeliver(illust, tag, target)
      );
      this.handleDownloadResult(result, target, mode, illusts.length);
      return this.summarize(target);
    } catch (error) {
      return this.classifyError(error, displayTag, mode, target);
    }
  }

  /** Reduce the outcomes collected while processing one target to one cell result. */
  private summarize(target: TargetConfig): TargetOutcome {
    const submitted = this.outcomes.find((o) => o.kind === 'submitted');
    if (submitted) return submitted;
    const stored = this.outcomes.find((o) => o.kind === 'stored');
    if (stored) return stored;
    const pending = this.outcomes.find((o) => o.kind === 'delivery_pending');
    if (pending) return pending;
    const duplicate = this.outcomes.find((o) => o.kind === 'duplicate');
    if (duplicate) return duplicate;
    const failed = this.outcomes.find((o) => o.kind === 'failed');
    if (failed) return failed;
    return { kind: 'no_candidate', reason: 'no matching illustration after filtering/dedupe' };
  }

  private classifyError(error: unknown, displayTag: string, mode: string, target: TargetConfig): TargetOutcome {
    const message = error instanceof Error ? error.message : String(error);
    this.database.logExecution(displayTag, 'illustration', 'failed', message);
    logger.error(`Illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag} failed`, {
      error: message,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    // Explicit no-candidate signals are business outcomes, not failures.
    if (/no matching|all .*filtered|no_candidate/i.test(message)) {
      return { kind: 'no_candidate', reason: message };
    }
    // Network/transient => retryable so the SAME work resumes on next trigger.
    const retryable = error instanceof NetworkError || /timeout|econn|enotfound|etimed|429|5dd/i.test(message);
    return { kind: 'failed', retryable, error: message };
  }

  private async fetchIllustrations(target: TargetConfig, mode: string): Promise<PixivIllust[]> {
    if (mode === 'topic') {
      return this.fetchTopicIllustrations(target);
    }
    if (mode === 'ranking') {
      return this.fetchRankingIllustrations(target);
    } else {
      return this.fetchSearchIllustrations(target);
    }
  }

  private async fetchTopicIllustrations(target: TargetConfig): Promise<PixivIllust[]> {
    const topic = (target.topic ?? '').trim();
    const day = this.resolveTopicDay(target);
    const limit = target.limit || 1;
    // TopicPipeline ranks before DownloadPlanner removes works recorded in the
    // download database. Keep a small, bounded ranked pool so a second run for
    // the same day can backfill from the next-most-popular unseen work instead
    // of selecting Top-1 again and producing zero downloads.
    const selectionLimit = Math.max(limit, Math.min(Math.max(limit * 2, 20), 100));
    logger.info(`Fetching ${day} illustrations for topic "${topic}", resolving dynamic tag space`);

    if (!this.topicPipelineFactory) {
      throw new Error('mode=topic requires the topic pipeline, which was not configured');
    }
    const pipeline = this.topicPipelineFactory();
    const { works, selection } = await pipeline.selectWorks<PixivIllust>(
      target,
      'illustration',
      day,
      selectionLimit,
      target.topicDiscovery ?? {},
      target.candidateCollection ?? {}
    );
    logger.info(`Topic "${topic}" illustration: tags=${selection.resolvedTagCount} raw=${selection.rawCount} deduped=${selection.dedupedCount} aiExcluded=${selection.aiExcludedCount} accepted=${selection.acceptedCount} candidates=${works.length} target=${limit}`);
    return works;
  }

  private async handleTopicWithLookback(target: TargetConfig, displayTag: string): Promise<void> {
    const requested = target.limit || 1;
    const additionalDays = Math.max(0, Math.min(target.noMatchPolicy?.lookbackDays ?? 0, 7));
    const baseDay = this.resolveTopicDay(target);
    const checkedDays: string[] = [];

    for (let offset = 0; offset <= additionalDays; offset++) {
      const day = this.shiftDay(baseDay, -offset);
      const attemptTarget = offset === 0 ? target : { ...target, date: day };
      checkedDays.push(day);
      if (offset > 0) {
        logger.warn(`No matching illustration found yet; checking fallback day ${day}`, {
          topic: target.topic,
          requestedDay: baseDay,
          fallbackOffset: offset,
        });
      }
      const illusts = await this.fetchTopicIllustrations(attemptTarget);
      const result = await this.pipeline.run(
        illusts,
        attemptTarget,
        'illustration',
        (illust, tag) => this.downloadAndDeliver(illust, tag, attemptTarget)
      );
      if (result.downloaded > 0) {
        this.handleDownloadResult(result, target, 'topic', illusts.length);
        return;
      }
    }

    const message = `No matching illustrations found after checking ${checkedDays.length} day(s): ${checkedDays.join(', ')}`;
    this.database.logExecution(displayTag, 'illustration', 'success', message);
    logger.warn(`Illustration topic ${displayTag} produced no matching result`, { checkedDays });
    this.outcomes.push({ kind: 'no_candidate', reason: message });
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

  private async fetchRankingIllustrations(target: TargetConfig): Promise<PixivIllust[]> {
    if (target.filterTag) {
      const rankingDate = target.rankingDate === 'YESTERDAY'
        ? getYesterdayDate()
        : target.rankingDate || getTodayDate();
      const targetLimit = target.limit || 10;
      logger.info(`Fetching ${rankingDate} illustrations for tag ${target.filterTag}, then ranking by popularity`);
      const searchTarget = {
        ...target,
        tag: target.filterTag,
        // Date order lets pagination stop as soon as it leaves the selected
        // day. We then rank that bounded day set locally by bookmarks/views.
        sort: 'date_desc' as const,
        startDate: rankingDate,
        endDate: rankingDate,
        limit: Math.max(targetLimit * 20, 100),
      };
      let illusts = await this.client.searchIllustrations(searchTarget);
      logger.info(`Found ${illusts.length} illustration(s) for ${rankingDate}`);
      this.sortByPopularityAndLog(illusts, targetLimit, 'illustration');

      if (illusts.length > targetLimit) {
        illusts = illusts.slice(0, targetLimit);
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
    result: {
      downloaded: number;
      skipped: number;
      alreadyDownloaded: number;
      filteredOut: number;
      skipDetails?: { id: string; error: string }[];
    },
    target: TargetConfig,
    mode: string,
    totalFound: number
  ): void {
    const { downloaded, skipped, alreadyDownloaded, filteredOut } = result;
    const targetLimit = target.limit || 10;
    const tagForLog = getTargetLabel(target);

    if (downloaded === 0 && targetLimit > 0) {
      this.handleZeroDownloads(
        alreadyDownloaded, skipped, filteredOut, totalFound, targetLimit, tagForLog, mode, result.skipDetails
      );
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
    mode: string,
    skipDetails?: { id: string; error: string }[]
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
      // 有候选但一个都没下载成功：报真实原因，不猜测 "likely inaccessible"。
      const reasons = (skipDetails ?? [])
        .slice(0, 2)
        .map((d) => `${d.id}: ${d.error}`)
        .join('; ');
      const deliveredNote = alreadyDownloaded > 0 ? `（${alreadyDownloaded} 个此前已投递，不会重复下载）` : '';
      const errorMessage =
        skipped > 0
          ? `No new illustrations for ${tagForLog}: requested ${targetLimit}, ${skipped} candidate(s) errored/skipped` +
            `${deliveredNote}${reasons ? ` — 示例原因：${reasons}` : ''}. ` +
            `多为网络/Pixiv 瞬时错误，下次计划会自动重试；同一作品持续失败请查日志（可能为已删除/私密/R-18 权限）。`
          : `No new illustrations for ${tagForLog}: requested ${targetLimit}, but no matching illustrations were found.`;
      this.database.logExecution(tagForLog, 'illustration', 'failed', errorMessage);
      logger.warn(`Illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${tagForLog}: ${errorMessage}`);
      // Skipped due to transient errors => no terminal submitted; caller retries.
      this.outcomes.push({
        kind: 'failed',
        retryable: skipped > 0,
        error: errorMessage,
      });
    }
  }

  // Notifications are produced centrally by NotificationPolicy (slot-scoped
  // keys), not per-handler with date-based keys. See noteOutcome/sendSlotSummary.

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
      await this.downloadAndDeliver(detail, `illust-${illustId}`, target);
      logger.info(`Successfully downloaded illustration ${illustId}`);
    } catch (error) {
      this.logError(error, `Failed to download illustration ${illustId}`);
      throw error;
    }
  }

  private async handleUserIllustrations(target: TargetConfig): Promise<void> {
    const userId = target.userId;
    if (!userId || userId.trim() === '') {
      throw new Error(`Invalid userId: ${userId}`);
    }

    logger.info(`Processing user illustrations for user ${userId}`);
    try {
      const targetLimit = target.limit;
      const illusts = await this.client.getUserIllustrations(userId, {
        limit: targetLimit,
        offset: 0,
      });
      logger.info(`Found ${illusts.length} illustration(s) from user ${userId}`);

      if (illusts.length === 0) {
        logger.info(`No illustrations found for user ${userId}`);
        return;
      }

      const result = await this.pipeline.run(
        illusts,
        target,
        'illustration',
        (illust, tag) => this.downloadAndDeliver(illust, tag, target)
      );
      this.handleDownloadResult(result, target, 'user', illusts.length);
    } catch (error) {
      this.logError(error, `Failed to download illustrations for user ${userId}`);
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

  private async downloadAndDeliver(
    illust: PixivIllust,
    tag: string,
    target: TargetConfig
  ): Promise<void> {
    const artifact = await this.illustrationDownloader.downloadIllustration(
      illust,
      tag,
      {
        aiMetadataCheck: target.aiMetadataCheck === true,
        maxPageCount: target.maxPageCount,
        includeDeliveryPreviews: Boolean(
          target.storageMode === 'cache' && target.delivery?.target?.trim()
        ),
      }
    );
    if (!artifact) return;
    this.recordArtifactOutcome(artifact, target);
  }

  /**
   * Turn a downloaded artifact into the target's business outcome. In cache
   * delivery mode the DeliveryService creates the durable intent atomically and
   * the result is 'delivery_pending' (NOT submitted — the OutboxWorker confirms
   * the ACK). Persistent/download-only runs are 'stored'.
   */
  private recordArtifactOutcome(
    artifact: import('../../delivery/types').DownloadedArtifact,
    target: TargetConfig
  ): void {
    const isDelivery = target.storageMode === 'cache' && target.delivery?.target?.trim();
    if (!isDelivery || !this.deliveryService) {
      this.outcomes.push({ kind: 'stored', workId: artifact.pixivId, workType: artifact.type });
      return;
    }
    // Pre-lock delivery dedupe (after selection): if the ledger already knows it,
    // that is a confirmed fact, not a new submission.
    const slotId = (target.delivery as { executionContext?: { slotId?: string } } | undefined)?.executionContext?.slotId;
    if (this.deliveryService.isAlreadyDelivered(target.delivery!.target!, artifact.type, artifact.pixivId)) {
      this.outcomes.push({ kind: 'duplicate', workId: artifact.pixivId, reason: 'already delivered to target (ledger)' });
      return;
    }
    const res = this.deliveryService.enqueue(artifact, target, {
      slotId,
      fields: target.delivery?.fields as Record<string, unknown> | undefined,
      extraContext: this.executionContextFields(target),
    });
    if (res.duplicate) {
      this.outcomes.push({ kind: 'duplicate', workId: artifact.pixivId, reason: 'already delivered to target (ledger)' });
    } else {
      this.outcomes.push({ kind: 'delivery_pending', workId: artifact.pixivId, workType: artifact.type, deliveryId: res.deliveryId });
    }
  }

  private executionContextFields(target: TargetConfig): Record<string, unknown> {
    const ec = (target.delivery as { executionContext?: Record<string, unknown>; slotContext?: Record<string, unknown> } | undefined);
    return {
      scheduleId: ec?.executionContext?.scheduleId,
      executionId: ec?.executionContext?.slotId,
      occurrenceAt: ec?.executionContext?.occurrenceAtIso,
      triggerSource: ec?.executionContext?.triggerSource,
      slotId: ec?.slotContext?.slotId ?? ec?.executionContext?.slotId,
      slotName: ec?.slotContext?.slotName ?? ec?.executionContext?.slotName,
      slotDate: ec?.slotContext?.slotDate ?? ec?.executionContext?.slotDate,
    };
  }
}
