import {
  DefaultErrorRecovery,
  type ErrorRecoveryStrategy,
  type RecoveryContext,
  type RecoveryDecision,
} from '../recovery/ErrorRecovery';
import { logger } from '../../logger';

export interface ExecutionOptions<T, R> {
  items: T[];
  concurrency: number;
  task: (item: T, index: number) => Promise<R>;
  onProgress?: (done: number, total: number) => void;
  onError?: (error: unknown, item: T, index: number, attempt: number) => void;
  /** Max retries per item (including initial attempt as attempt 1). Default: 3 attempts total */
  maxAttempts?: number;
  /** Custom recovery strategy. If not provided, uses DefaultErrorRecovery(maxAttempts). */
  recovery?: ErrorRecoveryStrategy;
  /** Provide additional context for recovery decisions (e.g. itemType) */
  contextProvider?: (item: T, index: number) => Partial<RecoveryContext>;
  /** Observe recovery decisions for logging/metrics */
  onDecision?: (
    decision: RecoveryDecision,
    info: { item: T; index: number; attempt: number; error: unknown }
  ) => void;
}

export class DownloadExecutor {
  async run<T, R>(options: ExecutionOptions<T, R>): Promise<R[]> {
    const {
      items,
      concurrency,
      task,
      onProgress,
      onError,
      maxAttempts = 3,
      recovery = new DefaultErrorRecovery({ maxAttempts }),
      contextProvider,
      onDecision,
    } = options;

    if (items.length === 0) return [];

    const total = items.length;
    const results: R[] = [];
    let done = 0;

    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= total) break;
        const item = items[index];

        let attempt = 1;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const effectiveContext: RecoveryContext = {
            attempt,
            itemId: (item as any)?.id,
            ...(contextProvider?.(item, index) ?? {}),
          };

          try {
            const res = await task(item, index);
            results[index] = res;
            break;
          } catch (error) {
            onError?.(error, item, index, attempt);
            const decision = recovery.decide(error, effectiveContext);
            onDecision?.(decision, { item, index, attempt, error });
            if (decision.action === 'skip') {
              logger.warn(`Skipping item at index ${index} after attempt ${attempt}${decision.reason ? `: ${decision.reason}` : ''}`);
              break;
            }
            if (decision.action === 'fail') {
              throw error instanceof Error ? error : new Error(String(error));
            }
            // retry/backoff
            const delayMs = decision.delayMs ?? 0;
            if (delayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
            attempt += 1;
            if (attempt > (decision.maxAttempts ?? maxAttempts)) {
              logger.error(`Max attempts reached for item at index ${index}; failing`);
              throw error instanceof Error ? error : new Error(String(error));
            }
          }
        }

        done += 1;
        onProgress?.(done, total);
      }
    };

    const workerCount = Math.max(1, Math.min(concurrency, total));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }
}
