import { RateLimitGate, MemoryRateLimitStateStore, DEFAULT_RATE_LIMIT } from '../RateLimitGate';
import { PixivCircuitOpenError } from '../../errors/errors';
import type { RateLimitState } from '../../types';

/**
 * Virtual clock with a deadline queue. `sleep(ms)` resolves when fake time
 * reaches its deadline; `tick` jumps to each deadline in order, firing FIFO
 * among equal deadlines, and drains microtasks after each fire so chains that
 * register new sleeps at the same instant are resolved in registration order.
 */
function virtualTime(start = 1_000_000) {
  let now = start;
  let seq = 0;
  const scheduled: Array<{ at: number; seq: number; resolve: () => void }> = [];

  const sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const entry = { at: now + ms, seq: seq++, resolve };
      scheduled.push(entry);
      if (signal) {
        if (signal.aborted) {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          return;
        }
        signal.addEventListener(
          'abort',
          () => {
            const i = scheduled.indexOf(entry);
            if (i >= 0) scheduled.splice(i, 1);
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          },
          { once: true }
        );
      }
    });

  const flushMicrotasks = async () => {
    for (let i = 0; i < 100; i++) {
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
    }
  };

  const tick = async (ms: number) => {
    const target = now + ms;
    // Let any synchronous-then-microtask chains (ensureLoaded, reservation
    // queue) register their sleeps before we start jumping time.
    await flushMicrotasks();
    for (let safety = 0; safety < 1_000_000; safety++) {
      const due = scheduled.filter((s) => s.at <= target);
      if (!due.length) break;
      due.sort((a, b) => (a.at - b.at) || (a.seq - b.seq));
      const next = due[0];
      scheduled.splice(scheduled.indexOf(next), 1);
      now = next.at;
      next.resolve();
      // Drain continuation microtasks before picking the next deadline; a
      // continuation may register a new sleep at this exact timestamp with a
      // later seq, preserving FIFO spacing (1001 then 1001-registered sleep).
      for (let i = 0; i < 5; i++) await Promise.resolve();
    }
    now = target;
  };

  return {
    now: () => now,
    sleep,
    tick,
    advanceOnly: (ms: number) => {
      now += ms;
    },
  };
}

function gate(opts: ConstructorParameters<typeof RateLimitGate>[0] = {}) {
  const t = virtualTime();
  const g = new RateLimitGate(
    {
      minIntervalMs: opts.minIntervalMs ?? 1000,
      jitterRatio: 0,
      initialCooldownMs: opts.initialCooldownMs ?? 60_000,
      maxCooldownMs: opts.maxCooldownMs ?? 900_000,
      decaySuccesses: opts.decaySuccesses ?? 20,
      openThreshold: opts.openThreshold ?? 4,
      stateStore: opts.stateStore,
      scope: opts.scope,
      now: t.now,
      sleep: t.sleep,
      random: () => 0,
    }
  );
  return { g, t };
}

describe('RateLimitGate pacing', () => {
  it('defaults to conservative pacing (1000ms, jitter, 60s cooldown)', () => {
    expect(DEFAULT_RATE_LIMIT.minIntervalMs).toBe(1000);
    expect(DEFAULT_RATE_LIMIT.initialCooldownMs).toBe(60_000);
    expect(DEFAULT_RATE_LIMIT.jitterRatio).toBeGreaterThan(0);
  });

  it('serializes concurrent callers with slot reservation (no burst)', async () => {
    const { g, t } = gate();
    const slots: number[] = [];
    const grab = async () => {
      await g.acquire();
      slots.push(t.now());
    };
    // Fire 4 concurrent acquisitions; each reserves its slot synchronously.
    const waits = [grab(), grab(), grab(), grab()];
    await t.tick(5000);
    await Promise.all(waits);
    expect(slots).toEqual([1_000_000, 1_001_000, 1_002_000, 1_003_000]);
  });

  it('adds jitter to pacing when configured', async () => {
    const t = virtualTime();
    const g = new RateLimitGate({ minIntervalMs: 1000, jitterRatio: 0.5, now: t.now, sleep: t.sleep, random: () => 0.5 });
    const p1 = g.acquire();
    const p2 = g.acquire();
    await t.tick(2000);
    await Promise.all([p1, p2]);
    const state = await g.getState();
    // Each reservation advances by interval + jitter (1000 + 250 = 1250);
    // two reservations -> cursor at start + 2500.
    expect(state.nextAllowedAt).toBe(1_000_000 + 2500);
  });
});

