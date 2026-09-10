import { PixivClient } from '../../client';
import { StaticTokenProvider } from '../../auth/types';
import type { FetchLike, ResponseLike } from '../../types';
import {
  PixivRateLimitError,
  PixivNotFoundError,
  PixivAuthenticationError,
  PixivForbiddenError,
  PixivServerError,
  PixivNetworkError,
  PixivTimeoutError,
  PixivCircuitOpenError,
  PixivHttpError,
} from '../../errors/errors';

function makeResponse(init: { status?: number; statusText?: string; body?: unknown; headers?: Record<string, string> }): ResponseLike {
  const status = init.status ?? 200;
  const raw = init.body === undefined ? '' : typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
  const headers = new Map(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    statusText: init.statusText ?? '',
    ok: status >= 200 && status < 300,
    headers: { get: (n: string) => headers.get(n.toLowerCase()) ?? null },
    json: async () => JSON.parse(raw),
    text: async () => raw,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function makeClient(
  fetchImpl: FetchLike,
  opts: { retries?: number; minIntervalMs?: number; initialCooldownMs?: number; openThreshold?: number; decaySuccesses?: number } = {}
) {
  return new PixivClient({
    auth: new StaticTokenProvider('test-token'),
    fetchImpl,
    retries: opts.retries ?? 0,
    timeoutMs: 5_000,
    rateLimit: {
      minIntervalMs: opts.minIntervalMs ?? 0,
      jitterRatio: 0,
      initialCooldownMs: opts.initialCooldownMs ?? 60_000,
      maxCooldownMs: 900_000,
      openThreshold: opts.openThreshold ?? 10,
      decaySuccesses: opts.decaySuccesses ?? 99,
      random: () => 0,
    },
  });
}

describe('transport status mapping', () => {
  const cases: Array<[number, unknown]> = [
    [200, null],
    [400, PixivHttpError],
    [401, PixivAuthenticationError],
    [403, PixivForbiddenError],
    [404, PixivNotFoundError],
    [429, PixivRateLimitError],
    [500, PixivServerError],
    [503, PixivServerError],
  ];
  for (const [status, expected] of cases) {
    it(`${status} ${expected === null ? 'resolves' : `throws ${(expected as ErrorConstructor).name}`}`, async () => {
      const client = makeClient(
        async () => makeResponse({ status, body: status === 200 ? { illust: { id: 1 } } : { error: 'x' } }),
        { retries: 0 }
      );
      const call = client.illustrations.get(1);
      if (expected === null) await expect(call).resolves.toBeDefined();
      else await expect(call).rejects.toBeInstanceOf(expected);
    });
  }

  it('404 is not retried', async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls++;
      return makeResponse({ status: 404 });
    }, { retries: 3 });
    await expect(client.illustrations.get(1)).rejects.toBeInstanceOf(PixivNotFoundError);
    expect(calls).toBe(1);
  });

  it('403 is not retried', async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls++;
      return makeResponse({ status: 403 });
    }, { retries: 3 });
    await expect(client.illustrations.get(1)).rejects.toBeInstanceOf(PixivForbiddenError);
    expect(calls).toBe(1);
  });
});

describe('transport transient retries', () => {
  it('retries 5xx with linear backoff up to the budget, then throws', async () => {
    let calls = 0;
    const client = makeClient(
      async () => {
        calls++;
        return makeResponse({ status: 500 });
      },
      { retries: 2 }
    );
    await expect(client.illustrations.get(1)).rejects.toBeInstanceOf(PixivServerError);
    expect(calls).toBe(3);
  });

  it('recovers after a transient 500', async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls++;
      return makeResponse({ status: calls === 1 ? 502 : 200, body: { illust: { id: 1 } } });
    }, { retries: 2 });
    const illust = await client.illustrations.get(1);
    expect(illust.id).toBe(1);
    expect(calls).toBe(2);
  });

  it('maps connection reset to PixivNetworkError and retries', async () => {
    let calls = 0;
    const err = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const client = makeClient(async () => {
      calls++;
      throw err;
    }, { retries: 1 });
    await expect(client.illustrations.get(1)).rejects.toBeInstanceOf(PixivNetworkError);
    expect(calls).toBe(2);
  });

  it('maps aborts that are not caller signals to PixivTimeoutError', async () => {
    const client = makeClient(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    }, { retries: 0 });
    await expect(client.illustrations.get(1)).rejects.toBeInstanceOf(PixivTimeoutError);
  });

  it('does not retry a caller-provided abort signal; throws PixivAbortError', async () => {
    let calls = 0;
    const controller = new AbortController();
    const client = makeClient(
      async (_url, init) => {
        calls++;
        if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        // Never resolves on its own; abort arrives next.
        await new Promise((_, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          )
        );
        throw new Error('unreachable');
      },
      { retries: 3, minIntervalMs: 0 }
    );
    const p = client.illustrations.get(1, controller.signal);
    controller.abort();
    const { PixivAbortError } = await import('../../errors/errors');
    await expect(p).rejects.toBeInstanceOf(PixivAbortError);
    expect(calls).toBe(1);
  });
});

