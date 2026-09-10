import { PixivClient } from '../client';
import { StaticTokenProvider } from '../auth/types';
import { MemoryRateLimitStateStore } from '../rate-limit/RateLimitGate';
import { paginate } from '../pagination';
import type { FetchLike, RateLimitStateStore } from '../types';
import {
  PixivCircuitOpenError,
  PixivRateLimitError,
  PixivAbortError,
} from '../errors/errors';

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    statusText: '',
    ok: status >= 200 && status < 300,
    headers: { get: (n: string) => map.get(n.toLowerCase()) ?? null },
    json: async () => JSON.parse(text),
    text: async () => text,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function clientWith(fetchImpl: FetchLike, store?: RateLimitStateStore) {
  return new PixivClient({
    auth: new StaticTokenProvider('t'),
    fetchImpl,
    retries: 0,
    rateLimit: {
      minIntervalMs: 0,
      jitterRatio: 0,
      initialCooldownMs: 1, // tiny: no real-time waiting in tests
      maxCooldownMs: 600_000,
      random: () => 0,
      stateStore: store,
      // No real waiting: gate cooldowns resolve immediately (state still
      // records the full cooldownUntil, which is what restart recovery tests).
      sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    },
  });
}

describe('restart recovery', () => {
  it('429 -> cooldown persisted -> new client with same store still blocks', async () => {
    const store = new MemoryRateLimitStateStore();
    let calls = 0;
    const client = clientWith(
      async () => {
        calls++;
        return response(429, { error: 'rate' }, { 'retry-after': '60' });
      },
      store
    );
    await expect(client.illustrations.get(1)).rejects.toBeInstanceOf(PixivRateLimitError);

    // "Restart": a brand new client, same persisted state.
    let calls2 = 0;
    const client2 = clientWith(async () => {
      calls2++;
      return response(200, { illust: { id: 1 } });
    }, store);

    const status = await client2.getRateLimitStatus();
    expect(status.cooldownRemainingMs).toBeGreaterThanOrEqual(50_000);
    expect(status.penaltyLevel).toBe(1);
    expect(calls2).toBe(0); // no request attempted before any call

    // At the persisted cooldown instant the next request is gated (waits);
    // after advancing the clock past it, it goes through without a reset.
    let nowMs = Date.now();
    const client3 = new PixivClient({
      auth: new StaticTokenProvider('t'),
      fetchImpl: async () => {
        calls2++;
        return response(200, { illust: { id: 1 } });
      },
      retries: 0,
      rateLimit: {
        minIntervalMs: 0,
        jitterRatio: 0,
        initialCooldownMs: 1,
        maxCooldownMs: 600_000,
        random: () => 0,
        stateStore: store,
        now: () => nowMs,
      },
    });
    const st = await client3.getRateLimitStatus();
    expect(st.circuitState).toBe('closed');
    expect(st.cooldownRemainingMs).toBeGreaterThan(0);
    // Jump beyond the persisted cooldown: request now succeeds, proving the
    // block came from persisted state, not a fresh clock-zero default.
    nowMs += 120_000;
    expect((await client3.illustrations.get(1)).id).toBe(1);
    expect(calls2).toBe(1);
  });
});

