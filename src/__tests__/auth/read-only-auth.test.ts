import { PixivAuth } from '../../auth/PixivAuth';
import { AuthenticationError } from '../../utils/errors';

/**
 * Read-only auth exists so a second process can share one refresh token without
 * risking it. Pixiv's rotation behaviour on `grant_type=refresh_token` cannot be
 * proved from the client, and a running daemon never re-reads the token from
 * disk — so the only safe invariant is "we never call the endpoint".
 *
 * These tests pin that invariant: with the flag set, no refresh is attempted and
 * no token is written, whatever the caller does.
 */
function fakeDatabase(cached?: { accessToken: string; expiresAt: number }) {
  const writes: Array<{ key: string; value: unknown }> = [];
  return {
    writes,
    getToken: (key: string) => (key === 'pixiv_access_token' ? cached : undefined),
    setToken: (key: string, value: unknown) => {
      writes.push({ key, value });
    },
  };
}

function makeAuth(cached?: { accessToken: string; expiresAt: number }) {
  const database = fakeDatabase(cached);
  const auth = new PixivAuth(
    {
      clientId: 'cid',
      clientSecret: 'secret',
      deviceToken: 'device',
      refreshToken: 'production-refresh-token',
      userAgent: 'PixivAndroidApp/5.0.234',
    },
    { timeoutMs: 1000, retries: 1 } as never,
    database as never,
    undefined
  );
  return { auth, database };
}

describe('read-only auth', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    delete process.env.PIXIV_AUTH_READONLY;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('refuses to refresh when no access token is cached', async () => {
    process.env.PIXIV_AUTH_READONLY = 'true';
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const { auth, database } = makeAuth();

    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(AuthenticationError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(database.writes).toEqual([]);
  });

  it('refuses the kit provider refresh path too', async () => {
    process.env.PIXIV_AUTH_READONLY = '1';
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const { auth, database } = makeAuth();

    await expect(auth.refreshAccessTokenForClient()).rejects.toBeInstanceOf(AuthenticationError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(database.writes).toEqual([]);
  });

  it('uses a still-valid cached access token without any network call', async () => {
    process.env.PIXIV_AUTH_READONLY = 'true';
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const { auth } = makeAuth({ accessToken: 'cached-access-token', expiresAt: Date.now() + 3_600_000 });

    await expect(auth.getAccessToken()).resolves.toBe('cached-access-token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats an expired cached token as missing rather than refreshing it', async () => {
    process.env.PIXIV_AUTH_READONLY = 'true';
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const { auth } = makeAuth({ accessToken: 'stale', expiresAt: Date.now() - 1 });

    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(AuthenticationError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is off by default, so a normal run still attempts the refresh', async () => {
    delete process.env.PIXIV_AUTH_READONLY;
    const fetchSpy = jest.fn().mockRejectedValue(new Error('network disabled in test'));
    global.fetch = fetchSpy as never;
    const { auth } = makeAuth();

    await expect(auth.getAccessToken()).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it.each(['true', '1', 'yes', 'TRUE', ' yes '])('honours PIXIV_AUTH_READONLY=%p', async (value) => {
    process.env.PIXIV_AUTH_READONLY = value;
    const { auth } = makeAuth();
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it.each(['false', '0', 'no', ''])('is inactive for PIXIV_AUTH_READONLY=%p', async (value) => {
    process.env.PIXIV_AUTH_READONLY = value;
    const fetchSpy = jest.fn().mockRejectedValue(new Error('network disabled in test'));
    global.fetch = fetchSpy as never;
    const { auth } = makeAuth();
    await expect(auth.getAccessToken()).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
