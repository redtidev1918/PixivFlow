import { StandaloneConfig, TargetConfig } from '../config';
import { logger } from '../logger';
import { IDownloadManager } from '../interfaces/IDownloadManager';
import { IPixivClient } from '../interfaces/IPixivClient';
import { IDatabase } from '../interfaces/IDatabase';
import { IFileService } from '../interfaces/IFileService';
import { RankingService } from './RankingService';
import { IllustrationDownloader } from './IllustrationDownloader';
import { NovelDownloader } from './NovelDownloader';
import { ProgressReporter } from './report/ProgressReporter';
import { DownloadPlanner } from './plan/DownloadPlanner';
import { DownloadExecutor } from './exec/DownloadExecutor';
import { DefaultErrorRecovery, ErrorRecoveryStrategy } from './recovery/ErrorRecovery';
import { DownloadPipeline } from './pipeline/DownloadPipeline';
import { OperationCancelledError } from '../utils/errors';
import { DeliveryService } from '../delivery/DeliveryService';
import { TargetOutcome } from '../scheduler/TargetOutcome';
import { IllustrationTargetHandler } from './handlers/IllustrationTargetHandler';
import { NovelTargetHandler } from './handlers/NovelTargetHandler';
import { createTopicPipelineFactory } from '../topic/createTopicPipeline';

/**
 * Download Manager with Concurrency Control
 * 
 * Orchestrates the download process for Pixiv illustrations and novels.
 * 
 * Performance optimizations:
 * - Dynamic concurrency adjustment based on rate limits (via DownloadExecutor)
 * - Request queuing to prevent API overload (via concurrency utilities)
 * - Batch processing for multiple targets (via DownloadPipeline)
 * - Intelligent retry with exponential backoff (via ErrorRecovery)
 * - Progress reporting with throttling (via ProgressReporter)
 * 
 * Architecture:
 * - Planner: Generates download tasks, handles deduplication and filtering
 * - Executor: Manages concurrent execution with rate limiting
 * - Pipeline: Orchestrates sequential/random download modes
 * - Recovery: Handles errors with configurable retry strategies
 * - Reporter: Provides progress updates and statistics
 * 
 * @see src/utils/concurrency.ts for concurrency management utilities
 * @see src/download/exec/DownloadExecutor.ts for execution control
 * @see src/download/pipeline/DownloadPipeline.ts for download orchestration
 */
export class DownloadManager implements IDownloadManager {
  private readonly progressReporter: ProgressReporter;
  private readonly rankingService: RankingService;
  private readonly illustrationDownloader: IllustrationDownloader;
  private readonly novelDownloader: NovelDownloader;
  private readonly planner: DownloadPlanner;
  private readonly executor: DownloadExecutor;
  private readonly errorRecovery: ErrorRecoveryStrategy;
  private readonly pipeline: DownloadPipeline;
  private readonly illustrationHandler: IllustrationTargetHandler;
  private readonly novelHandler: NovelTargetHandler;

  // Cooperative cancellation state (see cancel())
  private cancelled = false;
  private cancelReason = '';
  /**
   * Hard cancellation signal for the current run. The flag above only stops the
   * pipeline between items; this aborts the in-flight HTTP request too, so a
   * cancelled run cannot sit blocked inside a Pixiv call until the scheduler
   * times out — and, once timed out, cannot keep holding its slot lease.
   */
  private readonly abortController = new AbortController();
  private readonly deliveryService!: DeliveryService;
  /** Per-target TYPED outcome hook (the Slot ledger maps it to cell transitions). */
  private onTargetOutcome: ((target: TargetConfig, outcome: TargetOutcome) => void) | null = null;

  /** Register a callback fired after each target with its explicit business outcome. */
  public setTargetOutcomeHook(fn: (target: TargetConfig, outcome: TargetOutcome) => void): void {
    this.onTargetOutcome = fn;
  }

  /** Expose delivery service for handlers (preflight + intent creation). */
  public get deliveries(): DeliveryService {
    return this.deliveryService;
  }

  /** Slot context propagated to delivery templates/outcomes for scheduled runs. */
  public slotContext?: {
    slotId: string;
    scheduleId: string;
    occurrenceAtIso: string;
    triggerSource: string;
    slotName: string;
    slotDate: string;
  };

  /**
   * Request cooperative cancellation of the current run. In-flight item
   * finishes; no further targets/items are started. runAllTargets() will
   * throw OperationCancelledError once drained.
   */
  public cancel(reason: string = 'cancelled'): void {
    if (!this.cancelled) {
      this.cancelled = true;
      this.cancelReason = reason;
      logger.warn(`Download cancellation requested: ${reason}`);
    }
    // Always abort, even on a repeated cancel: the signal is what unwedges an
    // in-flight request, and an early cancel (e.g. process shutdown) must not
    // leave a later, already-aborted run with a live signal.
    if (!this.abortController.signal.aborted) {
      this.abortController.abort(reason);
    }
  }