describe('RateLimitGate 429 handling', () => {
  it('honors Retry-After as a floor', async () => {
    const { g } = gate();
    const { waitMs } = await g.reportRateLimited('30');
    // floor ladder 60s beats the 30s hint
    expect(waitMs).toBe(60_000);
    const { waitMs: wait2 } = await g.reportRateLimited('999');
    expect(wait2).toBe(999_000);
  });

  it('escalates 60 -> 120 -> 240 -> 480 and caps at maxCooldown', async () => {
    const { g } = gate({ maxCooldownMs: 300_000 });
    expect((await g.reportRateLimited(null)).waitMs).toBe(60_000);
    expect((await g.reportRateLimited(null)).waitMs).toBe(120_000);
    expect((await g.reportRateLimited(null)).waitMs).toBe(240_000);
    expect((await g.reportRateLimited(null)).waitMs).toBe(300_000); // capped
  });

  it('parks the whole client: a second request waits at the gate during cooldown', async () => {
    const { g, t } = gate();
    await g.reportRateLimited('60');
    const p = g.acquire();
    let resolved = false;
    p.then(() => (resolved = true));
    await t.tick(30_000);
    await Promise.resolve();
    expect(resolved).toBe(false);
    await t.tick(40_000);
    await expect(p).resolves.toBeDefined();
    expect(resolved).toBe(true);
  });

  it('does not reset penalty after one success (decay needs a run of successes)', async () => {
    const { g } = gate({ decaySuccesses: 5 });
    await g.reportRateLimited(null);
    await g.reportRateLimited(null);
    const before = (await g.getStatus()).penaltyLevel;
    await g.reportSuccess();
    expect((await g.getStatus()).penaltyLevel).toBe(before);
    for (let i = 0; i < 4; i++) await g.reportSuccess();
    expect((await g.getStatus()).penaltyLevel).toBe(before - 1);
  });
});

describe('RateLimitGate circuit breaker', () => {
  it('opens at the threshold, fast-fails, then allows one half-open probe', async () => {
    const { g, t } = gate({ openThreshold: 3 });
    await g.reportRateLimited(null);
    await g.reportRateLimited(null);
    const { circuitOpened } = await g.reportRateLimited(null);
    expect(circuitOpened).toBe(true);
    expect((await g.getStatus()).circuitState).toBe('open');

    // While cooldown is active, requests fail immediately (no thundering herd).
    await expect(g.acquire()).rejects.toBeInstanceOf(PixivCircuitOpenError);

    // Elapse cooldown: one caller becomes the probe...
    t.advanceOnly(600_000);
    const probe = await g.acquire();
    expect(probe.probe).toBe(true);
    expect((await g.getStatus()).circuitState).toBe('half_open');
    // ...others are rejected while the probe is in flight.
    await expect(g.acquire()).rejects.toBeInstanceOf(PixivCircuitOpenError);

    // Probe succeeds -> closed.
    await g.reportSuccess();
    expect((await g.getStatus()).circuitState).toBe('closed');
  });

  it('reopens when the half-open probe fails', async () => {
    const { g, t } = gate({ openThreshold: 1 });
    await g.reportRateLimited(null);
    t.advanceOnly(600_000);
    await g.acquire(); // half-open probe
    await g.reportProbeFailure(60_000);
    expect((await g.getStatus()).circuitState).toBe('open');
  });
});

describe('RateLimitGate persistence', () => {
  it('persists state on 429 and restores the cooldown into a new gate', async () => {
    const store = new MemoryRateLimitStateStore();
    const { g, t } = gate({ stateStore: store, scope: 'acct-1' });
    await g.reportRateLimited('60');
    t.advanceOnly(5_000);

    // New process, same store/scope: cooldown is remembered.
    const t2 = virtualTime(t.now());
    const g2 = new RateLimitGate({
      stateStore: store,
      scope: 'acct-1',
      now: t2.now,
      sleep: t2.sleep,
      jitterRatio: 0,
      random: () => 0,
    });
    const status = await g2.getStatus();
    expect(status.cooldownRemainingMs).toBe(55_000);
    expect(status.penaltyLevel).toBe(1);
    // ...and acquiring after the cooldown elapses works (restart-safe).
    t2.advanceOnly(55_000);
    await expect(g2.acquire()).resolves.toEqual({ probe: false });
  });

  it('surfaces the persisted state shape for SQLite adapters', async () => {
    const store = new MemoryRateLimitStateStore();
    const { g } = gate({ stateStore: store });
    await g.reportRateLimited(null);
    const saved: RateLimitState | null = await store.load('default');
    expect(saved).toMatchObject({
      penaltyLevel: 1,
      last429At: expect.any(Number),
      circuitState: 'closed',
    });
  });
});

describe('RateLimitGate abort', () => {
  it('rejects an aborted wait with an abort error', async () => {
    const { g, t } = gate();
    // consume the first immediate slot
    void g.acquire();
    const controller = new AbortController();
    const p = g.acquire(controller.signal);
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'PixivAbortError' });
    void t;
  });
});
