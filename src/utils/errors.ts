/**
 * Unified error handling utilities
 * Provides consistent error types and handling patterns across the application
 */

export class PixivFlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'PixivFlowError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PixivFlowError);
    }
  }
}

export class ConfigError extends PixivFlowError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', 400, cause);
    this.name = 'ConfigError';
  }
}

export class AuthenticationError extends PixivFlowError {
  constructor(message: string, cause?: Error) {
    super(message, 'AUTH_ERROR', 401, cause);
    this.name = 'AuthenticationError';
  }
}

export class NetworkError extends PixivFlowError {
  public readonly isRateLimit?: boolean;
  public readonly waitTime?: number;
  
  constructor(
    message: string, 
    public readonly url?: string, 
    cause?: Error,
    metadata?: { isRateLimit?: boolean; waitTime?: number }
  ) {
    super(message, 'NETWORK_ERROR', undefined, cause);
    this.name = 'NetworkError';
    this.isRateLimit = metadata?.isRateLimit;
    this.waitTime = metadata?.waitTime;
  }
}

export class DownloadError extends PixivFlowError {
  constructor(
    message: string,
    public readonly itemId?: number,
    public readonly itemType?: 'illustration' | 'novel',
    cause?: Error
  ) {
    super(message, 'DOWNLOAD_ERROR', undefined, cause);
    this.name = 'DownloadError';
  }
}

export class DatabaseError extends PixivFlowError {
  constructor(message: string, cause?: Error) {
    super(message, 'DATABASE_ERROR', 500, cause);
    this.name = 'DatabaseError';
  }
}

/**
 * Check if an error is a 404 (not found) error
 */
export function is404Error(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('404') || 
           error.message.includes('not found') ||
           (error instanceof NetworkError && error.statusCode === 404);
  }
  return String(error).includes('404');
}

/**
 * Check if an error should be skipped (non-fatal)
 */
export function isSkipableError(error: unknown): boolean {
  if (is404Error(error)) {
    return true;
  }
  
  if (error instanceof Error) {
    // Network timeouts and connection errors are usually skipable
    const skipablePatterns = [
      'timeout',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      '403', // Forbidden (private content)
      'language filter', // Language filter mismatch (should skip)
      'skipped:', // Explicitly skipped items (e.g., "Novel X skipped: ...")
    ];
    
    return skipablePatterns.some(pattern => 
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }
  
  return false;
}

/**
 * Extract error message safely
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Get detailed error information including cause and suggestions
 */
export function getDetailedErrorInfo(error: unknown): {
  message: string;
  type: string;
  cause?: string;
  suggestions?: string[];
} {
  const message = getErrorMessage(error);
  let type = 'UNKNOWN_ERROR';
  let cause: string | undefined;
  const suggestions: string[] = [];

  if (error instanceof NetworkError) {
    type = 'NETWORK_ERROR';
    if (error.cause) {
      cause = getErrorMessage(error.cause);
    }
    
    // Add suggestions based on error message
    const msgLower = message.toLowerCase();
    if (msgLower.includes('401') || msgLower.includes('unauthorized')) {
      suggestions.push('认证失败：请检查 refresh token 是否有效');
      suggestions.push('尝试重新登录以获取新的 refresh token');
    } else if (msgLower.includes('403') || msgLower.includes('forbidden')) {
      suggestions.push('访问被拒绝：可能是 Pixiv API 限制');
      suggestions.push('等待一段时间后重试，或检查账户状态');
    } else if (msgLower.includes('timeout') || msgLower.includes('timed out')) {
      suggestions.push('请求超时：检查网络连接');
      suggestions.push('尝试增加网络超时时间或使用代理');
    } else if (msgLower.includes('failed after')) {
      suggestions.push('多次重试后仍然失败：可能是网络不稳定或 API 限制');
      suggestions.push('检查网络连接和代理设置');
      suggestions.push('等待一段时间后重试');
    }
  } else if (error instanceof AuthenticationError) {
    type = 'AUTH_ERROR';
    suggestions.push('认证错误：请检查 refresh token 是否有效');
    suggestions.push('尝试重新登录以获取新的 refresh token');
  }

  return { message, type, cause, suggestions: suggestions.length > 0 ? suggestions : undefined };
}

/**
 * Extract error stack trace safely
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Error recovery strategies for operational flows
 */
export enum ErrorRecoveryStrategy {
  SKIP = 'SKIP',
  WAIT_AND_RETRY = 'WAIT_AND_RETRY',
  RETRY = 'RETRY',
  FAIL = 'FAIL',
}

/**
 * Decide a recovery strategy based on error type and metadata
 */
export function getErrorRecoveryStrategy(error: unknown): ErrorRecoveryStrategy {
  if (isSkipableError(error)) {
    return ErrorRecoveryStrategy.SKIP;
  }
  if (error instanceof NetworkError) {
    if (error.isRateLimit) {
      return ErrorRecoveryStrategy.WAIT_AND_RETRY;
    }
    return ErrorRecoveryStrategy.RETRY;
  }
  if (error instanceof AuthenticationError) {
    return ErrorRecoveryStrategy.FAIL;
  }
  if (error instanceof ConfigError) {
    return ErrorRecoveryStrategy.FAIL;
  }
  return ErrorRecoveryStrategy.RETRY;
}

/**
 * Safe async execution with retries
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  options?: {
    retries?: number;
    retryDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
    onError?: (error: unknown, attempt: number) => void;
  }
): Promise<T> {
  const retries = options?.retries ?? 0;
  const baseDelay = options?.retryDelay ?? 0;
  const shouldRetry = options?.shouldRetry;
  const onError = options?.onError;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      onError?.(error, attempt);

      const allowRetry =
        attempt <= retries &&
        (shouldRetry ? shouldRetry(error) : !(error instanceof ConfigError) && !(error instanceof AuthenticationError));

      if (!allowRetry) {
        throw error;
      }

      // Respect NetworkError.waitTime if present; otherwise use configured delay
      const waitMs =
        error instanceof NetworkError && typeof error.waitTime === 'number' && error.waitTime > 0
          ? error.waitTime
          : baseDelay;

      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
}

export type Result<T> =
  | { success: true; value: T }
  | { success: false; error: Error };

export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const value = await fn();
    return { success: true, value };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(getErrorMessage(e));
    return { success: false, error: err };
  }
}
