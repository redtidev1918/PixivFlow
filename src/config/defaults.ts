/**
 * Default configuration values
 */

import { StandaloneConfig } from './types';

export const DEFAULT_CONFIG = {
  logLevel: 'info' as const,
  network: {
    timeoutMs: 30000,
    retries: 3,
    retryDelay: 1000,
  },
  storage: {
    databasePath: './data/pixiv-downloader.db',
    downloadDirectory: './downloads',
  },
  scheduler: {
    enabled: false,
    cron: '0 3 * * *',
    timezone: 'Asia/Shanghai',
  },
  download: {
    concurrency: 3,
    requestDelay: 500,
    dynamicConcurrency: true,
    minConcurrency: 1,
    maxRetries: 3,
    retryDelay: 2000,
    timeout: 60000,
  },
  initialDelay: 0,
} as const;

/**
 * Generate a default configuration template
 */
export function generateDefaultConfig(): StandaloneConfig {
  return {
    logLevel: DEFAULT_CONFIG.logLevel,
    pixiv: {
      clientId: 'MOBrBDS8blbauoSck0ZfDbtuzpyT',
      clientSecret: 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj',
      deviceToken: 'pixiv',
      refreshToken: 'YOUR_REFRESH_TOKEN',
      userAgent: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
    },
    network: DEFAULT_CONFIG.network,
    storage: DEFAULT_CONFIG.storage,
    scheduler: DEFAULT_CONFIG.scheduler,
    download: DEFAULT_CONFIG.download,
    targets: [
      {
        type: 'illustration',
        tag: 'イラスト',
        limit: 10,
        searchTarget: 'partial_match_for_tags',
      },
    ],
    initialDelay: DEFAULT_CONFIG.initialDelay,
  };
}





















































