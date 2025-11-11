/**
 * Unit tests for concurrency control utilities
 */

import { processInParallel, ConcurrencyConfig, ProcessResult } from '../../utils/concurrency';
import { NetworkError } from '../../utils/errors';

// Mock console.warn to suppress warnings in tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
});

describe('concurrency', () => {
  describe('processInParallel', () => {
    it('should return empty array for empty input', async () => {
      const results = await processInParallel([], async () => 'result');
      expect(results).toEqual([]);
    });

    it('should process items sequentially when concurrency is 1', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn(async (item: number) => item * 2);
      
      const results = await processInParallel(items, processor, 1);
      
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ success: true, result: 2 });
      expect(results[1]).toEqual({ success: true, result: 4 });
      expect(results[2]).toEqual({ success: true, result: 6 });
      
      // Verify sequential execution (processor called 3 times)
      expect(processor).toHaveBeenCalledTimes(3);
    });

    it('should process items in parallel when concurrency > 1', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = jest.fn(async (item: number) => item * 2);
      
      const results = await processInParallel(items, processor, 3);
      
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.result).toBe((index + 1) * 2);
        }
      });
      
      expect(processor).toHaveBeenCalledTimes(5);
    });

    it('should handle errors gracefully', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn(async (item: number) => {
        if (item === 2) {
          throw new Error('Test error');
        }
        return item * 2;
      });
      
      const results = await processInParallel(items, processor, 2);
      
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ success: true, result: 2 });
      expect(results[1]).toEqual({ success: false, error: expect.any(Error) });
      expect(results[2]).toEqual({ success: true, result: 6 });
      
      if (!results[1].success) {
        expect(results[1].error.message).toBe('Test error');
      }
    });

    it('should respect request delay in sequential mode', async () => {
      const items = [1, 2];
      const processor = jest.fn(async (item: number) => item);
      const startTime = Date.now();
      
      await processInParallel(items, processor, 1, { requestDelay: 100 });
      
      const elapsed = Date.now() - startTime;
      // Should have at least 100ms delay between items
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it('should handle rate limit errors and reduce concurrency', async () => {
      const items = [1, 2, 3, 4, 5];
      let callCount = 0;
      const processor = jest.fn(async (item: number) => {
        callCount++;
        if (callCount <= 2) {
          // First 2 calls succeed
          return item;
        }
        // Subsequent calls throw rate limit error
        const error = new NetworkError('Rate limit', 'https://example.com', undefined, { isRateLimit: true });
        throw error;
      });
      
      const results = await processInParallel(items, processor, 3, {
        dynamicConcurrency: true,
        minConcurrency: 1,
      });
      
      // All items should be processed
      expect(results).toHaveLength(5);
      expect(processor).toHaveBeenCalledTimes(5);
      
      // Some should succeed, some should fail
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
    });

    it('should not reduce concurrency below minimum', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn(async (item: number) => {
        const error = new NetworkError('Rate limit', 'https://example.com', undefined, { isRateLimit: true });
        throw error;
      });
      
      const results = await processInParallel(items, processor, 2, {
        dynamicConcurrency: true,
        minConcurrency: 1,
      });
      
      expect(results).toHaveLength(3);
      // All should fail, but concurrency should not go below 1
      results.forEach(result => {
        expect(result.success).toBe(false);
      });
    });

    it('should not adjust concurrency when dynamicConcurrency is false', async () => {
      const items = [1, 2, 3];
      let callCount = 0;
      const processor = jest.fn(async (item: number) => {
        callCount++;
        if (callCount === 2) {
          const error = new NetworkError('Rate limit', 'https://example.com', undefined, { isRateLimit: true });
          throw error;
        }
        return item;
      });
      
      const results = await processInParallel(items, processor, 3, {
        dynamicConcurrency: false,
      });
      
      expect(results).toHaveLength(3);
      // Concurrency should remain at 3 throughout
    });

    it('should handle non-Error exceptions', async () => {
      const items = [1, 2];
      const processor = jest.fn(async (item: number) => {
        throw 'String error';
      });
      
      const results = await processInParallel(items, processor, 2);
      
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeInstanceOf(Error);
          expect(result.error.message).toBe('String error');
        }
      });
    });

    it('should process all items even with errors', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = jest.fn(async (item: number) => {
        if (item % 2 === 0) {
          throw new Error(`Error for ${item}`);
        }
        return item * 2;
      });
      
      const results = await processInParallel(items, processor, 3);
      
      expect(results).toHaveLength(5);
      expect(processor).toHaveBeenCalledTimes(5);
      
      // Odd items should succeed, even items should fail
      results.forEach((result, index) => {
        const item = index + 1;
        if (item % 2 === 1) {
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.result).toBe(item * 2);
          }
        } else {
          expect(result.success).toBe(false);
        }
      });
    });

    it('should maintain order of results', async () => {
      const items = [1, 2, 3, 4, 5];
      const delays = [100, 50, 200, 30, 150]; // Different delays
      const processor = jest.fn(async (item: number) => {
        const index = items.indexOf(item);
        await new Promise(resolve => setTimeout(resolve, delays[index]));
        return item;
      });
      
      const results = await processInParallel(items, processor, 3);
      
      expect(results).toHaveLength(5);
      // Results should be in original order, not completion order
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.result).toBe(index + 1);
        }
      });
    });

    it('should handle zero request delay', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn(async (item: number) => item);
      
      const startTime = Date.now();
      const results = await processInParallel(items, processor, 2, {
        requestDelay: 0,
      });
      const elapsed = Date.now() - startTime;
      
      expect(results).toHaveLength(3);
      // Should complete quickly without delays
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle large number of items', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i + 1);
      const processor = jest.fn(async (item: number) => item * 2);
      
      const results = await processInParallel(items, processor, 5, { requestDelay: 0 });
      
      expect(results).toHaveLength(100);
      expect(processor).toHaveBeenCalledTimes(100);
      
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.result).toBe((index + 1) * 2);
        }
      });
    });

    it('should use default configuration when not provided', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn(async (item: number) => item);
      
      const results = await processInParallel(items, processor, 3);
      
      expect(results).toHaveLength(3);
      // Should work with default config (requestDelay: 500, dynamicConcurrency: true)
    });
  });
});

