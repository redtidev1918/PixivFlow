import { logger } from '../logger';
import { NetworkError } from './errors';

/**
 * Configuration for parallel processing
 */
export interface ConcurrencyConfig {
  /** Delay between requests in milliseconds */
  requestDelay?: number;
  /** Enable dynamic concurrency adjustment */
  dynamicConcurrency?: boolean;
  /** Minimum concurrency level */
  minConcurrency?: number;
}

/**
 * Result of processing an item
 */
export type ProcessResult<T> = 
  | { success: true; result: T }
  | { success: false; error: Error };

/**
 * Process items in parallel with intelligent concurrency control
 * 
 * Features:
 * - Queue-based processing (maintains stable concurrency)
 * - Request delay between API calls (rate limiting protection)
 * - Dynamic concurrency adjustment (reduces on rate limit errors)
 * 
 * @param items - Items to process
 * @param processor - Function to process each item
 * @param concurrency - Maximum number of concurrent operations
 * @param config - Concurrency configuration options
 * @returns Array of results (success or error for each item)
 * 
 * @example
 * ```typescript
 * const results = await processInParallel(
 *   items,
 *   async (item) => await processItem(item),
 *   3,
 *   { requestDelay: 500, dynamicConcurrency: true }
 * );
 * ```
 */
export async function processInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 3,
  config: ConcurrencyConfig = {}
): Promise<ProcessResult<R>[]> {
  const results: ProcessResult<R>[] = [];
  
  if (items.length === 0) {
    return results;
  }
  
  // Get configuration
  const requestDelay = config.requestDelay ?? 500;
  const dynamicConcurrency = config.dynamicConcurrency ?? true;
  const minConcurrency = config.minConcurrency ?? 1;
  
  // If concurrency is 1, process sequentially with delay
  if (concurrency === 1) {
    for (const item of items) {
      try {
        const result = await processor(item);
        results.push({ success: true, result });
        // Add delay between requests to avoid rate limiting
        if (requestDelay > 0 && items.indexOf(item) < items.length - 1) {
          await new Promise(resolve => setTimeout(resolve, requestDelay));
        }
      } catch (error) {
        results.push({ 
          success: false, 
          error: error instanceof Error ? error : new Error(String(error)) 
        });
      }
    }
    return results;
  }
  
  // Queue-based processing with dynamic concurrency
  let currentConcurrency = concurrency;
  let rateLimitCount = 0;
  const queue = [...items];
  const inProgress = new Set<Promise<void>>();
  let lastRequestTime = 0;
  
  // Initialize results array
  results.length = items.length;
  
  const processItem = async (item: T, index: number): Promise<void> => {
    try {
      // Rate limiting: ensure minimum delay between requests
      if (requestDelay > 0) {
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < requestDelay) {
          await new Promise(resolve => setTimeout(resolve, requestDelay - timeSinceLastRequest));
        }
        lastRequestTime = Date.now();
      }
      
      const result = await processor(item);
      results[index] = { success: true, result };
      
      // On success, gradually increase concurrency if it was reduced
      if (dynamicConcurrency && currentConcurrency < concurrency && rateLimitCount > 0) {
        rateLimitCount = Math.max(0, rateLimitCount - 1);
        if (rateLimitCount === 0) {
          currentConcurrency = Math.min(concurrency, currentConcurrency + 1);
          logger.debug(`Concurrency increased to ${currentConcurrency} after successful requests`);
        }
      }
    } catch (error) {
      results[index] = { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error)) 
      };
      
      // Check if this is a rate limit error
      const isRateLimit = error instanceof NetworkError && error.isRateLimit === true;
      
      if (isRateLimit && dynamicConcurrency) {
        rateLimitCount++;
        const previousConcurrency = currentConcurrency;
        // Reduce concurrency on rate limit errors (halve it, but not below minimum)
        const newConcurrency = Math.max(minConcurrency, Math.floor(currentConcurrency * 0.5));
        if (newConcurrency < currentConcurrency) {
          currentConcurrency = newConcurrency;
          logger.warn(`Rate limit detected (429). Reducing concurrency from ${previousConcurrency} to ${currentConcurrency}`, {
            previousConcurrency,
            newConcurrency: currentConcurrency,
            minConcurrency,
            rateLimitCount,
            originalConcurrency: concurrency
          });
        } else {
          logger.warn(`Rate limit detected (429), but concurrency already at minimum (${minConcurrency})`, {
            currentConcurrency,
            minConcurrency,
            rateLimitCount,
            originalConcurrency: concurrency
          });
        }
      }
    }
  };
  
  // Process queue with dynamic concurrency
  let itemIndex = 0;
  while (itemIndex < queue.length || inProgress.size > 0) {
    // Start new tasks up to current concurrency limit
    while (inProgress.size < currentConcurrency && itemIndex < queue.length) {
      const item = queue[itemIndex];
      const index = itemIndex;
      itemIndex++;
      
      const task = processItem(item, index).finally(() => {
        inProgress.delete(task);
      });
      
      inProgress.add(task);
    }
    
    // Wait for at least one task to complete
    if (inProgress.size > 0) {
      await Promise.race(Array.from(inProgress));
    }
  }
  
  return results;
}

