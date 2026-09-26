/**
 * Host login API (PixivFlow Desktop in-app login window)
 *
 * Covers the two endpoints the desktop host drives, plus the PKCE session
 * bookkeeping behind them: single-use, TTL-bounded, and never exposed.
 */

import {
  createHostLoginSession,
  consumeHostLoginSession,
  extractAuthCode,
  hostLoginSessionCount,
  resetHostLoginSessions,
  HOST_LOGIN_SESSION_TTL_MS,
} from '../../webui/routes/handlers/auth/host-login-session';
import {
  hostLoginStart,
  hostLoginComplete,
} from '../../webui/routes/handlers/auth/auth-host-login-handler';

jest.mock('../../config', () => ({
  getConfigPath: () => '/tmp/pixivflow-host-login.config.json',
}));

jest.mock('../../utils/login-helper', () => ({
  updateConfigWithToken: jest.fn(async () => undefined),
}));

jest.mock('../../puppeteer-login-adapter/token-exchange', () => ({
  exchangeCodeForToken: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { updateConfigWithToken } = require('../../utils/login-helper');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exchangeCodeForToken } = require('../../puppeteer-login-adapter/token-exchange');

const CALLBACK_URL = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback';

/** Minimal Express response double, mirroring the other WebUI handler tests. */
function fakeRes() {
  const res: any = {
    statusCode: 200,
    payload: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(value: any) {
      res.payload = value;
      return res;
    },
  };
  return res;
}

const LOGIN_INFO = {
  access_token: 'access-abc',
  refresh_token: 'refresh-abc',
  expires_in: 3600,
  token_type: 'bearer',
  scope: '',
  user: { id: '1', name: 'tester' },
};

beforeEach(() => {
  resetHostLoginSessions();
  updateConfigWithToken.mockClear();
  exchangeCodeForToken.mockReset();
  exchangeCodeForToken.mockResolvedValue(LOGIN_INFO);
});

describe('host login sessions', () => {
  it('mints an authorize URL carrying the PKCE challenge and never the verifier', async () => {
    const start = await createHostLoginSession();

    expect(start.loginId).toHaveLength(36);
    expect(start.redirectUri).toBe(CALLBACK_URL);

    const url = new URL(start.authUrl);
    expect(`${url.origin}${url.pathname}`).toBe('https://app-api.pixiv.net/web/v1/login');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('client')).toBe('pixiv-android');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();

    // The verifier stays in the backend: neither field may carry it.
    const serialized = JSON.stringify(start);
    expect(serialized).not.toMatch(/code_verifier/);
    expect(serialized).not.toContain('lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj');
  });

  it('consumes a session exactly once', async () => {
    const start = await createHostLoginSession();
    const first = consumeHostLoginSession(start.loginId);

    expect(typeof first).toBe('string');
    expect(first).toHaveLength(128); // generateCodeVerifier() length
    expect(consumeHostLoginSession(start.loginId)).toBeNull();
    expect(consumeHostLoginSession('not-a-session')).toBeNull();
    expect(consumeHostLoginSession(undefined)).toBeNull();
  });

  it('rejects an expired session and stays bounded', async () => {
    const now = 1_700_000_000_000;
    const start = await createHostLoginSession(now);
    const later = now + HOST_LOGIN_SESSION_TTL_MS + 1;
    expect(consumeHostLoginSession(start.loginId, later)).toBeNull();

    for (let i = 0; i < 40; i++) {
      // eslint-disable-next-line no-await-in-loop
      await createHostLoginSession(now);
    }
    expect(hostLoginSessionCount()).toBeLessThanOrEqual(32);
  });

  it('reads the authorization code from a bare code or a callback URL', () => {
    expect(extractAuthCode('AbC-123_x')).toBe('AbC-123_x');
    expect(extractAuthCode(`  ${CALLBACK_URL}?code=xyz789&state=1  `)).toBe('xyz789');
    expect(extractAuthCode(`${CALLBACK_URL}?state=1`)).toBeNull();
    expect(extractAuthCode('<html>blocked</html>')).toBeNull();
    expect(extractAuthCode('')).toBeNull();
    expect(extractAuthCode(undefined)).toBeNull();
    expect(extractAuthCode(42)).toBeNull();
  });
});

describe('POST /api/auth/login/host/start', () => {
  it('returns the authorize URL for the caller-owned window', async () => {
    const res = fakeRes();
    await hostLoginStart({} as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.success).toBe(true);
    expect(res.payload.data.loginId).toBeTruthy();
    expect(res.payload.data.authUrl).toContain('code_challenge=');
    expect(res.payload.data.redirectUri).toBe(CALLBACK_URL);
  });
});

describe('POST /api/auth/login/host/complete', () => {
  it('exchanges the captured callback URL for tokens and persists the refresh token', async () => {
    const startRes = fakeRes();
    await hostLoginStart({} as any, startRes);
    const { loginId } = startRes.payload.data;

    const res = fakeRes();
    await hostLoginComplete(
      { body: { loginId, callbackUrl: `${CALLBACK_URL}?code=CODE-1` } } as any,
      res
    );

    expect(exchangeCodeForToken).toHaveBeenCalledTimes(1);
    const [code, verifier] = exchangeCodeForToken.mock.calls[0];
    expect(code).toBe('CODE-1');
    expect(verifier).toHaveLength(128);
    expect(updateConfigWithToken).toHaveBeenCalledWith(
      '/tmp/pixivflow-host-login.config.json',
      'refresh-abc'
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      success: true,
      errorCode: 'AUTH_LOGIN_SUCCESS',
      data: { accessToken: 'access-abc', refreshToken: 'refresh-abc', expiresIn: 3600 },
    });
    expect(JSON.stringify(res.payload)).not.toMatch(/code_verifier/);
  });

  it('accepts a bare code', async () => {
    const startRes = fakeRes();
    await hostLoginStart({} as any, startRes);
    const res = fakeRes();

    await hostLoginComplete(
      { body: { loginId: startRes.payload.data.loginId, code: 'CODE-2' } } as any,
      res
    );

    expect(exchangeCodeForToken.mock.calls[0][0]).toBe('CODE-2');
    expect(res.statusCode).toBe(200);
  });

  it('refuses a replayed or unknown session', async () => {
    const startRes = fakeRes();
    await hostLoginStart({} as any, startRes);
    const { loginId } = startRes.payload.data;

    const first = fakeRes();
    await hostLoginComplete({ body: { loginId, code: 'CODE-3' } } as any, first);
    expect(first.statusCode).toBe(200);

    const replay = fakeRes();
    await hostLoginComplete({ body: { loginId, code: 'CODE-3' } } as any, replay);
    expect(replay.statusCode).toBe(400);
    expect(replay.payload.errorCode).toBe('AUTH_HOST_LOGIN_SESSION_INVALID');

    const unknown = fakeRes();
    await hostLoginComplete({ body: { loginId: 'nope', code: 'CODE-3' } } as any, unknown);
    expect(unknown.statusCode).toBe(400);
    expect(unknown.payload.errorCode).toBe('AUTH_HOST_LOGIN_SESSION_INVALID');

    // Only the successful call may have reached the token endpoint.
    expect(exchangeCodeForToken).toHaveBeenCalledTimes(1);
  });

  it('requires a code without burning the pending session', async () => {
    const startRes = fakeRes();
    await hostLoginStart({} as any, startRes);
    const { loginId } = startRes.payload.data;

    const missing = fakeRes();
    await hostLoginComplete({ body: { loginId } } as any, missing);
    expect(missing.statusCode).toBe(400);
    expect(missing.payload.errorCode).toBe('AUTH_CODE_REQUIRED');
    expect(exchangeCodeForToken).not.toHaveBeenCalled();

    // The user can paste again: the session survived the malformed attempt.
    const retry = fakeRes();
    await hostLoginComplete({ body: { loginId, code: 'CODE-4' } } as any, retry);
    expect(retry.statusCode).toBe(200);
  });

  it('reports a failed token exchange as 401 without saving anything', async () => {
    exchangeCodeForToken.mockRejectedValueOnce(new Error('invalid_grant'));
    const startRes = fakeRes();
    await hostLoginStart({} as any, startRes);

    const res = fakeRes();
    await hostLoginComplete(
      { body: { loginId: startRes.payload.data.loginId, code: 'CODE-5' } } as any,
      res
    );

    expect(res.statusCode).toBe(401);
    expect(res.payload.errorCode).toBe('AUTH_LOGIN_FAILED');
    expect(updateConfigWithToken).not.toHaveBeenCalled();
  });
});
