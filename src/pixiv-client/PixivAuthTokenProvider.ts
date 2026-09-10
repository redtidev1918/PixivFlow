import type { AccessTokenProvider, RefreshableAccessTokenProvider } from '@redtidev/pixiv-client';
import type { PixivAuth } from '../auth/PixivAuth';

/**
 * Adapter that exposes PixivFlow's OAuth/refresh-token machinery to the kit
 * through its tiny AccessTokenProvider port. The kit never learns about
 * config files, SQLite, puppeteer or the python login helper.
 */
export class PixivAuthTokenProvider implements RefreshableAccessTokenProvider {
  constructor(private readonly auth: PixivAuth) {}

  getAccessToken(): Promise<string> {
    return this.auth.getAccessToken();
  }

  refreshAccessToken(): Promise<string> {
    return this.auth.refreshAccessTokenForClient();
  }
}

/** Type guard helper for wiring sites. */
export function asTokenProvider(auth: PixivAuth): AccessTokenProvider {
  return new PixivAuthTokenProvider(auth);
}
