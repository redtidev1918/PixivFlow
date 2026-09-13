import { TargetConfig } from '../../config';
import { logger } from '../../logger';
import { IPixivClient } from '../../interfaces/IPixivClient';
import { IDatabase } from '../../interfaces/IDatabase';
import { RankingService } from '../RankingService';
import { IllustrationDownloader } from '../IllustrationDownloader';
import { DownloadPipeline } from '../pipeline/DownloadPipeline';
import { getTodayDate, getYesterdayDate } from '../../utils/pixiv-date-utils';
import { NetworkError, isRetryableNetworkError, isPixivKitError } from '../../utils/errors';
import { calculatePopularityScore } from '../../utils/pixiv-utils';
import { PixivIllust } from '@redtidev/pixiv-client';
import { DeliveryService } from '../../delivery/DeliveryService';
import {
  CandidateAttempt,
  CandidateScanSummary,
  TargetOutcome,
  classifyCandidateFailure,
  classifyJobLevelOutage,
  hasTransientFailure,
  mergeScanSummaries,
  noEligibleCandidateText,
  skipCandidateWithoutRetry,
} from '../../scheduler/TargetOutcome';
import { TargetExecutionContext, isSingleWorkCell } from '../../scheduler/WorkIdentity';
import type { DownloadedArtifact } from '../../delivery/types';
import type { TopicPipelineFactory } from '../../topic/createTopicPipeline';
import { getTargetLabel } from '../../utils/target-label';
import { resolveCandidateScanLimit } from '../plan/DownloadPlanner';

export class IllustrationTargetHandler {
  /** Outcomes produced during this handle() call (deliveries + terminal non-matches). */
  private outcomes: TargetOutcome[] = [];

  /**
   * Candidate scan of the last pipeline.run() of this handle() call: how many
   * candidates were attempted, which were skipped and why, and whether any
   * job-level outage appeared. This is what turns an empty result into an
   * explicit verdict instead of an ambiguous "completed".
   */
  private scan: CandidateScanSummary | null = null;

  /**
   * Global candidate-scan bound (`download.candidateScanLimit`), supplied by
   * DownloadManager. This is what lets the FETCH stage ask for more than one
   * candidate: a scheduled one-post-per-slot target has `limit: 1`, and asking
   * the ranking API for exactly one work is the reason a single duplicate used
   * to be unfixable downstream.
   */
  private defaultCandidateScanLimit?: number;

  /** Publish the global candidate-scan bound for the fetch stage. */
  public setDefaultCandidateScanLimit(limit: number | undefined): void {
    this.defaultCandidateScanLimit = limit;
  }

  /**
   * How many candidates to FETCH so the bounded scan has something to choose
   * from. Same rule the planner applies to the attempt window, so fetch and
   * scan agree on one bound.
   */
  private candidateFetchLimit(target: TargetConfig): number {
    const targetLimit = target.limit && target.limit > 0 ? target.limit : 10;
    return Math.max(targetLimit, resolveCandidateScanLimit(target, this.defaultCandidateScanLimit));
  }

  /**
   * Cell identity for this handle() call. Set only for a single-work cell of a
   * scheduled occurrence; null for ad-hoc runs and N-works-per-run targets, which
   * have no single (slotId,targetId) -> workId identity to honour.
   */
  private execution: TargetExecutionContext | null = null;

  constructor(
    private readonly client: IPixivClient,
    private readonly database: IDatabase,
    private readonly rankingService: RankingService,
    private readonly illustrationDownloader: IllustrationDownloader,
    private readonly pipeline: DownloadPipeline,
    private readonly topicPipelineFactory?: TopicPipelineFactory,
    private readonly deliveryService?: DeliveryService
  ) {}