describe('429 queue serialization (fault injection)', () => {
  it('search 429 parks the global gate; after cooldown, queued sends are spaced 1s apart', async () => {
    // Deterministic virtual clock: sleeps resolve in fake-time order and the
    // event loop drains all queued continuations.
    let now = 1_000_000;
    let seq = 0;
    const timers: Array<{ at: number; seq: number; resolve: () => void; reject: (e: unknown) => void }> = [];
    const sleep = (ms: number, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        const entry = { at: now + ms, seq: seq++, resolve, reject };
        timers.push(entry);
        signal?.addEventListener(
          'abort',
          () => {
            const i = timers.indexOf(entry);
            if (i >= 0) timers.splice(i, 1);
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          },
          { once: true }
        );
      });
    const run = async (deadline: number) => {
      // Fire timers in chronological order, jumping fake time to each one;
      // drain continuations after every fire so chains that register a NEW
      // timer (retry sleeps, queued slots) are seen on the next iteration.
      for (let safety = 0; safety < 10_000; safety++) {
        for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
        timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const next = timers[0];
        if (!next || next.at > deadline) break;
        timers.shift();
        now = next.at;
        next.resolve();
      }
    };

    const sendTimes: number[] = [];
    let searches = 0;
    const client = new PixivClient({
      auth: new StaticTokenProvider('t'),
      retries: 2,
      fetchImpl: async (url) => {
        sendTimes.push(now);
        const u = new URL(url);
        if (u.pathname === '/v1/search/illust') {
          searches++;
          // Retry-After (30s) beats the short 10s ladder and sets the gate.
          return searches <= 1 ? response(429, {}, { 'retry-after': '30' }) : response(200, { illusts: [], next_url: null });
        }
        return response(200, { illust: { id: Number(u.searchParams.get('illust_id')) } });
      },
      rateLimit: {
        minIntervalMs: 1000,
        jitterRatio: 0,
        initialCooldownMs: 10_000,
        maxCooldownMs: 600_000,
        random: () => 0,
        now: () => now,
        sleep,
      },
      sleep,
    });

    // search gets a 429 (Retry-After 30s), retries after the gate cooldown.
    const searchP = client.illustrations.search({ word: 'x', limit: 1 });
    // Two details arrive concurrently; they must wait behind the gate, not fire.
    const detailP = [2, 3].map((id) => client.illustrations.get(id));

    await run(now + 60_000);

    const searchResult = await searchP;
    expect(searchResult.items).toEqual([]);
    const details = await Promise.all(detailP);
    expect(details.map((d) => d.id)).toEqual([2, 3]);

    // Attempt 1 at t0 429s; the global gate parks EVERYTHING until +30s (the
    // details do not fire at +1s/+2s as they would without the shared gate).
    // After the cooldown all three remaining sends are strictly 1s apart.
    expect(sendTimes[0]).toBe(1_000_000);
    expect(sendTimes.slice(1)).toEqual([1_030_000, 1_031_000, 1_032_000]);
  });
});

describe('pagination + abort', () => {
  it('paginate walks next cursors and respects limit/maxPages', async () => {
    const seen: number[] = [];
    const result = await paginate<number>(
      async (cursor) => {
        const page = cursor ? Number(cursor) : 1;
        seen.push(page);
        return { items: [page, page], next: page < 3 ? String(page + 1) : null };
      },
      { limit: 5 }
    );
    expect(result.items).toEqual([1, 1, 2, 2, 3]);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('aborts a pagination walk', async () => {
    const controller = new AbortController();
    let pages = 0;
    const p = paginate<number>(
      async () => {
        pages++;
        if (pages === 2) controller.abort();
        return { items: [1], next: 'more' };
      },
      { signal: controller.signal, maxPages: 10 }
    );
    const result = await p;
    expect(pages).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('aborting a rate-limit wait rejects with PixivAbortError', async () => {
    let now = 0;
    const client = new PixivClient({
      auth: new StaticTokenProvider('t'),
      fetchImpl: (async () => response(200, { illust: { id: 1 } })) as FetchLike,
      rateLimit: {
        minIntervalMs: 10_000,
        jitterRatio: 0,
        random: () => 0,
        now: () => now,
        sleep: (ms, signal) =>
          new Promise<void>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
              { once: true }
            );
          }),
      },
    });
    // Consume the immediate first slot, then abort the second reservation.
    void client.illustrations.get(1);
    await Promise.resolve();
    await Promise.resolve();
    const controller = new AbortController();
    const p = client.illustrations.get(2, controller.signal);
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(PixivAbortError);
  });
});
