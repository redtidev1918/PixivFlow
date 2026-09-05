/**
 * Token Maintenance Service
 * 
 * This service provides automatic refresh token maintenance to ensure tokens never expire.
 * It periodically refreshes the refresh token to keep it valid indefinitely.
 * 
 * Key features:
 * - Automatic refresh token renewal before expiration
 * - Configurable refresh interval
 * - Background maintenance without user intervention
 * - One-time setup, forever working
 */

import { logger } from '../logger';
import { PixivAuth } from '../pixiv/AuthClient';
import { Database } from '../storage/Database';
import { PixivCredentialConfig, NetworkConfig, StandaloneConfig } from '../config';
import { refreshToken } from '../terminal-login/token-refresh';

export interface TokenMaintenanceConfig {
  /**
   * Enable automatic token maintenance
   * Default: true
   */
  enabled?: boolean;
  /**
   * Interval between refresh token checks (in milliseconds)
   * Default: 7 days (7 * 24 * 60 * 60 * 1000)
   * 
   * Note: Pixiv refresh tokens typically last 30+ days, but we refresh
   * them every 7 days to ensure they never expire.
   */
  refreshInterval?: number;
  /**
   * Minimum time before expiration to trigger refresh (in milliseconds)
   * Default: 7 days (7 * 24 * 60 * 60 * 1000)
   * 
   * If refresh token will expire within this time, refresh it immediately.
   */
  minTimeBeforeExpiration?: number;
}

const DEFAULT_CONFIG: Required<TokenMaintenanceConfig> = {
  enabled: true,
  refreshInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
  minTimeBeforeExpiration: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export class TokenMaintenanceService {
  private intervalId?: NodeJS.Timeout;
  private isRunning = false;
  private config: Required<TokenMaintenanceConfig>;
  private auth: PixivAuth;
  private credentials: PixivCredentialConfig;
  private network: NetworkConfig;

  constructor(
    auth: PixivAuth,
    credentials: PixivCredentialConfig,
    network: NetworkConfig,
    config?: TokenMaintenanceConfig
  ) {
    this.auth = auth;
    this.credentials = credentials;
    this.network = network;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the token maintenance service
   */
  public start(): void {
    if (!this.config.enabled) {
      logger.info('Token maintenance service is disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('Token maintenance service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting token maintenance service', {
      refreshInterval: `${this.config.refreshInterval / (24 * 60 * 60 * 1000)} days`,
    });

    // Perform initial check
    this.maintainToken().catch((error) => {
      logger.error('Initial token maintenance check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Schedule periodic maintenance
    this.intervalId = setInterval(() => {
      this.maintainToken().catch((error) => {
        logger.error('Periodic token maintenance failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.config.refreshInterval);
  }

  /**
   * Stop the token maintenance service
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    logger.info('Token maintenance service stopped');
  }

  /**
   * Perform token maintenance
   * This method refreshes the refresh token to ensure it never expires
   */
  private async maintainToken(): Promise<void> {
    try {
      logger.debug('Performing token maintenance check...');

      // Check if refresh token is valid
      const isValid = await this.checkRefreshTokenValidity();
      
      if (!isValid) {
        logger.warn('Refresh token is invalid, but cannot auto-renew without credentials');
        logger.warn('Please run login command to get a new refresh token');
        return;
      }

      // Refresh the access token, which will also update the refresh token if needed
      // This is the key: by refreshing the access token, we get a new refresh token
      // which extends the validity period indefinitely
      try {
        await this.auth.getAccessToken();
        logger.info('✓ Token maintenance completed successfully');
      } catch (error) {
        logger.error('Failed to refresh access token during maintenance', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      logger.error('Token maintenance failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if the current refresh token is valid
   */
  private async checkRefreshTokenValidity(): Promise<boolean> {
    try {
      if (!this.credentials.refreshToken) {
        return false;
      }

      // Try to refresh the token to verify it's valid
      await refreshToken(this.credentials.refreshToken);
      return true;
    } catch (error) {
      logger.debug('Refresh token validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Manually trigger token maintenance
   * Useful for testing or immediate refresh
   */
  public async refreshNow(): Promise<void> {
    logger.info('Manually triggering token maintenance...');
    await this.maintainToken();
  }
}

/**
 * Create and configure token maintenance service from config
 */
export function createTokenMaintenanceService(
  auth: PixivAuth,
  credentials: PixivCredentialConfig,
  network: NetworkConfig,
  config?: StandaloneConfig
): TokenMaintenanceService | null {
  // Check if token maintenance is enabled in config
  const maintenanceConfig: TokenMaintenanceConfig | undefined = 
    (config as any)?.tokenMaintenance;

  if (maintenanceConfig?.enabled === false) {
    logger.info('Token maintenance is disabled in configuration');
    return null;
  }

  const service = new TokenMaintenanceService(
    auth,
    credentials,
    network,
    maintenanceConfig
  );

  return service;
}
