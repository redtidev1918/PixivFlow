/**
 * Per-request timeout *composition* with a caller/run AbortSignal.
 *
 * Contract: the signal handed to `fetch` must abort when EITHER
 *   - the caller's run signal aborts (scheduler cancellation), OR
 *   - the per-request timeout elapses,
 * whichever fires first. A caller signal must never *disable* the timeout.
 *
 * `TargetSearchRunner` threads the scheduler run signal into the kit search
 * calls on the documented assumption that "the transport already combines a
 * signal with its per-request timeout". These tests pin that assumption down
 * with zero network access: the fake fetch below never settles on its own.
 *
 * Fidelity note (Node 24 / undici, verified empirically):
 *   - `controller.abort(reason)` makes fetch reject with `reason` itself;
 *   - `controller.abort()` makes fetch reject with a DOMException AbortError.
 * The fake fetch mirrors both shapes so the transport classifies what it
 * actually sees in production.
 */
import { PixivClient } from '../../client';
import { StaticTokenProvider } from '../../auth/types';
import type { FetchLike } from '../../types';
import { PixivAbortError, PixivNetworkError, PixivTimeoutError } from '../../errors/errors';

const PER_REQUEST_TIMEOUT_MS = 80;
/** Generous relative to PER_REQUEST_TIMEOUT_MS, tiny relative to jest's 15s. */
const SETTLE_BUDGET_MS = 1_200;

type SettleOutcome = { settled: true; error?: unknown } | { settled: false };

/** Resolves as soon as `p` settles; reports `settled: false` on the deadline. */
function settleWithin(p: Promise<unknown>, ms: number): Promise<SettleOutcome> {
  return new Promise<SettleOutcome>((resolve) => {
    const timer = setTimeout(() => resolve({ settled: false }), ms);
    p.then(
      () => {
        clearTimeout(timer);
        resolve({ settled: true });
      },
      (error) => {
        clearTimeout(timer);
        resolve({ settled: true, error });
      }
    );
  });
}

/**
 * A fetch that hangs until its signal aborts, then rejects exactly the way
 * undici rejects (with the signal reason, or a DOMException named AbortError).
 * It never applies a timeout of its own: the transport must supply one.
 */
function hangingFetch(counter: { calls: number }): FetchLike {
  return async (_url, init) => {
    counter.calls++;
    const signal = init.signal ?? undefined;
    await new Promise<never>((_resolve, reject) => {
      const rejectLikeUndici = (): void => {
        const reason: unknown = signal?.reason;
        if (reason !== undefined && reason !== null) {
          reject(reason);
          return;
        }
        const e = new Error('This operation was aborted');
        e.name = 'AbortError';
        reject(e);
      };
      if (signal?.aborted) {
        rejectLikeUndici();
        return;
      }
      signal?.addEventListener('abort', rejectLikeUndici, { once: true });
    });
    throw new Error('unreachable');
  };
}

function makeClient(fetchImpl: FetchLike, retries = 0): PixivClient {
  return new PixivClient({
    auth: new StaticTokenProvider('test-token'),
    fetchImpl,
    retries,
    timeoutMs: PER_REQUEST_TIMEOUT_MS,
    rateLimit: {
      minIntervalMs: 0,
      jitterRatio: 0,
      initialCooldownMs: 60_000,
      maxCooldownMs: 900_000,
      openThreshold: 10,
      decaySuccesses: 99,
      random: () => 0,
    },
  });
}

function errorOf(outcome: SettleOutcome): unknown {
  return outcome.settled ? outcome.error : undefined;
}