  async handle(target: TargetConfig, execution?: TargetExecutionContext): Promise<TargetOutcome> {
    this.outcomes = [];
    this.scan = null;
    this.execution = execution && isSingleWorkCell(target) ? execution : null;

    // A cell that already owns a work is in RECOVERY, not in a new selection.
    // Crash/shutdown recovery is not an intentional second run: running the
    // candidate pipeline here would re-rank and could bind this logical item to a
    // different work than the one it already committed to.
    if (this.execution?.lockedWorkId) {
      await this.recoverLockedWork(target, this.execution.lockedWorkId);
      return this.summarize(target);
    }

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
      this.scan = result.scan;
      this.handleDownloadResult(result, target, mode, illusts.length);
      return this.summarize(target);
    } catch (error) {
      return this.classifyError(error, displayTag, mode, target);
    }
  }

  /**
   * Reduce the outcomes collected while processing one target to one cell
   * result, including the bounded-scan bookkeeping.
   *
   * A `duplicate` is deliberately NOT a target verdict here: a duplicate is a
   * CANDIDATE problem (skip it and try the next candidate), which is what the
   * scan already did. Returning it as the target outcome is the bug that made a
   * scheduled slot report success after submitting nothing.
   */
  private summarize(target: TargetConfig): TargetOutcome {
    const scan = this.scan ?? undefined;
    const submitted = this.outcomes.find((o) => o.kind === 'submitted');
    if (submitted) return scan ? { ...submitted, scan } : submitted;
    const stored = this.outcomes.find((o) => o.kind === 'stored');
    if (stored) return scan ? { ...stored, scan } : stored;
    const pending = this.outcomes.find((o) => o.kind === 'delivery_pending');
    if (pending) return scan ? { ...pending, scan } : pending;
    const alreadyFailed = this.outcomes.find((o) => o.kind === 'failed');
    if (alreadyFailed) return scan ? { ...alreadyFailed, scan } : alreadyFailed;
    const terminalDuplicate = this.outcomes.find((o) => o.kind === 'duplicate');
    if (terminalDuplicate) return scan ? { ...terminalDuplicate, scan } : terminalDuplicate;
    // A job-level outage is never an empty candidate list. Failing here keeps
    // the existing retry/backoff semantics: the scheduler retries the job on a
    // later trigger instead of recording a clean no-op.
    if (scan && scan.outages.length > 0) {
      return {
        kind: 'failed',
        retryable: true,
        error: `job-level outage while scanning candidates: ${scan.outages.join(', ')}`,
        scan,
      };
    }
    if (scan && hasTransientFailure(scan)) {
      return {
        kind: 'failed',
        retryable: true,
        error:
          `candidate scan hit transient infrastructure failures ` +
          `(${scan.skipped.filter((s) => s.retryable).length} of ${scan.attempted} attempted)`,
        scan,
      };
    }
    if (scan && (scan.attempted > 0 || scan.skipped.length > 0)) {
      return { kind: 'no_candidate', reason: noEligibleCandidateText(scan), scan };
    }
    return {
      kind: 'no_candidate',
      reason: 'no matching illustration after filtering/dedupe',
      ...(scan ? { scan } : {}),
    };
  }

  private classifyError(error: unknown, displayTag: string, mode: string, target: TargetConfig): TargetOutcome {
    const message = error instanceof Error ? error.message : String(error);
    const scan = this.scan ?? undefined;
    // A hard job-level outage is named as such and is never recorded as a
    // no-candidate business outcome, whatever its message happens to look like.
    const outage = classifyJobLevelOutage(error);
    this.database.logExecution(displayTag, 'illustration', 'failed', message);
    logger.error(`Illustration ${mode === 'ranking' ? 'ranking' : 'tag'} ${displayTag} failed`, {
      error: message,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      ...(outage ? { jobLevelOutage: outage } : {}),
    });
    if (outage) {
      return {
        kind: 'failed',
        retryable: true,
        error: `job-level outage (${outage}): ${message}`,
        ...(scan ? { scan } : {}),
      };
    }
    // Explicit no-candidate signals are business outcomes, not failures.
    if (/no matching|all .*filtered|no_candidate/i.test(message)) {
      return { kind: 'no_candidate', reason: message, ...(scan ? { scan } : {}) };
    }
    // Network/transient => retryable so the SAME work resumes on next trigger.
    const retryable =
        isRetryableNetworkError(error) ||
        (error instanceof Error && /timeout|econn|enotfound|etimed|429|5\d\d/i.test(error.message));
    return { kind: 'failed', retryable, error: message, ...(scan ? { scan } : {}) };
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
      // The lookback loop is one bounded scan: accumulate every day's
      // skips/outages so the final verdict covers all candidates attempted.
      this.scan = mergeScanSummaries(this.scan, result.scan);
      if (result.downloaded > 0) {
        this.handleDownloadResult(result, target, 'topic', illusts.length);
        return;
      }
      if (this.scan && this.scan.outages.length > 0) {
        // A dead token / dead database / dead network is not "no matching
        // illustration": stop looking back and let the job fail/retry.
        return;
      }
    }

    const scan = this.scan;
    // An explicit no-eligible-candidate verdict needs something to have been
    // considered. When the scan is empty (nothing surfaced at all) the richer
    // existing message — which names the days actually checked — is the honest
    // one, so it is kept.
    const considered = Boolean(scan && (scan.attempted > 0 || scan.skipped.length > 0));
    const message = considered
      ? `${noEligibleCandidateText(scan!)} (checked ${checkedDays.join(', ')})`
      : `No matching illustrations found after checking ${checkedDays.length} day(s): ${checkedDays.join(', ')}`;
    // A bounded, exhausted scan IS the success path for a no-op day: nothing
    // was eligible and nothing was submitted. Recorded as an explicit verdict.
    this.database.logExecution(displayTag, 'illustration', 'success', message);
    logger.warn(`Illustration topic ${displayTag} produced no matching result`, { checkedDays, message });
    this.outcomes.push({
      kind: 'no_candidate',
      reason: message,
      ...(scan ? { scan } : {}),
    });
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
      const fetchLimit = this.candidateFetchLimit(target);
      let illusts = await this.client.searchIllustrations(searchTarget);
      logger.info(`Found ${illusts.length} illustration(s) for ${rankingDate}`);
      this.sortByPopularityAndLog(illusts, fetchLimit, 'illustration');

      if (illusts.length > fetchLimit) {
        illusts = illusts.slice(0, fetchLimit);
        logger.info(
          `Selected top ${illusts.length} illustration(s) by popularity ` +
            `(to fill ${targetLimit}, candidate scan bound ${fetchLimit})`
        );
      }
      return illusts;
    } else {
      const rankingMode = target.rankingMode || 'day';
      let rankingDate = target.rankingDate || getTodayDate();
      if (rankingDate === 'YESTERDAY') {
        rankingDate = getYesterdayDate();
      }

      logger.info(`Fetching ranking illustrations (mode: ${rankingMode}, date: ${rankingDate})`);
      // Ask for the whole bounded scan window, not `limit`: the planner then
      // narrows it to the candidates this run may attempt.
      const illusts = await this.rankingService.getRankingIllustrationsWithFallback(
        rankingMode,
        rankingDate,
        this.candidateFetchLimit(target)
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
      scan: CandidateScanSummary;
    },
    target: TargetConfig,
    mode: string,
    totalFound: number
  ): void {
    const { downloaded, skipped, alreadyDownloaded, filteredOut } = result;
    const targetLimit = target.limit || 10;
    const tagForLog = getTargetLabel(target);

    // The bounded scan produced its own explicit verdict when it attempted
    // candidates or pre-filtered some, so the legacy "zero downloads" reporter
    // is only the fallback for a scan that had nothing at all to look at.
    const scanOwnsVerdict = result.scan.attempted > 0 || result.scan.skipped.length > 0;
    if (downloaded === 0 && targetLimit > 0 && !scanOwnsVerdict) {
      this.handleZeroDownloads(
        alreadyDownloaded, skipped, filteredOut, totalFound, targetLimit, tagForLog, mode, result.skipDetails
      );
    }

    if (scanOwnsVerdict && downloaded > 0) {
      // The explicit success sentence the operator needs: which work was
      // submitted, and how many unusable candidates were skipped to reach it.
      logger.info(
        `Candidate scan verdict for ${tagForLog}: submitted after skipping ` +
          `${result.scan.skipped.length} candidate(s) of ${result.scan.attempted} attempted ` +
          `(bound ${result.scan.bound})`
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
        // A pinned single-work target has no candidate list to advance to, but
        // the reason is still recorded as a candidate skip so the terminal
        // outcome names it instead of reporting an unexplained no-op.
        this.scan = {
          bound: 1,
          attempted: 0,
          skipped: [
            { code: 'duplicate', workId: String(illustId), reason: 'already in download history' },
          ],
          outages: [],
        };
        return;
      }

      const detail = await this.client.getIllustration(illustId);
      // Use the detail directly as it's already a PixivIllust
      const attempt = await this.downloadAndDeliver(detail, `illust-${illustId}`, target);
      this.scan = {
        bound: 1,
        attempted: 1,
        skipped: attempt.kind === 'skipped' ? [attempt.skip] : [],
        outages: [],
      };
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
      this.scan = result.scan;
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

    const cause = error instanceof NetworkError
      ? error.cause
      : isPixivKitError(error)
        ? (error.cause instanceof Error ? error.cause : undefined)
        : undefined;
    if (cause) {
      const causeMsg = cause instanceof Error ? cause.message : String(cause);
      errorMessage = `${errorMessage} (原因: ${causeMsg})`;
    }

    const endpoint = error instanceof NetworkError ? error.url : isPixivKitError(error) ? error.endpoint : undefined;
    if (endpoint) {
      errorMessage = `${errorMessage} [URL: ${endpoint}]`;
    }

    logger.error(message, {
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  /**
   * Continue the work this cell ALREADY owns. Selection is deliberately skipped:
   * no search, no ranking, no topic expansion, no backfill pool, and no
   * "already downloaded / already delivered" exclusion — the cell's own work must
   * never be filtered out of its own recovery.
   *
   * A locked work that is permanently gone is a terminal failure of THIS logical
   * item (`LOCKED_WORK_UNAVAILABLE`). It is never silently replaced by another
   * candidate; that would mutate the item's identity behind the operator's back.
   */
  private async recoverLockedWork(target: TargetConfig, lockedWorkId: string): Promise<void> {
    const displayTag = getTargetLabel(target);
    logger.info(`Recovering locked work ${lockedWorkId} for ${displayTag}; candidate selection is skipped`, {
      slotId: this.execution?.slotId,
      targetId: this.execution?.targetId,
      lockedWorkId,
    });

    const illustId = Number(lockedWorkId);
    if (!Number.isFinite(illustId)) {
      this.outcomes.push({
        kind: 'failed',
        retryable: false,
        error: `LOCKED_WORK_UNAVAILABLE: cell work id "${lockedWorkId}" is not a valid illustration id`,
      });
      return;
    }

    try {
      const detail = await this.client.getIllustration(illustId);
      const attempt = await this.downloadAndDeliver(detail, displayTag, target);
      if (attempt.kind === 'skipped') {
        // A cell that already owns a work cannot advance to another candidate —
        // its identity is fixed. An already-delivered locked work is therefore a
        // terminal business duplicate for THIS cell (it published nothing new),
        // not a candidate skip and not an empty candidate list.
        this.outcomes.push(
          attempt.skip.code === 'duplicate'
            ? { kind: 'duplicate', workId: lockedWorkId, reason: attempt.skip.reason }
            : { kind: 'failed', retryable: false, error: `LOCKED_WORK_UNAVAILABLE: ${attempt.skip.reason}` }
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = isRetryableNetworkError(error);
      this.logError(error, `Failed to recover locked illustration ${lockedWorkId}`);
      this.outcomes.push({
        kind: 'failed',
        retryable,
        error: retryable
          ? `locked work ${lockedWorkId} could not be fetched (will retry the SAME work): ${message}`
          : `LOCKED_WORK_UNAVAILABLE: locked work ${lockedWorkId} is no longer fetchable: ${message}`,
      });
    }
  }

  /**
   * Process ONE candidate work for this cell.
   *
   * Returns what happened to THIS candidate, so the pipeline can advance to the
   * next one when it was unusable. Throwing is reserved for JOB-level failures
   * (dead database / dead token / dead delivery provider): a candidate-level
   * failure is reported as a `skipped` attempt and never as a job verdict.
   *
   * The cell is bound to `illust` BEFORE any side effect: it is the binding, not
   * the candidate list, that decides what a later recovery resumes. The binding
   * is only rolled back when the attempt produced no artifact at all, so in-run
   * backfill still works for a cell that has committed to nothing.
   */
  private async downloadAndDeliver(
    illust: PixivIllust,
    tag: string,
    target: TargetConfig
  ): Promise<CandidateAttempt> {
    const execution = this.execution;
    const workId = String(illust.id);
    // Recovery continues a work the cell already bound; it must never be released.
    const recovering = Boolean(execution?.lockedWorkId);
    if (execution && !recovering) {
      const binding = execution.bind(workId, 'illustration');
      if (!binding.won) {
        // Another writer elected a different work for this cell. First selection
        // is authoritative: never process a work the cell does not own.
        logger.warn(`Cell is bound to work ${binding.workId}; declining to select ${workId}`, {
          slotId: execution.slotId,
          targetId: execution.targetId,
          boundWorkId: binding.workId,
        });
        return {
          kind: 'skipped',
          skip: {
            code: 'duplicate',
            workId,
            reason: `cell already owns work ${binding.workId} (concurrent selection)`,
          },
        };
      }
    }

    let artifact: DownloadedArtifact | null = null;
    try {
      artifact = await this.illustrationDownloader.downloadIllustration(
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
    } catch (error) {
      // Nothing was persisted, so the cell may still pick another candidate.
      if (execution && !recovering) execution.release(workId);
      const failure = classifyCandidateFailure(error, workId);
      if (failure.scope === 'job' || !skipCandidateWithoutRetry(failure.skip)) {
        // Job-level outage, or a transient candidate failure: re-thrown so the
        // queue's existing retry/backoff owns it and the scheduler records a JOB
        // failure — never an exhausted candidate list.
        throw error;
      }
      this.logError(error, `Candidate illustration ${workId} skipped (${failure.skip.code})`);
      return { kind: 'skipped', skip: failure.skip };
    }
    if (!artifact) {
      // Nothing was persisted: the downloader deliberately declined this
      // candidate (over maxPageCount, AI metadata check, already on disk). That
      // is a fact about the work, so the scan moves on instead of retrying it.
      if (execution && !recovering) execution.release(workId);
      return {
        kind: 'skipped',
        skip: { code: 'filtered', workId, reason: 'downloader declined this candidate (no artifact)' },
      };
    }
    // The artifact is durable, but this cell has NOT committed to it until the
    // delivery below actually claims it. A candidate that turns out to be a
    // duplicate must give the binding BACK, or `bind()` would refuse the next
    // candidate and the scan could never advance — the whole point of this
    // change. `releaseCellWork` itself refuses once the cell moved on
    // (delivery_pending/submitted), so a committed identity stays stable.
    const attempt = this.recordArtifactOutcome(artifact, target);
    if (attempt.kind === 'skipped' && execution && !recovering) {
      execution.release(workId);
    }
    return attempt;
  }

  /**
   * Turn a downloaded artifact into the target's business outcome. In cache
   * delivery mode the DeliveryService creates the durable intent atomically and
   * the result is 'delivery_pending' (NOT submitted — the OutboxWorker confirms
   * the ACK). Persistent/download-only runs are 'stored'.
   *
   * An ALREADY-DELIVERED work is returned as a candidate SKIP, never as a
   * target outcome: the run must try the next candidate instead of ending the
   * slot as a `duplicate`. The delivery idempotency ledger is what makes the
   * second concurrent worker lose this race instead of double-submitting.
   */
  private recordArtifactOutcome(
    artifact: import('../../delivery/types').DownloadedArtifact,
    target: TargetConfig
  ): CandidateAttempt {
    const isDelivery = target.storageMode === 'cache' && target.delivery?.target?.trim();
    if (!isDelivery || !this.deliveryService) {
      this.outcomes.push({ kind: 'stored', workId: artifact.pixivId, workType: artifact.type });
      return { kind: 'selected', workId: artifact.pixivId, workType: artifact.type };
    }
    // Pre-lock delivery dedupe (after selection): if the ledger already knows it,
    // that is a confirmed fact, not a new submission.
    const slotId = (target.delivery as { executionContext?: { slotId?: string } } | undefined)?.executionContext?.slotId;
    if (this.deliveryService.isAlreadyDelivered(target.delivery!.target!, artifact.type, artifact.pixivId)) {
      return {
        kind: 'skipped',
        skip: {
          code: 'duplicate',
          workId: artifact.pixivId,
          reason: 'already delivered to target (delivery ledger)',
        },
      };
    }
    const res = this.deliveryService.enqueue(artifact, target, {
      slotId,
      fields: target.delivery?.fields as Record<string, unknown> | undefined,
      extraContext: this.executionContextFields(target),
    });
    if (res.duplicate) {
      return {
        kind: 'skipped',
        skip: {
          code: 'duplicate',
          workId: artifact.pixivId,
          reason: 'already delivered to target (idempotency ledger)',
        },
      };
    }
    this.outcomes.push({
      kind: 'delivery_pending',
      workId: artifact.pixivId,
      workType: artifact.type,
      deliveryId: res.deliveryId,
    });
    return { kind: 'selected', workId: artifact.pixivId, workType: artifact.type };
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
