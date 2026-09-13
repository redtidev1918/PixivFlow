import { StandaloneConfig, TargetConfig } from '../../config';
import { logger } from '../../logger';
import { getTargetLabel } from '../../utils/target-label';
import { getErrorMessage, is404Error } from '../../utils/errors';
import { PixivIllust, PixivNovel } from '@redtidev/pixiv-client';
import { DownloadPlanner } from '../plan/DownloadPlanner';
import { DownloadExecutor } from '../exec/DownloadExecutor';
import { ProgressReporter } from '../report/ProgressReporter';
import { ErrorRecoveryStrategy, RecoveryDecision } from '../recovery/ErrorRecovery';
import {
  CandidateAttempt,
  CandidateScanSummary,
  CandidateSkip,
  classifyCandidateFailure,
  isSelectedAttempt,
} from '../../scheduler/TargetOutcome';

type DownloadItem = PixivIllust | PixivNovel;
type ItemType = 'illustration' | 'novel';

export interface DownloadPipelineResult {
  /**
   * Candidates that PRODUCED a business result for this target. A candidate
   * that was skipped (duplicate, deleted, private, ...) does not count: that is
   * precisely the accounting error that let a duplicate end a scheduled slot as
   * a completed run.
   */
  downloaded: number;
  /** Candidates the executor skipped after an error (legacy error counter). */
  skipped: number;
  alreadyDownloaded: number;
  filteredOut: number;
  /** Per-candidate skip reasons (first few), so callers can report the real cause. */
  skipDetails?: { id: string; error: string }[];
  /**
   * Bounded candidate-scan bookkeeping. Always present, so the caller can state
   * an explicit terminal outcome instead of "completed".
   */
  scan: CandidateScanSummary;
}

export interface DownloadPipelineDependencies {
  config: StandaloneConfig;
  planner: DownloadPlanner;
  executor: DownloadExecutor;
  progressReporter: ProgressReporter;
  recovery: ErrorRecoveryStrategy;
  /**
   * Cooperative cancellation check. When provided and returning true,
   * remaining items become no-ops so the current batch drains quickly.
   */
  isCancelled?: () => boolean;
}

/**
 * What a candidate hook must report back: did this candidate produce the
 * target's business result, or was it unusable?
 *
 * `void` is accepted and treated as `selected`, so a hook with no
 * candidate-level information keeps the historical meaning of "it resolved".
 */
export type CandidateDownloadFn<T extends DownloadItem> = (
  item: T,
  tag: string
) => Promise<CandidateAttempt | void>;

export class DownloadPipeline {
  private readonly config: StandaloneConfig;
  private readonly planner: DownloadPlanner;
  private readonly executor: DownloadExecutor;
  private readonly progressReporter: ProgressReporter;
  private readonly recovery: ErrorRecoveryStrategy;
  private readonly isRunCancelled: () => boolean;

  constructor(deps: DownloadPipelineDependencies) {
    this.config = deps.config;
    this.planner = deps.planner;
    this.executor = deps.executor;
    this.progressReporter = deps.progressReporter;
    this.recovery = deps.recovery;
    this.isRunCancelled = deps.isCancelled ?? (() => false);
  }

