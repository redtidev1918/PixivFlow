import { HttpMultipartDelivery } from '../../delivery/HttpMultipartDelivery';

describe('HttpMultipartDelivery.readinessProbe', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reports http_<status> on 503 and ready on 200', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response('starting', { status: 503 }))
      .mockResolvedValueOnce(new Response('ready', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submit',
      readinessUrl: 'https://example.test/ready',
    });

    expect(await provider.readinessProbe()).toEqual({ ready: false, reason: 'http_503', status: 503 });
    expect(await provider.isReady()).toBe(true);
  });

  it('classifies an aborted probe as timeout', async () => {
    global.fetch = jest.fn(() =>
      new Promise((_resolve, reject) => {
        const e = new Error('The operation was aborted');
        (e as Error).name = 'AbortError';
        reject(e);
      })
    ) as unknown as typeof fetch;
    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submit',
      readinessUrl: 'https://example.test/ready',
    });
    // Real 3s timeout is not forced in tests; rejecting with AbortError exercises the branch.
    const probe = await provider.readinessProbe();
    expect(probe.ready).toBe(false);
    expect(probe.reason).toBe('timeout');
  });

  it('treats connection rejection as connection_refused', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED')) as unknown as typeof fetch;
    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submit',
      readinessUrl: 'https://example.test/ready',
    });
    expect(await provider.readinessProbe()).toEqual({ ready: false, reason: 'connection_refused' });
  });

  it('is ready when no readinessUrl is configured', async () => {
    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submit',
    });
    expect(await provider.readinessProbe()).toEqual({ ready: true });
  });
});
