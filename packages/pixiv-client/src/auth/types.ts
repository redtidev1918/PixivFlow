/**
 * Authentication ports. The kit only CONSUMES access tokens; it never knows
 * how the host obtained them (OAuth PKCE browser login, puppeteer, a python
 * helper, a refresh-token flow, a static test token, ...).
 */

/** Minimal port: return a currently-valid Bearer access token. */
export interface AccessTokenProvider {
  getAccessToken(signal?: AbortSignal): Promise<string>;
}

/**
 * Optional capability: when a request comes back 401 the transport asks the
 * provider to refresh once and then retries the original request. Providers
 * that cannot refresh simply implement {@link AccessTokenProvider}.
 */
export interface RefreshableAccessTokenProvider extends AccessTokenProvider {
  refreshAccessToken(signal?: AbortSignal): Promise<string>;
}

export function isRefreshable(
  provider: AccessTokenProvider
): provider is RefreshableAccessTokenProvider {
  return typeof (provider as Partial<RefreshableAccessTokenProvider>).refreshAccessToken === 'function';
}

/** Token provider for tests / simple embeddings: always returns one token. */
export class StaticTokenProvider implements AccessTokenProvider {
  constructor(private readonly token: string) {}
  async getAccessToken(): Promise<string> {
    return this.token;
  }
}
