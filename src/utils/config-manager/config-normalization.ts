/**
 * Configuration normalization
 * Handles normalizing configuration for display and validation
 */

import { StandaloneConfig } from '../../config';

/**
 * Validate and normalize configuration for frontend display
 * This ensures the config is always in a valid format for the frontend
 */
export function normalizeConfigForDisplay(config: Partial<StandaloneConfig>): Partial<StandaloneConfig> {
  // Ensure targets is always an array
  const normalized: Partial<StandaloneConfig> = {
    ...config,
    targets: Array.isArray(config.targets) ? config.targets : [],
  };

  // Ensure all sections exist (even if empty) for consistent frontend display
  if (!normalized.pixiv) {
    normalized.pixiv = {
      clientId: '',
      clientSecret: '',
      deviceToken: 'pixiv',
      refreshToken: '',
      userAgent: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
    };
  }

  if (!normalized.storage) {
    normalized.storage = {
      downloadDirectory: './downloads',
      databasePath: './data/pixiv-downloader.db',
    };
  }

  if (!normalized.network) {
    normalized.network = {
      timeoutMs: 30000,
      retries: 3,
      retryDelay: 1000,
    };
  }

  if (!normalized.download) {
    normalized.download = {
      concurrency: 3,
      requestDelay: 500,
      dynamicConcurrency: true,
      minConcurrency: 1,
      maxRetries: 3,
      retryDelay: 2000,
      timeout: 60000,
    };
  }

  return normalized;
}





























