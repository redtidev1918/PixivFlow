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
import { DeliveryDispatcher } from '../delivery/DeliveryDispatcher';
import { DeliveryOutbox } from '../delivery/DeliveryOutbox';
import { dirname, join } from 'node:path';
import { IllustrationTargetHandler } from './handlers/IllustrationTargetHandler';
import { NovelTargetHandler } from './handlers/NovelTargetHandler';

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
  private readonly deliveryOutbox: DeliveryOutbox;

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
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  constructor(
    private readonly config: StandaloneConfig,
    private readonly client: IPixivClient,
    private readonly database: IDatabase,
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
    this.novelDownloader = new NovelDownloader(client, database, fileService);
    this.planner = new DownloadPlanner(database);
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

    const databasePath = config.storage?.databasePath ?? './data/pixiv-downloader.db';
    const deliveryDispatcher = new DeliveryDispatcher(
      config.delivery,
      this.buildProxyUrl(config.network)
    );
    this.deliveryOutbox = new DeliveryOutbox(
      join(dirname(databasePath), 'delivery-outbox'),
      deliveryDispatcher,
      config.delivery?.deleteAfterDelivery !== false,
      {
        retryBaseDelayMs: config.delivery?.outboxRetryBaseMs,
        retryMaxDelayMs: config.delivery?.outboxRetryMaxMs,
      }
    );

    this.illustrationHandler = new IllustrationTargetHandler(
      client,
      database,
      this.rankingService,
      this.illustrationDownloader,
      this.pipeline,
      this.deliveryOutbox
    );

    this.novelHandler = new NovelTargetHandler(
      client,
      database,
      this.rankingService,
      this.pipeline,
      this.novelDownloader,
      this.deliveryOutbox
    );
  }

  setProgressCallback(callback: (current: number, total: number, message?: string) => void): void {
    this.progressReporter.setCallback(callback);
  }

  public async initialise() {
    await this.fileService.initialise();
  }

  public async runAllTargets() {
    const pending = await this.deliveryOutbox.retryPending();
    if (pending.succeeded > 0 || pending.failed > 0) {
      logger.info('Processed pending deliveries', { ...pending });
    } else if (pending.deferred > 0) {
      logger.debug('Pending deliveries remain in backoff', { ...pending });
    }

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
        await this.dispatchTarget(target);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ target: `${targetName} (${target.type})`, error: errorMessage });
        logger.error(`Target ${targetName} (${target.type}) failed, continuing with next target`, { error: errorMessage });
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

  private async dispatchTarget(target: TargetConfig): Promise<void> {
    switch (target.type) {
      case 'illustration':
        await this.illustrationHandler.handle(target);
            break;
      case 'novel':
        await this.novelHandler.handle(target);
              break;
      default:
        logger.warn(`Unsupported target type ${target.type}`);
    }
  }

  private updateProgress(current: number, total: number, message?: string): void {
    this.progressReporter.update(current, total, message);
  }

  private buildProxyUrl(network: StandaloneConfig['network']): string | undefined {
    const proxy = network?.proxy;
    if (!proxy?.enabled) {
      return undefined;
    }
    const protocol = proxy.protocol ?? 'http';
    if (protocol !== 'http' && protocol !== 'https') {
      logger.warn(`HTTP multipart delivery does not support ${protocol} proxy through undici; delivering directly`);
      return undefined;
    }
    const url = new URL(`${protocol}://${proxy.host}:${proxy.port}`);
    if (proxy.username) url.username = proxy.username;
    if (proxy.password) url.password = proxy.password;
    return url.toString();
  }
}