describe('per-request timeout survives a caller/run signal', () => {
  it('a hung search request still times out while a run signal is attached', async () => {
    const counter = { calls: 0 };
    const client = makeClient(hangingFetch(counter));
    const run = new AbortController(); // attached, NOT aborted

    const call = client.illustrations.searchPage({ word: 'test', limit: 1, signal: run.signal }, null);
    const outcome = await settleWithin(call, SETTLE_BUDGET_MS);

    // Regression: with a caller signal the per-request timeout used to be
    // skipped entirely, so this promise stayed pending until the whole
    // schedule timed out.
    expect(outcome.settled).toBe(true);
    expect(errorOf(outcome)).toBeInstanceOf(PixivTimeoutError);
  });

  it('a hung media fetch still times out while a run signal is attached', async () => {
    const counter = { calls: 0 };
    const client = makeClient(hangingFetch(counter));

    const call = client.media.fetch('https://i.pximg.net/img-original/img/x.jpg', {
      signal: new AbortController().signal,
    });
    const outcome = await settleWithin(call, SETTLE_BUDGET_MS);

    expect(outcome.settled).toBe(true);
    expect(errorOf(outcome)).toBeInstanceOf(PixivTimeoutError);
  });

  it('aborting the run signal still cancels the request, with no timeout masking it', async () => {
    const counter = { calls: 0 };
    const client = makeClient(hangingFetch(counter));
    const run = new AbortController();

    const call = client.illustrations.searchPage({ word: 'test', limit: 1, signal: run.signal }, null);
    setTimeout(() => run.abort(), 10);

    const outcome = await settleWithin(call, SETTLE_BUDGET_MS);
    expect(outcome.settled).toBe(true);
    expect(errorOf(outcome)).toBeInstanceOf(PixivAbortError);
    expect(counter.calls).toBe(1);
  });

  it('cancels promptly when the run signal aborts during retry back-off', async () => {
    let calls = 0;
    const client = makeClient(
      async () => {
        calls++;
        throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
      },
      3
    );

    const run = new AbortController();
    const call = client.illustrations.searchPage({ word: 'test', limit: 1, signal: run.signal }, null);
    setTimeout(() => run.abort(), 30);

    const outcome = await settleWithin(call, SETTLE_BUDGET_MS);
    expect(outcome.settled).toBe(true);
    expect(errorOf(outcome)).toBeInstanceOf(PixivAbortError);
    // The back-off must not be waited out and the retry budget must not be burned.
    expect(calls).toBe(1);
  });

  it('keeps retrying transient network failures while the run signal stays active', async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls++;
      throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    }, 2);

    const run = new AbortController();
    const call = client.illustrations.searchPage({ word: 'test', limit: 1, signal: run.signal }, null);
    const outcome = await settleWithin(call, 4_000);

    expect(outcome.settled).toBe(true);
    expect(errorOf(outcome)).toBeInstanceOf(PixivNetworkError);
    expect(calls).toBe(3); // retries honoured: an attached signal is not a cancellation
  });

  it('removes its abort listener from the caller signal once the request settles', async () => {
    const counter = { calls: 0 };
    const client = makeClient(hangingFetch(counter));
    const run = new AbortController();
    const added = jest.spyOn(run.signal, 'addEventListener');
    const removed = jest.spyOn(run.signal, 'removeEventListener');

    const call = client.illustrations.searchPage({ word: 'test', limit: 1, signal: run.signal }, null);
    const outcome = await settleWithin(call, SETTLE_BUDGET_MS);
    expect(outcome.settled).toBe(true);

    expect(added).toHaveBeenCalled();
    // No listener leak: every abort listener added is taken off again.
    expect(removed.mock.calls.length).toBe(added.mock.calls.length);

    // Already settled: aborting afterwards must not reject anything a second time.
    expect(() => run.abort()).not.toThrow();
  });

  it('without a caller signal the per-request timeout is unchanged', async () => {
    const counter = { calls: 0 };
    const client = makeClient(hangingFetch(counter));

    const call = client.illustrations.searchPage({ word: 'test', limit: 1 });
    const outcome = await settleWithin(call, SETTLE_BUDGET_MS);

    expect(outcome.settled).toBe(true);
    expect(errorOf(outcome)).toBeInstanceOf(PixivTimeoutError);
  });

  it('clears the per-request timer once the request settles', async () => {
    jest.useFakeTimers();
    try {
      const counter = { calls: 0 };
      const client = makeClient(hangingFetch(counter));
      const baseline = jest.getTimerCount();

      const call = client.illustrations.searchPage({ word: 'test', limit: 1 });
      void call.catch(() => undefined); // observed below via rejects
      expect(jest.getTimerCount()).toBeGreaterThan(baseline); // timeout armed

      await jest.advanceTimersByTimeAsync(PER_REQUEST_TIMEOUT_MS);

      await expect(call).rejects.toBeInstanceOf(PixivTimeoutError);
      // No leaked timer: `cancel()` in the finally block cleared it.
      expect(jest.getTimerCount()).toBe(baseline);
    } finally {
      jest.useRealTimers();
    }
  });

  it('settles once and rejects nothing else when a run signal aborts first', async () => {
    const counter = { calls: 0 };
    const client = makeClient(hangingFetch(counter));
    const run = new AbortController();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      // A plain string reason, exactly as DownloadManager.cancel() passes it.
      const call = client.illustrations.searchPage({ word: 'test', limit: 1, signal: run.signal }, null);
      run.abort('run cancelled');

      const outcome = await settleWithin(call, SETTLE_BUDGET_MS);
      expect(outcome.settled).toBe(true);
      expect(errorOf(outcome)).toBeInstanceOf(PixivAbortError);

      // Outlive the per-request deadline: the cleared timer must not abort (or
      // reject) anything a second time.
      await new Promise((resolve) => setTimeout(resolve, PER_REQUEST_TIMEOUT_MS * 2));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
