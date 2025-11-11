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
    });

    this.illustrationHandler = new IllustrationTargetHandler(
      client,
      database,
      this.rankingService,
      this.illustrationDownloader,
      this.pipeline
    );

    this.novelHandler = new NovelTargetHandler(
      client,
      database,
      this.rankingService,
      this.pipeline,
      this.novelDownloader
    );
  }

  setProgressCallback(callback: (current: number, total: number, message?: string) => void): void {
    this.progressReporter.setCallback(callback);
  }

  public async initialise() {
    await this.fileService.initialise();
  }

  public async runAllTargets() {
    const totalTargets = this.config.targets.length;

    if (totalTargets === 0) {
      this.progressReporter.complete(0, '所有目标处理完成');
      return;
    }

    let currentTarget = 0;
    const errors: Array<{ target: string; error: string }> = [];

    for (const target of this.config.targets) {
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
}

