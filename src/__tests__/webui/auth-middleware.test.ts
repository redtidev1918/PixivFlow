import { createBasicAuthMiddleware, verifyBasicAuth } from '../../webui/server/auth-middleware';

describe('basic auth middleware', () => {
  const middleware = createBasicAuthMiddleware({
    username: 'admin',
    password: 's3cret',
    exemptPaths: ['/api/health', '/health'],
  });

  function run(
    path: string,
    method = 'GET',
    authorization?: string
  ): { nexted: boolean; status?: number; wwwAuthenticate?: string } {
    let nexted = false;
    let status: number | undefined;
    let wwwAuthenticate: string | undefined;
    const res = {
      setHeader: (k: string, v: string) => {
        if (k === 'WWW-Authenticate') wwwAuthenticate = v;
      },
      status: (code: number) => {
        status = code;
        return { json: () => undefined };
      },
    } as any;
    const req = { method, path, headers: authorization ? { authorization } : {} } as any;
    middleware(req, res, () => {
      nexted = true;
    });
    return { nexted, status, wwwAuthenticate };
  }

  it('rejects requests without credentials (401 + WWW-Authenticate)', () => {
    const r = run('/api/stats/overview');
    expect(r.nexted).toBe(false);
    expect(r.status).toBe(401);
    expect(r.wwwAuthenticate).toMatch(/Basic realm=/);
  });

  it('rejects wrong credentials', () => {
    const r = run('/x', 'GET', 'Basic ' + Buffer.from('admin:wrong').toString('base64'));
    expect(r.nexted).toBe(false);
    expect(r.status).toBe(401);
  });

  it('accepts valid credentials', () => {
    const r = run(
      '/x',
      'GET',
      'Basic ' + Buffer.from('admin:s3cret').toString('base64')
    );
    expect(r.nexted).toBe(true);
  });

  it('exempts health check paths', () => {
    expect(run('/api/health').nexted).toBe(true);
    expect(run('/health').nexted).toBe(true);
  });

  it('passes OPTIONS preflight', () => {
    expect(run('/x', 'OPTIONS').nexted).toBe(true);
  });

  it('verifyBasicAuth validates header directly', () => {
    const header = 'Basic ' + Buffer.from('admin:s3cret').toString('base64');
    expect(verifyBasicAuth(header, 'admin', 's3cret')).toBe(true);
    expect(verifyBasicAuth(header, 'admin', 'wrong')).toBe(false);
    expect(verifyBasicAuth(undefined, 'admin', 's3cret')).toBe(false);
  });
});
