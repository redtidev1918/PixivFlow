import { StandaloneConfig, TargetConfig } from '../../config';
import { logger } from '../../logger';
import { getErrorMessage, is404Error } from '../../utils/errors';
import { PixivIllust, PixivNovel } from '../../pixiv/PixivClient';
import { DownloadPlanner } from '../plan/DownloadPlanner';
import { DownloadExecutor } from '../exec/DownloadExecutor';
import { ProgressReporter } from '../report/ProgressReporter';
import { ErrorRecoveryStrategy, RecoveryDecision } from '../recovery/ErrorRecovery';

type DownloadItem = PixivIllust | PixivNovel;
type ItemType = 'illustration' | 'novel';

export interface DownloadPipelineResult {
  downloaded: number;
  skipped: number;
  alreadyDownloaded: number;
  filteredOut: number;
}

export interface DownloadPipelineDependencies {
  config: StandaloneConfig;
  planner: DownloadPlanner;
  executor: DownloadExecutor;
  progressReporter: ProgressReporter;
  recovery: ErrorRecoveryStrategy;
}

export class DownloadPipeline {
  private readonly config: StandaloneConfig;
  private readonly planner: DownloadPlanner;
  private readonly executor: DownloadExecutor;
  private readonly progressReporter: ProgressReporter;
  private readonly recovery: ErrorRecoveryStrategy;

  constructor(deps: DownloadPipelineDependencies) {
    this.config = deps.config;
    this.planner = deps.planner;
    this.executor = deps.executor;
    this.progressReporter = deps.progressReporter;
    this.recovery = deps.recovery;
  }

  async run<T extends DownloadItem>(
    items: T[],
    target: TargetConfig,
    itemType: ItemType,
    downloadFn: (item: T, tag: string) => Promise<void>
  ): Promise<DownloadPipelineResult> {
    const tagForLog = target.filterTag || target.tag || 'unknown';
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
    };

    if (plan.mode === 'random') {
      await this.executeRandomMode(plan, targetLimit, planAvailableCount, itemType, tagForLog, downloadFn, retryAttempts, state);
    } else {
      await this.executeSequentialMode(plan, targetLimit, itemType, tagForLog, downloadFn, retryAttempts, state);
    }

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
    };
  }

  private async executeRandomMode<T extends DownloadItem>(
    plan: { queue: T[]; random?: { maxAttempts: number } },
    targetLimit: number,
    planAvailableCount: number,
    itemType: ItemType,
    tagForLog: string,
    downloadFn: (item: T, tag: string) => Promise<void>,
    retryAttempts: number,
    state: { downloaded: number; skippedCount: number }
  ): Promise<void> {
    const candidates = plan.queue;
    if (planAvailableCount === 0) {
      logger.info('All search results have already been downloaded');
      return;
    }

    if (candidates.length === 0) {
      return;
    }

    const concurrency = this.config.download?.concurrency || 3;
    const selectionLimit = plan.random?.maxAttempts ?? candidates.length;
    let attemptCounter = 0;
    let completedForProgress = 0;
    const totalPlanned = Math.min(candidates.length, targetLimit);

    await this.executor.run<T, void>({
      items: candidates,
      concurrency,
      maxAttempts: retryAttempts,
      recovery: this.recovery,
      contextProvider: () => ({ itemType }),
      task: async (item) => {
        if (state.downloaded >= targetLimit) {
          return;
        }

        const attempt = ++attemptCounter;
        const remaining = Math.max(0, candidates.length - attempt + 1);
        const typeLabel = itemType === 'illustration' ? 'Illustration' : 'Novel';
        logger.info(
          `Randomly selected ${typeLabel.toLowerCase()} ${item.id} from ${remaining} remaining result(s) (attempt ${attempt}/${selectionLimit})`
        );

        await downloadFn(item, tagForLog);
        state.downloaded++;
        this.updateProgress(
          state.downloaded,
          targetLimit,
          `已下载 ${itemType === 'illustration' ? '插画' : '小说'} ${item.id} (${state.downloaded}/${targetLimit})`
        );
        if (itemType === 'novel') {
          logger.info(`Successfully downloaded novel ${item.id} (${state.downloaded}/${targetLimit})`);
        }
      },
      onProgress: (done, total) => {
        completedForProgress = done;
        const msgBase = itemType === 'illustration' ? '插画' : '小说';
        this.updateProgress(
          Math.min(state.downloaded, targetLimit),
          targetLimit,
          `随机模式进行中(${completedForProgress}/${total}) - 已下载 ${msgBase}: ${state.downloaded}`
        );
      },
      onDecision: (decision, { item, error }) => {
        const typedItem = item as DownloadItem;
        this.logRecoveryDecision(decision, error, typedItem.id, itemType, typedItem.title);
        if (decision.action === 'skip') {
          state.skippedCount++;
        }
      },
    });

    if (totalPlanned < targetLimit && state.downloaded < targetLimit) {
      logger.info(
        `Random mode ended after ${totalPlanned} attempt(s); downloaded ${state.downloaded}/${targetLimit} ${itemType}(s)`
      );
    }
  }

  private async executeSequentialMode<T extends DownloadItem>(
    plan: { queue: T[] },
    targetLimit: number,
    itemType: ItemType,
    tagForLog: string,
    downloadFn: (item: T, tag: string) => Promise<void>,
    retryAttempts: number,
    state: { downloaded: number; skippedCount: number }
  ): Promise<void> {
    const toProcess = plan.queue;
    const concurrency = this.config.download?.concurrency || 3;
    const totalPlanned = toProcess.length;
    let completedForProgress = 0;

    await this.executor.run<T, void>({
      items: toProcess,
      concurrency,
      maxAttempts: retryAttempts,
      recovery: this.recovery,
      contextProvider: () => ({ itemType }),
      task: async (item) => {
        if (state.downloaded >= targetLimit) {
          return;
        }
        await downloadFn(item, tagForLog);
        state.downloaded++;
        this.updateProgress(
          state.downloaded,
          targetLimit,
          `已下载 ${itemType === 'illustration' ? '插画' : '小说'} ${item.id} (${state.downloaded}/${targetLimit})`
        );
        if (itemType === 'novel') {
          logger.info(`Successfully downloaded novel ${item.id} (${state.downloaded}/${targetLimit})`);
        }
      },
      onProgress: (done, total) => {
        completedForProgress = done;
        const msgBase = itemType === 'illustration' ? '插画' : '小说';
        this.updateProgress(
          Math.min(state.downloaded, targetLimit),
          targetLimit,
          `进行中(${completedForProgress}/${totalPlanned}) - 已下载 ${msgBase}: ${state.downloaded}`
        );
      },
      onDecision: (decision, { item, error }) => {
        const typedItem = item as DownloadItem;
        this.logRecoveryDecision(decision, error, typedItem.id, itemType, typedItem.title);
        if (decision.action === 'skip') {
          state.skippedCount++;
        }
      },
    });
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