describe('transport 429 + gate (fault injection)', () => {
  it('retries 429 after Retry-After while below the circuit threshold', async () => {
    let calls = 0;
    const client = makeClient(
      async () => {
        calls++;
        return calls === 1
          ? makeResponse({ status: 429, headers: { 'retry-after': '0' } })
          : makeResponse({ status: 200, body: { illust: { id: 9 } } });
      },
      { retries: 2, initialCooldownMs: 0 }
    );
    const illust = await client.illustrations.get(9);
    expect(illust.id).toBe(9);
    expect(calls).toBe(2);
    const status = await client.getRateLimitStatus();
    expect(status.penaltyLevel).toBe(1);
  });

  it('a 429 parks the WHOLE client: a second detail request is not sent during cooldown', async () => {
    let searchCalls = 0;
    let detailCalls = 0;
    const client = makeClient(
      async (url) => {
        if (url.includes('/v1/search/illust')) {
          searchCalls++;
          return makeResponse({ status: 429, headers: { 'retry-after': '60' } });
        }
        if (url.includes('/v1/illust/detail')) {
          detailCalls++;
          return makeResponse({ status: 200, body: { illust: { id: 2 } } });
        }
        return makeResponse({ status: 404 });
      },
      { retries: 0, initialCooldownMs: 60_000 }
    );

    // search 429s -> the gate parks for 60s and the call fails fast.
    await expect(
      client.illustrations.search({ word: 'a', limit: 1 })
    ).rejects.toBeInstanceOf(PixivRateLimitError);
    expect(searchCalls).toBe(1);

    // A concurrent detail must NOT hit the network while the gate is in cooldown.
    const status = await client.getRateLimitStatus();
    expect(status.cooldownRemainingMs).toBeGreaterThan(50_000);
    expect(detailCalls).toBe(0);
  });

  it('opens the circuit at the threshold and fails fast with PixivCircuitOpenError on later calls', async () => {
    let calls = 0;
    const client = makeClient(
      async () => {
        calls++;
        return makeResponse({ status: 429, headers: { 'retry-after': '0' } });
      },
      { retries: 0, openThreshold: 1, initialCooldownMs: 60_000 }
    );
    await expect(client.illustrations.get(1)).rejects.toBeInstanceOf(PixivRateLimitError);
    // Circuit now OPEN: the very next request fails at the gate (no HTTP call).
    await expect(client.illustrations.get(1)).rejects.toBeInstanceOf(PixivCircuitOpenError);
    expect(calls).toBe(1);
  });
});

describe('transport auth', () => {
  it('refreshes the token once on 401 and retries', async () => {
    const tokens = { current: 'old' };
    const provider = {
      getAccessToken: async () => tokens.current,
      refreshAccessToken: async () => {
        tokens.current = 'new';
        return 'new';
      },
    };
    let seenAuth = '';
    const client = new PixivClient({
      auth: provider,
      retries: 0,
      fetchImpl: async (_u, init) => {
        seenAuth = (init.headers as Record<string, string>).Authorization;
        const status = seenAuth === 'Bearer new' ? 200 : 401;
        return makeResponse({ status, body: { illust: { id: 3 } } });
      },
      rateLimit: { minIntervalMs: 0, jitterRatio: 0, random: () => 0 },
    });
    const illust = await client.illustrations.get(3);
    expect(illust.id).toBe(3);
    expect(tokens.current).toBe('new');
  });
});

describe('in-flight coalescing', () => {
  it('10 concurrent identical detail calls make exactly 1 HTTP request', async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls++;
      return makeResponse({ status: 200, body: { illust: { id: 77 } } });
    });
    const results = await Promise.all(Array.from({ length: 10 }, () => client.illustrations.get(77)));
    expect(calls).toBe(1);
    expect(results.every((r) => r.id === 77)).toBe(true);
  });

  it('does not coalesce different ids', async () => {
    let calls = 0;
    const client = makeClient(async (url) => {
      calls++;
      const id = url.match(/illust_id=(\d+)/)![1];
      return makeResponse({ status: 200, body: { illust: { id: Number(id) } } });
    });
    const [a, b] = await Promise.all([client.illustrations.get(1), client.illustrations.get(2)]);
    expect(calls).toBe(2);
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
  });
});