  /** Run-scoped abort signal (already aborted once cancel() was called). */
  public get signal(): AbortSignal {
    return this.abortController.signal;
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  constructor(
    private readonly config: StandaloneConfig,
    client: IPixivClient,
    database: IDatabase,
    private readonly fileService: IFileService
  ) {
    this.progressReporter = new ProgressReporter();
    this.rankingService = new RankingService(client);

    const downloadConcurrency = config.download?.concurrency || 3;
    const storagePath = config.storage?.illustrationDirectory ?? config.storage?.downloadDirectory ?? './downloads';

    this.illustrationDownloader = new IllustrationDownloader(
      client,
      database,
      fileService,
      downloadConcurrency,
      storagePath
    );
    this.novelDownloader = new NovelDownloader(
      client,
      database,
      fileService,
      database as unknown as import('../storage/Database').Database
    );
    this.planner = new DownloadPlanner(database, {
      deliveredIds: (target, type, ids) =>
        this.deliveryService.deliveredIds(target, type, ids),
    });
    this.executor = new DownloadExecutor();

    const downloadConfig = config.download ?? {};
    const maxRetries = downloadConfig.maxRetries ?? 3;
    const retryDelay = downloadConfig.retryDelay ?? 2000;
    const maxDelay = Math.max(retryDelay * 4, retryDelay);

    this.errorRecovery = new DefaultErrorRecovery({
      maxAttempts: maxRetries,
      baseDelayMs: retryDelay,
      maxDelayMs: maxDelay,
    });

    this.pipeline = new DownloadPipeline({
      config,
      planner: this.planner,
      executor: this.executor,
      progressReporter: this.progressReporter,
      recovery: this.errorRecovery,
      isCancelled: () => this.cancelled,
    });

    // Delivery ledger + SQLite outbox. Requires the concrete Database (with the
    // deliveries/outbox repositories). Unit tests pass plain mock databases; in
    // that case delivery dedupe/enqueue is simply inactive.
    this.deliveryService = new DeliveryService(
      database as unknown as import('../storage/Database').Database
    );

    // One lazily-created topic pipeline (shared resolver/cache) for this run.
    const topicFactory = createTopicPipelineFactory(
      client,
      typeof (database as unknown as { getDatabasePath?: () => string }).getDatabasePath === 'function'
        ? (database as unknown as { getDatabasePath(): string })
        : config.storage?.databasePath,
      config.download?.requestDelay ?? 500,
      this.abortController.signal
    );

    this.illustrationHandler = new IllustrationTargetHandler(
      client,
      database,
      this.rankingService,
      this.illustrationDownloader,
      this.pipeline,
      topicFactory,
      this.deliveryService
    );

    this.novelHandler = new NovelTargetHandler(
      client,
      database,
      this.rankingService,
      this.pipeline,
      this.novelDownloader,
      topicFactory,
      this.deliveryService
    );
  }

  setProgressCallback(callback: (current: number, total: number, message?: string) => void): void {
    this.progressReporter.setCallback(callback);
  }

  public async initialise() {
    await this.fileService.initialise();
  }

  public async runAllTargets() {
    // NOTE: pending deliveries are pumped independently by the OutboxWorker,
    // not piggy-backed onto the next download run. No retryPending() here.
    const totalTargets = this.config.targets.length;

    if (totalTargets === 0) {
      this.progressReporter.complete(0, '所有目标处理完成');
      return;
    }

    let currentTarget = 0;
    const errors: Array<{ target: string; error: string }> = [];

    for (const target of this.config.targets) {
      if (this.cancelled) {
        logger.warn(`Skipping remaining ${totalTargets - currentTarget + 1} target(s): ${this.cancelReason}`);
        break;
      }

      currentTarget++;
      const targetName = target.filterTag || target.tag || 'unknown';
      this.updateProgress(currentTarget, totalTargets, `处理目标: ${targetName} (${target.type})`);

      try {
        const outcome = await this.dispatchTarget(target);
        this.onTargetOutcome?.(target, outcome);
        if (outcome.kind === 'failed' && !outcome.retryable) {
          errors.push({ target: `${targetName} (${target.type})`, error: outcome.error });
        }
      } catch (error) {
        // A raw escape means an unexpected/retryable infrastructure failure.
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ target: `${targetName} (${target.type})`, error: errorMessage });
        logger.error(`Target ${targetName} (${target.type}) failed, continuing with next target`, { error: errorMessage });
        this.onTargetOutcome?.(target, { kind: 'failed', retryable: true, error: errorMessage });
      }
    }

    if (this.cancelled) {
      throw new OperationCancelledError(`下载已取消: ${this.cancelReason || '用户停止'}`);
    }

    this.progressReporter.complete(totalTargets, '所有目标处理完成');

    if (errors.length > 0) {
      logger.warn(`Completed with ${errors.length} target(s) failed`, { 
        failedTargets: errors.length,
        totalTargets,
        errors: errors.map((e) => `${e.target}: ${e.error}`).join('; '),
      });

      if (errors.length === totalTargets) {
        throw new Error(`All ${totalTargets} target(s) failed. See logs for details.`);
      }
    }
  }

  private async dispatchTarget(target: TargetConfig): Promise<TargetOutcome> {
    switch (target.type) {
      case 'illustration':
        return await this.illustrationHandler.handle(target);
      case 'novel':
        return await this.novelHandler.handle(target);
      default:
        logger.warn(`Unsupported target type ${target.type}`);
        return { kind: 'failed', retryable: false, error: `unsupported target type ${target.type}` };
    }
  }

  private updateProgress(current: number, total: number, message?: string): void {
    this.progressReporter.update(current, total, message);
  }

}
