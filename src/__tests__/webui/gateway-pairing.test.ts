/**
 * Gateway pairing is a PASSTHROUGH, and these tests pin the boundary:
 *
 *  - the gateway owns pairing; PixivFlow only GETs its endpoint and renders the
 *    answer, so the payload is passed through verbatim under `payload`;
 *  - a route without `pairingUrl` is reported as "unsupported" rather than
 *    showing an empty dialog, and a gateway that answers non-2xx is reported as
 *    `pairable: false` rather than as a success;
 *  - PixivFlow never follows a redirect unless the operator opted in, and never
 *    persists anything it reads.
 */
import { clearPairingCache, getPairing } from '../../webui/routes/handlers/pairing-handler';

const QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

const config = {
  storage: { databasePath: '/tmp/unused.db' },
  targets: [],
  delivery: {
    targets: {
      'qq-main': {
        type: 'webhook',
        url: 'https://gw.internal/hook',
        pairingUrl: 'https://gw.internal/pair',
      },
      'feishu-main': {
        type: 'webhook',
        url: 'https://feishu.internal/hook',
      },
      'redirecting': {
        type: 'webhook',
        url: 'https://gw.internal/hook',
        pairingUrl: 'https://gw.internal/pair',
        pairingAllowRedirects: true,
      },
      'templated': {
        type: 'webhook',
        url: 'https://gw.internal/hook',
        pairingUrl: 'https://${PAIR_HOST}/pair',
      },
    },
  },
};

jest.mock('../../config', () => ({
  getConfigPath: () => '/tmp/pixivflow.yml',
  loadConfig: () => (config as never),
}));

function responder() {
  const state: { status: number; payload: any } = { status: 200, payload: null };
  const res: any = {
    json: (v: any) => { state.payload = v; return res; },
    status: (c: number) => { state.status = c; return res; },
  };
  return { state, res };
}

describe('gateway pairing passthrough', () => {
  const originalFetch = global.fetch;

  beforeEach(() => clearPairingCache());
  afterAll(() => { global.fetch = originalFetch; });

  function mockFetch(impl: (url: string, init: any) => any): jest.Mock {
    const fn = jest.fn(impl);
    global.fetch = fn as never;
    return fn;
  }

  function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers({ 'content-type': contentType }),
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  }

  it('passes the gateway payload through verbatim with provenance', async () => {
    mockFetch(async () => jsonResponse({ qr: QR, state: 'scan me' }));
    const { state, res } = responder();

    await getPairing({ params: { name: 'qq-main' } } as any, res);

    expect(state.status).toBe(200);
    expect(state.payload.payload).toEqual({ qr: QR, state: 'scan me' });
    expect(state.payload).toMatchObject({
      schemaVersion: 1,
      readOnly: true,
      gateway: 'qq-main',
      pairable: true,
      contentType: 'application/json',
    });
    expect(typeof state.payload.fetchedAt).toBe('string');
  });

  it('never follows a redirect unless the route opted in', async () => {
    const fn = mockFetch(async () => jsonResponse({ qr: QR }));

    await getPairing({ params: { name: 'qq-main' } } as any, responder().res);
    expect(fn.mock.calls[0][1].redirect).toBe('manual');

    clearPairingCache();
    await getPairing({ params: { name: 'redirecting' } } as any, responder().res);
    expect(fn.mock.calls[1][1].redirect).toBe('follow');
  });

  it('reports an unsupported gateway instead of an empty dialog', async () => {
    mockFetch(async () => jsonResponse({}));
    const { state, res } = responder();

    await getPairing({ params: { name: 'feishu-main' } } as any, res);

    expect(state.status).toBe(404);
    expect(state.payload.errorCode).toBe('GATEWAY_PAIRING_UNSUPPORTED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('marks a non-2xx gateway answer as not pairable, never as success', async () => {
    mockFetch(async () => jsonResponse({ message: 'not paired yet' }, 409));
    const { state, res } = responder();

    await getPairing({ params: { name: 'qq-main' } } as any, res);

    expect(state.status).toBe(409);
    expect(state.payload.pairable).toBe(false);
    expect(state.payload.errorCode).toBe('GATEWAY_PAIRING_UNAVAILABLE');
    // The gateway's own diagnosis survives: it is the operator's only clue.
    expect(state.payload.payload).toEqual({ message: 'not paired yet' });
  });

  it('turns a transport failure into a redacted 502', async () => {
    mockFetch(async () => { throw new Error('connect ECONNREFUSED 10.0.0.9:443'); });
    const { state, res } = responder();

    await getPairing({ params: { name: 'qq-main' } } as any, res);

    expect(state.status).toBe(502);
    expect(state.payload.errorCode).toBe('GATEWAY_PAIRING_UNAVAILABLE');
    expect(state.payload.endpoint).toBe('https://gw.internal/hook');
    expect(state.payload.message).toContain('ECONNREFUSED');
  });

  it('interpolates the pairing URL from the environment', async () => {
    process.env.PAIR_HOST = 'pair.example.test';
    const fn = mockFetch(async () => jsonResponse({ qr: QR }));
    try {
      await getPairing({ params: { name: 'templated' } } as any, responder().res);
      expect(fn.mock.calls[0][0]).toBe('https://pair.example.test/pair');
    } finally {
      delete process.env.PAIR_HOST;
    }
  });

  it('404s for an unknown gateway and a malformed name', async () => {
    mockFetch(async () => jsonResponse({}));

    const unknown = responder();
    await getPairing({ params: { name: 'nope' } } as any, unknown.res);
    expect(unknown.state.status).toBe(404);
    expect(unknown.state.payload.errorCode).toBe('GATEWAY_NOT_FOUND');

    const malformed = responder();
    await getPairing({ params: { name: '../../etc/passwd' } } as any, malformed.res);
    expect(malformed.state.status).toBe(404);
  });

  it('refuses an unresolved environment reference rather than fetching it', async () => {
    const fn = mockFetch(async () => jsonResponse({ qr: QR }));
    const { state, res } = responder();

    await getPairing({ params: { name: 'templated' } } as any, res);

    expect(state.status).toBe(502);
    expect(state.payload.message).toContain('PAIR_HOST');
    expect(fn).not.toHaveBeenCalled();
  });

  it('caches briefly so a polling panel does not hammer the gateway', async () => {
    const fn = mockFetch(async () => jsonResponse({ qr: QR }));

    await getPairing({ params: { name: 'qq-main' } } as any, responder().res);
    await getPairing({ params: { name: 'qq-main' } } as any, responder().res);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
