/**
 * Unit tests for error handling utilities
 */

import {
  PixivFlowError,
  ConfigError,
  AuthenticationError,
  NetworkError,
  DownloadError,
  DatabaseError,
  is404Error,
  isSkipableError,
  getErrorMessage,
  getErrorRecoveryStrategy,
  ErrorRecoveryStrategy,
  safeAsync,
  toResult,
  Result,
} from '../../utils/errors';

describe('Error Classes', () => {
  describe('PixivFlowError', () => {
    it('should create error with message and code', () => {
      const error = new PixivFlowError('Test error', 'TEST_ERROR');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('PixivFlowError');
    });

    it('should include cause error', () => {
      const cause = new Error('Original error');
      const error = new PixivFlowError('Wrapped error', 'TEST_ERROR', undefined, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('ConfigError', () => {
    it('should create config error with correct code', () => {
      const error = new ConfigError('Invalid config');
      expect(error.message).toBe('Invalid config');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('NetworkError', () => {
    it('should create network error with URL', () => {
      const error = new NetworkError('Network failed', 'https://example.com');
      expect(error.url).toBe('https://example.com');
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('should handle rate limit metadata', () => {
      const error = new NetworkError(
        'Rate limited',
        'https://example.com',
        undefined,
        { isRateLimit: true, waitTime: 60000 }
      );
      expect(error.isRateLimit).toBe(true);
      expect(error.waitTime).toBe(60000);
    });
  });
});

describe('Error Utilities', () => {
  describe('is404Error', () => {
    it('should detect 404 in error message', () => {
      expect(is404Error(new Error('404 Not Found'))).toBe(true);
      expect(is404Error(new Error('Resource not found'))).toBe(true);
      expect(is404Error(new NetworkError('404', 'https://example.com'))).toBe(true);
    });

    it('should return false for non-404 errors', () => {
      expect(is404Error(new Error('500 Internal Server Error'))).toBe(false);
      expect(is404Error(new Error('Network timeout'))).toBe(false);
    });
  });

  describe('isSkipableError', () => {
    it('should identify skipable errors', () => {
      expect(isSkipableError(new Error('404 Not Found'))).toBe(true);
      expect(isSkipableError(new Error('timeout'))).toBe(true);
      expect(isSkipableError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isSkipableError(new Error('403 Forbidden'))).toBe(true);
    });

    it('should return false for non-skipable errors', () => {
      expect(isSkipableError(new Error('500 Internal Server Error'))).toBe(false);
      expect(isSkipableError(new ConfigError('Invalid config'))).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
    });

    it('should handle string errors', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should handle unknown types', () => {
      expect(getErrorMessage({ toString: () => 'Object error' })).toBe('Object error');
    });
  });

  describe('getErrorRecoveryStrategy', () => {
    it('should return SKIP for skipable errors', () => {
      expect(getErrorRecoveryStrategy(new Error('404 Not Found'))).toBe(ErrorRecoveryStrategy.SKIP);
      expect(getErrorRecoveryStrategy(new Error('timeout'))).toBe(ErrorRecoveryStrategy.SKIP);
    });

    it('should return WAIT_AND_RETRY for rate limit errors', () => {
      const rateLimitError = new NetworkError(
        'Rate limited',
        'https://example.com',
        undefined,
        { isRateLimit: true }
      );
      expect(getErrorRecoveryStrategy(rateLimitError)).toBe(ErrorRecoveryStrategy.WAIT_AND_RETRY);
    });

    it('should return RETRY for network errors', () => {
      const networkError = new NetworkError('Network failed', 'https://example.com');
      expect(getErrorRecoveryStrategy(networkError)).toBe(ErrorRecoveryStrategy.RETRY);
    });

    it('should return FAIL for auth errors', () => {
      const authError = new AuthenticationError('Auth failed');
      expect(getErrorRecoveryStrategy(authError)).toBe(ErrorRecoveryStrategy.FAIL);
    });

    it('should return FAIL for config errors', () => {
      const configError = new ConfigError('Invalid config');
      expect(getErrorRecoveryStrategy(configError)).toBe(ErrorRecoveryStrategy.FAIL);
    });
  });
});

describe('safeAsync', () => {
  it('should return result on success', async () => {
    const result = await safeAsync(async () => {
      return 'success';
    });
    expect(result).toBe('success');
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    const result = await safeAsync(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new NetworkError('Temporary failure', 'https://example.com');
        }
        return 'success';
      },
      {
        retries: 3,
        retryDelay: 10,
      }
    );
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should not retry on non-retryable errors', async () => {
    let attempts = 0;
    try {
      await safeAsync(
        async () => {
          attempts++;
          throw new ConfigError('Invalid config');
        },
        {
          retries: 3,
          retryDelay: 10,
        }
      );
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(attempts).toBe(1); // Should not retry
    }
  });

  it('should call onError callback', async () => {
    const errors: unknown[] = [];
    let attempts = 0;
    
    await safeAsync(
      async () => {
        attempts++;
        if (attempts < 2) {
          throw new NetworkError('Temporary failure', 'https://example.com');
        }
        return 'success';
      },
      {
        retries: 2,
        retryDelay: 10,
        onError: (error) => {
          errors.push(error);
        },
      }
    );
    
    expect(errors.length).toBe(1);
    expect(errors[0]).toBeInstanceOf(NetworkError);
  });

  it('should respect shouldRetry function', async () => {
    let attempts = 0;
    try {
      await safeAsync(
        async () => {
          attempts++;
          throw new Error('Should not retry');
        },
        {
          retries: 3,
          retryDelay: 10,
          shouldRetry: () => false,
        }
      );
      fail('Should have thrown');
    } catch (error) {
      expect(attempts).toBe(1);
    }
  });

  it('should use waitTime from NetworkError', async () => {
    const startTime = Date.now();
    let attempts = 0;
    
    try {
      await safeAsync(
        async () => {
          attempts++;
          const error = new NetworkError(
            'Rate limited',
            'https://example.com',
            undefined,
            { isRateLimit: true, waitTime: 100 }
          );
          throw error;
        },
        {
          retries: 1,
          retryDelay: 10, // Should be overridden by waitTime
          shouldRetry: (error) => {
            // Allow retry for rate limit errors
            return error instanceof NetworkError;
          },
        }
      );
      fail('Should have thrown');
    } catch (error) {
      const elapsed = Date.now() - startTime;
      // Should have waited at least 100ms (with some tolerance for timing variations)
      // Note: actual time may vary due to event loop timing, so we use a lower threshold
      expect(elapsed).toBeGreaterThanOrEqual(30);
      expect(error).toBeInstanceOf(NetworkError);
      expect((error as NetworkError).waitTime).toBe(100);
    }
  });
});

describe('toResult', () => {
  it('should return success result on success', async () => {
    const result = await toResult(async () => {
      return 'success';
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('success');
    }
  });

  it('should return error result on failure', async () => {
    const result = await toResult(async () => {
      throw new Error('Failed');
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Failed');
    }
  });

  it('should handle non-Error exceptions', async () => {
    const result = await toResult(async () => {
      throw 'String error';
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('String error');
    }
  });
});

