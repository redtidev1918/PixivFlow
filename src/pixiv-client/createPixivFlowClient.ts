import type { KitLogger } from '@redtidev/pixiv-client';

import type { StandaloneConfig } from '../config';
import type { Database } from '../storage/Database';
import type { PixivAuth } from '../auth/PixivAuth';
import { logger } from '../logger';
import { PixivAuthTokenProvider } from './PixivAuthTokenProvider';
import { PixivFlowPixivClient } from './PixivFlowPixivClient';

/** Map PixivFlow's pino-like logger onto the kit's minimal logger port. */
const kitLogger: KitLogger = {
  debug: (message, meta) => logger.debug(message, meta),
  info: (message, meta) => logger.info(message, meta),
  warn: (message, meta) => logger.warn(message, meta),
  error: (message, meta) => logger.error(message, meta),
};

/**
 * Single construction path for product code: PixivFlow auth/DB/config ->
 * independent kit via the compatibility adapter, with SQLite-backed 429 gate
 * state so restarts remember an active Pixiv cooldown.
 */
export function createPixivFlowClient(
  auth: PixivAuth,
  config: StandaloneConfig,
  database: Database
): PixivFlowPixivClient {
  return new PixivFlowPixivClient({
    auth: new PixivAuthTokenProvider(auth),
    config,
    logger: kitLogger,
    rateLimitStateStore: database.rateLimitState,
    // One row per account (identified by the refresh token identity).
    rateLimitScope: `pixiv:${config.pixiv.refreshToken.slice(0, 16)}`,
  });
}
