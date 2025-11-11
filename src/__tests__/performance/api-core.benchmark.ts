/**
 * Performance benchmarks for PixivApiCore
 */

import { PixivApiCore } from '../../pixiv/client/PixivApiCore';
import { benchmark, formatBenchmarkResult, runBenchmarks } from './benchmark-utils';

// Mock fetch for benchmarking
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock timers
jest.mock('node:timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('undici', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

const createMockResponse = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => data,
  text: async () => JSON.stringify(data),
  headers: new Headers(),
  arrayBuffer: async () => new ArrayBuffer(4),
} as Response);

describe('PixivApiCore Performance Benchmarks', () => {
  let api: PixivApiCore;

  beforeEach(() => {
    mockFetch.mockReset();
    api = new PixivApiCore({ maxRetries: 1 });
  });

  it('should benchmark JSON request performance', async () => {
    mockFetch.mockResolvedValue(
      createMockResponse({ illust: { id: 1, title: 'Test' } })
    );

    const result = await benchmark(
      'JSON Request',
      async () => {
        await api.request('/v1/illust/detail?illust_id=1');
      },
      { iterations: 50, warmup: 5 }
    );

    console.log(formatBenchmarkResult(result));
    expect(result.average).toBeLessThan(100); // Should be fast with mocked fetch
  });

  it('should benchmark binary download performance', async () => {
    const buffer = new ArrayBuffer(1024 * 1024); // 1MB
    mockFetch.mockResolvedValue(
      createMockResponse({
        arrayBuffer: async () => buffer,
        ok: true,
        status: 200,
        headers: new Headers(),
      } as Response)
    );

    const result = await benchmark(
      'Binary Download (1MB)',
      async () => {
        await api.downloadBinary('https://i.pximg.net/image.jpg');
      },
      { iterations: 20, warmup: 3 }
    );

    console.log(formatBenchmarkResult(result));
    expect(result.average).toBeLessThan(200);
  });

  it('should benchmark multiple concurrent requests', async () => {
    mockFetch.mockResolvedValue(
      createMockResponse({ illusts: [{ id: 1 }, { id: 2 }] })
    );

    const result = await benchmark(
      'Concurrent Requests (10)',
      async () => {
        await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            api.request(`/v1/illust/detail?illust_id=${i}`)
          )
        );
      },
      { iterations: 10, warmup: 2 }
    );

    console.log(formatBenchmarkResult(result));
    expect(result.average).toBeLessThan(500);
  });

  it('should run all benchmarks', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ ok: true }));

    const benchmarks = [
      {
        name: 'Single JSON Request',
        fn: async () => {
          await api.request('/v1/test');
        },
        options: { iterations: 30, warmup: 3 },
      },
      {
        name: 'Binary Download',
        fn: async () => {
          await api.downloadBinary('https://i.pximg.net/test.jpg');
        },
        options: { iterations: 20, warmup: 2 },
      },
    ];

    const results = await runBenchmarks(benchmarks);
    expect(results).toHaveLength(2);
  });
});