  async run<T extends DownloadItem>(
    items: T[],
    target: TargetConfig,
    itemType: ItemType,
    downloadFn: CandidateDownloadFn<T>
  ): Promise<DownloadPipelineResult> {
    const tagForLog = getTargetLabel(target);
    const plan = this.planner.planDownloads(items, target, itemType);
    const targetLimit = plan.limit;
    const filteredOutCount = plan.filteredOut;
    const planAvailableCount = plan.availableCount;
    const alreadyDownloadedCount = plan.alreadyDownloaded;
    const retryAttempts = this.config.download?.maxRetries ?? 3;

    this.updateProgress(0, targetLimit, `准备下载 ${itemType === 'illustration' ? '插画' : '小说'}: ${tagForLog}`);

    const state = {
      downloaded: 0,
      skippedCount: 0,
      skipDetails: [] as { id: string; error: string }[],
    };

    /**
     * Bounded candidate scan bookkeeping. `bound` is the plan's window (the
     * planner already clamped it to the configured limit) AND the item list
     * length, so the scan is structurally unable to exceed it: a page full of
     * duplicates terminates after at most `bound` attempts instead of looping.
     */
    const scan: CandidateScanSummary = {
      bound: plan.scanBound ?? plan.queue.length,
      attempted: 0,
      skipped: [...(plan.prefiltered ?? [])],
      outages: [],
    };
    /**
     * Candidate INDEXES this run has attempted. Retries of the same candidate
     * (the executor's backoff path) must not count as new candidates, and must
     * not be blocked by the bound: that would silently convert a retried failure
     * into a success.
     */
    const attemptedIndices = new Set<number>();
    if (scan.skipped.length > 0) {
      logger.info(
        `Candidate scan pre-filtered ${scan.skipped.length} candidate(s) before download ` +
          `(${[...new Set(scan.skipped.map((s) => s.code))].join(', ')})`,
        { target: tagForLog }
      );
    }

    /** Record a candidate-level skip: the scan advances to the next candidate. */
    const recordCandidateSkip = (skip: CandidateSkip): void => {
      scan.skipped.push(skip);
      if (scan.skipped.length <= 5) {
        logger.info(
          `Candidate ${skip.workId} skipped (${skip.code}${skip.retryable ? ', transient' : ''}): ${skip.reason}`,
          { target: tagForLog }
        );
      }
      if (state.skipDetails.length < 3 && !state.skipDetails.some((d) => d.id === skip.workId)) {
        state.skipDetails.push({ id: skip.workId, error: skip.reason });
      }
    };

    /**
     * Classify a candidate FAILURE. A dead database / dead token / dead
     * delivery provider / dead network is a JOB problem and is recorded as an
     * outage, so the target can fail instead of reporting "no eligible
     * candidate". Anything else is a candidate problem: skip, try the next.
     */
    const recordCandidateFailure = (error: unknown, workId: string): void => {
      const failure = classifyCandidateFailure(error, workId);
      if (failure.scope === 'job') {
        if (!scan.outages.includes(failure.outage)) {
          scan.outages.push(failure.outage);
        }
        logger.error(`Job-level outage while scanning (${failure.outage}): ${failure.error}`, {
          target: tagForLog,
          candidate: workId,
        });
        return;
      }
      recordCandidateSkip(failure.skip);
      state.skippedCount++;
    };

    const runOptions = {
      concurrency:
        plan.mode === 'sequential' && plan.queue.length > targetLimit
          ? 1
          : itemType === 'novel' && target.languageFilter
          ? 1
          : this.config.download?.concurrency || 3,
      maxAttempts: retryAttempts,
      recovery: this.recovery,
      contextProvider: () => ({ itemType }),
      task: async (item: T, index: number) => {
        if (state.downloaded >= targetLimit || this.isRunCancelled()) {
          return;
        }
        // Strict bound, measured in CANDIDATES — not in task invocations. A
        // retry of the same candidate (the executor's backoff path) must not
        // consume a new slot, or the guard would silently turn a retried failure
        // into a success and swallow it.
        if (!attemptedIndices.has(index)) {
          if (attemptedIndices.size >= scan.bound) {
            return;
          }
          attemptedIndices.add(index);
          scan.attempted = attemptedIndices.size;
        }
        const attempt = await downloadFn(item, tagForLog);
        if (isSelectedAttempt(attempt)) {
          state.downloaded++;
        } else if (attempt?.kind === 'skipped') {
          recordCandidateSkip(attempt.skip);
        } else {
          state.downloaded++;
        }
        this.updateProgress(
          state.downloaded,
          targetLimit,
          `已下载 ${itemType === 'illustration' ? '插画' : '小说'} ${item.id} (${state.downloaded}/${targetLimit})`
        );
        if (itemType === 'novel' && state.downloaded > 0) {
          logger.info(`Successfully downloaded novel ${item.id} (${state.downloaded}/${targetLimit})`);
        }
      },
      onProgress: (done: number, total: number) => {
        const msgBase = itemType === 'illustration' ? '插画' : '小说';
        this.updateProgress(
          Math.min(state.downloaded, targetLimit),
          targetLimit,
          `进行中(${done}/${total}) - 已下载 ${msgBase}: ${state.downloaded}`
        );
      },
      onDecision: (decision: RecoveryDecision, info: { item: T; error: unknown }) => {
        const typedItem = info.item as DownloadItem;
        this.logRecoveryDecision(decision, info.error, typedItem.id, itemType, typedItem.title);
        if (decision.action === 'skip') {
          const message = getErrorMessage(info.error) || decision.reason || 'download failed';
          recordCandidateFailure(
            info.error === undefined || info.error === null ? new Error(message) : info.error,
            String(typedItem.id)
          );
        }
      },
    };

    if (plan.mode === 'random') {
      if (planAvailableCount === 0) {
        logger.info('All search results have already been downloaded');
      } else if (plan.queue.length > 0) {
        await this.executor.run<T, void>({ ...runOptions, items: plan.queue });
      }
    } else if (plan.queue.length > 0) {
      await this.executor.run<T, void>({ ...runOptions, items: plan.queue });
    }

    logger.info(
      `Candidate scan ${tagForLog}: attempted ${scan.attempted}/${scan.bound}, produced ${state.downloaded} ` +
        `${itemType}(s), skipped ${scan.skipped.length}` +
        `${scan.outages.length > 0 ? `, job-level outage(s): ${scan.outages.join(', ')}` : ''}`
    );

    this.updateProgress(
      state.downloaded,
      targetLimit,
      `完成下载: ${state.downloaded} 个 ${itemType === 'illustration' ? '插画' : '小说'}`
    );

    return {
      downloaded: state.downloaded,
      skipped: state.skippedCount,
      alreadyDownloaded: alreadyDownloadedCount,
      filteredOut: filteredOutCount,
      skipDetails: state.skipDetails,
      scan,
    };
  }

