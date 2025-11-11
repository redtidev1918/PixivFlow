import { logger } from '../../logger';
import { is404Error, isSkipableError, NetworkError } from '../../utils/errors';

export type RecoveryDecision =
  | { action: 'retry'; delayMs?: number; maxAttempts?: number; reason?: string }
  | { action: 'backoff'; delayMs: number; maxAttempts?: number; reason?: string }
  | { action: 'skip'; reason?: string }
  | { action: 'fail'; reason?: string };

export interface RecoveryContext {
  attempt: number;
  itemId?: number | string;
  itemType?: 'illustration' | 'novel';
}

export interface ErrorRecoveryStrategy {
  decide(error: unknown, context: RecoveryContext): RecoveryDecision;
}

export interface DefaultErrorRecoveryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export class DefaultErrorRecovery implements ErrorRecoveryStrategy {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: DefaultErrorRecoveryOptions = {}) {
    const { maxAttempts = 3, baseDelayMs = 500, maxDelayMs = 5000 } = options;
    this.maxAttempts = Math.max(1, maxAttempts);
    this.baseDelayMs = Math.max(0, baseDelayMs);
    this.maxDelayMs = Math.max(this.baseDelayMs, maxDelayMs);
  }

  decide(error: unknown, context: RecoveryContext): RecoveryDecision {
    const attempt = Math.max(1, context.attempt);

    // Skip immediately for known skip conditions
    if (is404Error(error)) {
      return { action: 'skip', reason: '404 not found or item is private' };
    }

    if (isSkipableError(error)) {
      return { action: 'skip', reason: 'explicitly marked as skipable' };
    }

    // Fail fast when attempts exceeded
    if (attempt >= this.maxAttempts) {
      return { action: 'fail', reason: 'max attempts reached' };
    }

    // For network errors, respect server-provided wait time or exponential backoff
    if (error instanceof NetworkError) {
      const delayFromServer =
        typeof error.waitTime === 'number' && error.waitTime > 0 ? error.waitTime : undefined;
      const backoff = Math.min(this.baseDelayMs * Math.pow(2, attempt - 1), this.maxDelayMs);
      const delayMs = delayFromServer ?? backoff;
      logger.warn(
        `Network error when downloading ${context.itemType ?? 'item'} ${context.itemId ?? ''} (attempt ${attempt}/${this.maxAttempts}), retrying after ${delayMs}ms`
      );
      return { action: 'backoff', delayMs, maxAttempts: this.maxAttempts, reason: 'network error' };
    }

    const delayMs = Math.min(this.baseDelayMs * attempt, this.maxDelayMs);
    logger.warn(
      `Retrying ${context.itemType ?? 'item'} ${context.itemId ?? ''} (attempt ${attempt}/${this.maxAttempts}) after ${delayMs}ms`
    );
    return { action: 'retry', delayMs, maxAttempts: this.maxAttempts, reason: 'transient error' };
  }
}


