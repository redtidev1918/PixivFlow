import { TokenMaintenanceService } from '../../utils/token-maintenance';
import type { PixivAuth } from '../../auth/PixivAuth';

/**
 * The boot-time maintenance probe used to call the token endpoint through a
 * separate helper (`terminal-login/token-refresh`) and DISCARDS the returned
 * token. If Pixiv rotates on refresh, that call invalidated the credential
 * everything else was using and threw the replacement away — a production outage
 * that needs a re-login, triggered by a routine boot.
 *
 * `getAccessToken()` already answers the same question ("is this token usable?")
 * and persists a rotation to all four storage locations, so the probe is gone.
 * These tests keep it gone: maintenance must reach the token endpoint through
 * PixivAuth or not at all.
 */
function stubAuth() {
  const calls = { getAccessToken: 0, refreshAccessTokenForClient: 0 };
  const auth = {
    getAccessToken: async () => {
      calls.getAccessToken += 1;
      return 'access-token';
    },
    refreshAccessTokenForClient: async () => {
      calls.refreshAccessTokenForClient += 1;
      return 'access-token';
    },
  } as unknown as PixivAuth;
  return { auth, calls };
}

const credentials = {
  clientId: 'cid',
  clientSecret: 'secret',
  deviceToken: 'device',
  refreshToken: 'refresh',
  userAgent: 'PixivAndroidApp/5.0.234',
};

describe('token maintenance reaches the endpoint only through PixivAuth', () => {
  const original = process.env.PIXIV_AUTH_READONLY;
  afterEach(() => {
    if (original === undefined) delete process.env.PIXIV_AUTH_READONLY;
    else process.env.PIXIV_AUTH_READONLY = original;
  });

  it('refreshes through getAccessToken, which persists a rotation', async () => {
    delete process.env.PIXIV_AUTH_READONLY;
    const { auth, calls } = stubAuth();
    const service = new TokenMaintenanceService(auth, credentials, { timeoutMs: 1000 } as never);

    await service.refreshNow();

    expect(calls.getAccessToken).toBe(1);
    expect(calls.refreshAccessTokenForClient).toBe(0);
  });

  it('does not touch the endpoint at all in read-only mode', async () => {
    process.env.PIXIV_AUTH_READONLY = 'true';
    const { auth, calls } = stubAuth();
    const service = new TokenMaintenanceService(auth, credentials, { timeoutMs: 1000 } as never);

    await service.refreshNow();

    expect(calls.getAccessToken).toBe(0);
    expect(calls.refreshAccessTokenForClient).toBe(0);
  });
});
