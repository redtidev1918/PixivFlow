/**
 * Unit tests for PixivApiCore HTTP behaviour.
 */
import { NetworkError } from '../../utils/errors';
import { PixivApiCore } from '../../pixiv/client/PixivApiCore';

jest.mock('node:timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('undici', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

const mockFetch = jest.fn();

global.fetch = mockFetch as unknown as typeof fetch;

const createResponse = (overrides: Partial<Response> = {}): Response =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ ok: true }),
    text: async () => 'ok',
    headers: new Headers(),
    arrayBuffer: async () => new ArrayBuffer(4),
    ...overrides,
  }) as Response;

describe('PixivApiCore', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('performs successful JSON request with default base URL', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        json: async () => ({ foo: 'bar' }),
      })
    );

    const api = new PixivApiCore();
    const result = await api.request<{ foo: string }>('/v1/test');

    expect(result).toEqual({ foo: 'bar' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://app-api.pixiv.net/v1/test');
    expect(init?.headers).toMatchObject({
      Referer: 'https://app-api.pixiv.net/',
    });
  });

  it('attaches bearer token when provided', async () => {
    mockFetch.mockResolvedValueOnce(createResponse());
    const getAccessToken = jest.fn().mockResolvedValue('test-token');

    const api = new PixivApiCore({ getAccessToken });
    await api.request('/v1/protected');

    expect(getAccessToken).toHaveBeenCalled();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      Referer: 'https://app-api.pixiv.net/',
    });
  });

  it('does not retry 404 responses', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'not found',
      })
    );

    const api = new PixivApiCore();

    await expect(api.request('/v1/missing')).rejects.toThrow(NetworkError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on rate limit responses up to success', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createResponse({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'rate limited',
          headers: new Headers({ 'Retry-After': '1' }),
        })
      )
      .mockResolvedValueOnce(
        createResponse({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'rate limited again',
          headers: new Headers({ 'Retry-After': '1' }),
        })
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({ success: true }),
        })
      );

    const api = new PixivApiCore({ maxRetries: 2 });
    const result = await api.request('/v1/rate-limit');

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('downloads binary media', async () => {
    const buffer = new ArrayBuffer(16);
    mockFetch.mockResolvedValueOnce(
      createResponse({
        arrayBuffer: async () => buffer,
      })
    );

    const api = new PixivApiCore();
    const result = await api.downloadBinary('https://i.pximg.net/img-original/img.jpg');

    expect(result).toBe(buffer);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://i.pximg.net/img-original/img.jpg');
    expect(init?.headers).toMatchObject({
      Referer: 'https://app-api.pixiv.net/',
    });
  });

  it('throws without retry on binary 404', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'missing image',
      })
    );
    const api = new PixivApiCore();

    await expect(api.downloadBinary('https://i.pximg.net/missing.jpg')).rejects.toThrow(
      NetworkError
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles 401 unauthorized error', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'invalid token',
      })
    );

    const api = new PixivApiCore({ maxRetries: 0 });
    const error = await api.request('/v1/protected').catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).message).toContain('401 Unauthorized');
    expect((error as NetworkError).message).toContain('invalid token');
  });

  it('handles other error status codes', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'server error',
      })
    );

    const api = new PixivApiCore({ maxRetries: 0 });
    const error = await api.request('/v1/error').catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).message).toContain('500');
    expect((error as NetworkError).message).toContain('server error');
  });

  it('uses custom base URL', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        json: async () => ({ test: true }),
      })
    );

    const api = new PixivApiCore({ baseUrl: 'https://custom-api.example.com' });
    await api.request('/v1/test');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://custom-api.example.com/v1/test');
  });

  it('uses custom user agent', async () => {
    mockFetch.mockResolvedValueOnce(createResponse());

    const api = new PixivApiCore({ userAgent: 'CustomAgent/1.0' });
    await api.request('/v1/test');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init?.headers).toMatchObject({
      'User-Agent': 'CustomAgent/1.0',
    });
  });

  it('handles proxy configuration', async () => {
    mockFetch.mockResolvedValueOnce(createResponse());

    const api = new PixivApiCore({ proxyUrl: 'http://proxy.example.com:8080' });
    await api.request('/v1/test');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init).toBeDefined();
  });

  it('calculates rate limit wait time correctly', () => {
    const api = new PixivApiCore({ rateLimitPerSecond: 10 });
    expect(api.calculateRateLimitWaitTime()).toBe(100);

    const api2 = new PixivApiCore({ rateLimitPerSecond: 5 });
    expect(api2.calculateRateLimitWaitTime()).toBe(200);

    const api3 = new PixivApiCore({ rateLimitPerSecond: 0 });
    expect(api3.calculateRateLimitWaitTime()).toBe(0);

    const api4 = new PixivApiCore();
    expect(api4.calculateRateLimitWaitTime()).toBe(0);
  });

  it('does not attach token when getAccessToken returns empty string', async () => {
    mockFetch.mockResolvedValueOnce(createResponse());
    const getAccessToken = jest.fn().mockResolvedValue('');

    const api = new PixivApiCore({ getAccessToken });
    await api.request('/v1/test');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init?.headers).not.toHaveProperty('Authorization');
  });

  it('does not attach token when getAccessToken returns null', async () => {
    mockFetch.mockResolvedValueOnce(createResponse());
    const getAccessToken = jest.fn().mockResolvedValue(null as any);

    const api = new PixivApiCore({ getAccessToken });
    await api.request('/v1/test');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init?.headers).not.toHaveProperty('Authorization');
  });

  it('handles synchronous getAccessToken', async () => {
    mockFetch.mockResolvedValueOnce(createResponse());
    const getAccessToken = jest.fn().mockReturnValue('sync-token');

    const api = new PixivApiCore({ getAccessToken });
    await api.request('/v1/test');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sync-token',
    });
  });

  it('resolves relative path without leading slash', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        json: async () => ({ test: true }),
      })
    );

    const api = new PixivApiCore();
    await api.request('v1/test');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://app-api.pixiv.net/v1/test');
  });

  it('retries on network errors', async () => {
    const networkError = new Error('Network error');
    mockFetch
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({ success: true }),
        })
      );

    const api = new PixivApiCore({ maxRetries: 1 });
    const result = await api.request('/v1/test');

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries binary download on network errors', async () => {
    const buffer = new ArrayBuffer(16);
    const networkError = new Error('Network error');
    mockFetch
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(
        createResponse({
          arrayBuffer: async () => buffer,
        })
      );

    const api = new PixivApiCore({ maxRetries: 1 });
    const result = await api.downloadBinary('https://i.pximg.net/img.jpg');

    expect(result).toBe(buffer);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('handles binary download with rate limiting', async () => {
    const buffer = new ArrayBuffer(16);
    mockFetch.mockResolvedValueOnce(
      createResponse({
        arrayBuffer: async () => buffer,
      })
    );

    const api = new PixivApiCore({ rateLimitPerSecond: 10 });
    const result = await api.downloadBinary('https://i.pximg.net/img.jpg');

    expect(result).toBe(buffer);
  });

  it('handles binary download with proxy', async () => {
    const buffer = new ArrayBuffer(16);
    mockFetch.mockResolvedValueOnce(
      createResponse({
        arrayBuffer: async () => buffer,
      })
    );

    const api = new PixivApiCore({ proxyUrl: 'http://proxy.example.com:8080' });
    const result = await api.downloadBinary('https://i.pximg.net/img.jpg');

    expect(result).toBe(buffer);
  });

  it('handles 429 without Retry-After header', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createResponse({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'rate limited',
          headers: new Headers(),
        })
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({ success: true }),
        })
      );

    const api = new PixivApiCore({ maxRetries: 1 });
    const result = await api.request('/v1/rate-limit');

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('handles 429 with Retry-After less than 60 seconds', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createResponse({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'rate limited',
          headers: new Headers({ 'Retry-After': '30' }),
        })
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({ success: true }),
        })
      );

    const api = new PixivApiCore({ maxRetries: 1 });
    const result = await api.request('/v1/rate-limit');

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('handles binary download error status', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'server error',
      })
    );

    const api = new PixivApiCore({ maxRetries: 0 });
    const error = await api.downloadBinary('https://i.pximg.net/error.jpg').catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).message).toContain('500');
    expect((error as NetworkError).message).toContain('server error');
  });

  it('handles custom timeout', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        json: async () => ({ test: true }),
      })
    );

    const api = new PixivApiCore({ defaultTimeoutMs: 5000 });
    await api.request('/v1/test');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles custom max retries', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({ success: true }),
        })
      );

    const api = new PixivApiCore({ maxRetries: 2 });
    const result = await api.request('/v1/test');

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('handles response text read error gracefully', async () => {
    mockFetch.mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => {
          throw new Error('Cannot read text');
        },
      })
    );

    const api = new PixivApiCore({ maxRetries: 0 });
    const error = await api.request('/v1/error').catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).message).toContain('500');
  });
});


