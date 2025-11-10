import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { NetworkConfig, PixivCredentialConfig } from '../config';
import { logger } from '../logger';
import { AccessTokenStore, Database } from '../storage/Database';
import { updateConfigWithToken } from '../utils/login-helper';
import { saveTokenToStorage } from '../utils/token-manager';

interface RefreshTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token: string;
  user: {
    id: string;
    name: string;
  };
}

const TOKEN_CACHE_KEY = 'pixiv_access_token';
const REFRESH_TOKEN_CACHE_KEY = 'pixiv_refresh_token';

export class PixivAuth {
  private configPath?: string;

  constructor(
    private readonly credentials: PixivCredentialConfig,
    private readonly network: NetworkConfig,
    private readonly database: Database,
    configPath?: string
  ) {
    this.configPath = configPath;
  }

  public async getAccessToken(): Promise<string> {
    const cached = this.database.getToken(TOKEN_CACHE_KEY);
    if (cached && cached.accessToken && cached.expiresAt > Date.now() + 60_000) {
      return cached.accessToken;
    }

    const refreshed = await this.refreshAccessToken();
    return refreshed.accessToken;
  }

  private async refreshAccessToken(): Promise<AccessTokenStore> {
    const url = 'https://oauth.secure.pixiv.net/auth/token';

    let lastError: unknown;
    for (let attempt = 0; attempt < (this.network.retries ?? 3); attempt++) {
      try {
        const body = new URLSearchParams({
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: this.credentials.refreshToken,
          include_policy: 'true',
        });

        const clientTime = new Date().toISOString();
        const headers = {
          'User-Agent': this.credentials.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Client-Time': clientTime,
          'X-Client-Hash': this.generateClientHash(clientTime),
        } as Record<string, string>;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.network.timeoutMs);
        try {
          const response = await fetch(url, {
            method: 'POST',
            body,
            headers,
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`Failed to refresh token: ${response.status} ${response.statusText}`);
          }

          const data = (await response.json()) as RefreshTokenResponse;
          const expiresAt = Date.now() + data.expires_in * 1000;

          const stored: AccessTokenStore = {
            accessToken: data.access_token,
            expiresAt,
            refreshToken: data.refresh_token,
            tokenType: data.token_type,
          };

          this.database.setToken(TOKEN_CACHE_KEY, stored);

          // CRITICAL: Auto-update refresh token in both database and config file
          // This ensures the refresh token never expires and is always up-to-date
          if (data.refresh_token && data.refresh_token !== this.credentials.refreshToken) {
            logger.info('Received updated refresh token, updating storage and config file');
            
            // Store in database
            this.database.setToken(REFRESH_TOKEN_CACHE_KEY, {
              accessToken: '',
              expiresAt,
              refreshToken: data.refresh_token,
              tokenType: data.token_type,
            });

            // Auto-update config file to ensure refresh token never expires
            // This is the key to "one-time setup, forever working" solution
            if (this.configPath) {
              try {
                await updateConfigWithToken(this.configPath, data.refresh_token);
                logger.info('✓ Config file automatically updated with new refresh token');
              } catch (error) {
                logger.warn('Failed to update config file with new refresh token', {
                  error: error instanceof Error ? error.message : String(error),
                });
                // Don't throw - database update succeeded, config update is optional
              }
            }
          }

          logger.info('Refreshed Pixiv access token');
          return stored;
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
        logger.warn('Refresh token attempt failed', { attempt: attempt + 1, error: `${error}` });
        await delay(Math.min(1000 * (attempt + 1), 5000));
      }
    }

    throw new Error(`Unable to refresh Pixiv token after ${this.network.retries} attempts: ${lastError}`);
  }

  private generateClientHash(time: string) {
    const salt = '28c1fdd170a5204386cb1313c7077b32';
    return createHash('md5').update(time + salt).digest('hex');
  }
}