  private updateProgress(current: number, total: number, message?: string) {
    this.progressReporter.update(current, total, message);
  }

  private logRecoveryDecision(
    decision: RecoveryDecision,
    error: unknown,
    itemId: number,
    itemType: ItemType,
    itemTitle?: string
  ): void {
    const errorMessage = getErrorMessage(error);
    const logContext = {
      error: errorMessage,
      ...(itemTitle && { [`${itemType}Title`]: itemTitle }),
      [`${itemType}Id`]: itemId,
      decision: decision.action,
      ...(decision.reason && { reason: decision.reason }),
    };

    switch (decision.action) {
      case 'skip': {
        if (decision.reason?.includes('404') || is404Error(error)) {
          logger.debug(
            `${itemType === 'illustration' ? 'Illustration' : 'Novel'} ${itemId} not found/private, skipping`,
            logContext
          );
        } else {
          logger.warn(
            `Skipping ${itemType === 'illustration' ? 'illustration' : 'novel'} ${itemId} after error`,
            logContext
          );
        }
        break;
      }
      case 'fail': {
        logger.error(
          `Failed to download ${itemType === 'illustration' ? 'illustration' : 'novel'} ${itemId}`,
          logContext
        );
        break;
      }
      case 'backoff':
      case 'retry': {
        logger.debug(
          `Retry scheduled for ${itemType === 'illustration' ? 'illustration' : 'novel'} ${itemId}`,
          {
            ...logContext,
            ...(decision.delayMs !== undefined && { delayMs: decision.delayMs }),
          }
        );
        break;
      }
      default:
        break;
    }
  }
}
