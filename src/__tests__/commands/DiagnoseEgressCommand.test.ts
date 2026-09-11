/**
 * Tests for `pixivflow diagnose egress`.
 *
 * No real network: every probe goes through the injected fetchImpl, and the OAuth
 * probe is exercised in its PIXIV_AUTH_READONLY path (which fails locally without
 * touching the token endpoint).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DiagnoseEgressCommand } from '../../commands/DiagnoseEgressCommand';
import { Database } from '../../storage/Database';

jest.spyOn(console, 'log').mockImplementation(() => undefined);
jest.spyOn(console, 'warn').mockImplementation(() => undefined);
jest.spyOn(console, 'error').mockImplementation(() => undefined);

interface MockResponseInit {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function makeResponse({ status, body, headers = {} }: MockResponseInit): Response {
  const payload = body === undefined ? '' : JSON.stringify(body);
  return {
    status,
    ok: status < 400,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => payload,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function ctx(dbPath: string, withToken = false) {
  return {
    config: {
      pixiv: { refreshToken: withToken ? 'x'.repeat(43) : 'YOUR_REFRESH_TOKEN' },
      network: {},
      storage: { databasePath: dbPath },
    } as any,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    configPath: '',
  };
}

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnose-egress-'));
  return path.join(dir, 'test.db');
}

/**
 * Seed a valid cached access token so the readonly OAuth probe succeeds from cache
 * (PIXIV_AUTH_READONLY never hits the token endpoint) and the App API / media probes
 * can run authenticated.
 */
function seedAccessTokenCache(dbPath: string): void {
  const db = new Database(dbPath);
  db.migrate();
  db.saveToken('pixiv_access_token', {
    accessToken: 'test-access-token',
    expiresAt: Date.now() + 60 * 60 * 1000,
    refreshToken: 'x'.repeat(43),
    tokenType: 'bearer',
  });
  db.close();
}

afterEach(() => {
  delete process.env.PIXIV_AUTH_READONLY;
  jest.restoreAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('DiagnoseEgressCommand', () => {
  it('rejects unknown diagnose targets', async () => {
    const command = new DiagnoseEgressCommand();
    const res = await command.execute(ctx(tempDbPath()), { options: {}, positional: ['bogus'] });
    expect(res.success).toBe(false);
  });

  it('skips oauth/appapi/media without a usable token and still probes reachability', async () => {
    const fetchImpl = jest.fn(async () => makeResponse({ status: 403 }));
    const command = new DiagnoseEgressCommand({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await command.execute(ctx(tempDbPath()), { options: {}, positional: ['egress'] });

    expect(res.success).toBe(true);
    const data = res.data as any;
    const codes = data.findings.map((f: any) => f.code);
    expect(codes).toContain('pixiv-net-ok');
    expect(codes).toContain('oauth-skipped');
    expect(codes).toContain('appapi-skipped');
    expect(codes).toContain('media-skipped');
    expect(data.verdict).toBe('INCOMPLETE');
    expect(data.incomplete).toBe(true);
    expect(res.exitCode ?? 0).toBe(0);
    // Only the reachability probe should have used fetch.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports a warn (not a crash) when readonly auth blocks the OAuth probe', async () => {
    process.env.PIXIV_AUTH_READONLY = 'true';
    const dbPath = tempDbPath();
    const fetchImpl = jest.fn(async (input: any) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://app-api.pixiv.net/')) {
        // Not reachable in this test: no access token exists, but the probe must
        // still classify the response instead of hanging.
        return makeResponse({ status: 403 });
      }
      return makeResponse({ status: 403 });
    });
    const command = new DiagnoseEgressCommand({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await command.execute(ctx(dbPath, true), { options: {}, positional: ['egress'] });

    expect(res.success).toBe(true);
    const data = res.data as any;
    const codes = data.findings.map((f: any) => f.code);
    expect(codes).toContain('oauth-readonly-blocked');
    expect(codes).not.toContain('oauth-failed');
    expect(data.verdict).toBe('DEGRADED');
    expect(res.exitCode).toBe(1);
  });

  it('flags a 429 App API response with its Retry-After and keeps media running', async () => {
    // Readonly + seeded cache: the OAuth probe must NOT hit the real token endpoint.
    process.env.PIXIV_AUTH_READONLY = 'true';
    const dbPath = tempDbPath();
    seedAccessTokenCache(dbPath);
    // The 429 is the signal this command exists to surface: one small request is
    // enough to record status + Retry-After without any business workload.
    const fetchImpl = jest.fn(async (input: any) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('app-api.pixiv.net')) {
        return makeResponse({
          status: 429,
          headers: { 'retry-after': '73' },
        });
      }
      return makeResponse({ status: 403 });
    });
    const command = new DiagnoseEgressCommand({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await command.execute(ctx(dbPath, true), { options: { 'illust-id': '1' }, positional: ['egress'] });

    const data = res.data as any;
    const appApi = data.findings.find((f: any) => f.code === 'appapi-429');
    expect(appApi).toBeDefined();
    expect(appApi.data.retryAfterMs).toBe(73_000);
    expect(data.appApi.rateLimited).toBe(true);
    expect(res.exitCode).toBe(1);
  });

  it('marks a media 403 as critical (the pximg referer contract failed)', async () => {
    process.env.PIXIV_AUTH_READONLY = 'true';
    const dbPath = tempDbPath();
    seedAccessTokenCache(dbPath);
    const fetchImpl = jest.fn(async (input: any) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('app-api.pixiv.net')) {
        return makeResponse({
          status: 200,
          body: { illust: { meta_single_page: { original_image_url: 'https://i.pximg.net/img-original/img/1.png' } } },
        });
      }
      if (url.includes('i.pximg.net')) {
        return makeResponse({ status: 403 });
      }
      return makeResponse({ status: 403 });
    });
    const command = new DiagnoseEgressCommand({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await command.execute(ctx(dbPath, true), { options: {}, positional: ['egress'] });

    const data = res.data as any;
    const codes = data.findings.map((f: any) => f.code);
    expect(codes).toContain('media-blocked');
    expect(data.verdict).toBe('FAIL');
    expect(res.exitCode).toBe(2);
  });
});
