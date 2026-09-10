import { setTimeout as delay } from 'node:timers/promises';

import { PixivAbortError, PixivCircuitOpenError } from '../errors/errors';
import type { KitLogger } from '../logger';
import type {
  KitEventListener,
  RateLimitOptions,
  RateLimitState,
  RateLimitStateStore,
  RateLimitStatus,
} from '../types';

/** Conservative gate defaults (see packages/pixiv-client/README.md). */
export const DEFAULT_RATE_LIMIT: Required<
  Pick<
    RateLimitOptions,
    | 'minIntervalMs'
    | 'jitterRatio'
    | 'initialCooldownMs'
    | 'maxCooldownMs'
    | 'decaySuccesses'
    | 'openThreshold'
    | 'scope'
  >
> = {
  minIntervalMs: 1000,
  jitterRatio: 0.25,
  initialCooldownMs: 60_000,
  maxCooldownMs: 15 * 60_000,
  decaySuccesses: 20,
  openThreshold: 4,
  scope: 'default',
};

function freshState(now: number): RateLimitState {
  return {
    nextAllowedAt: 0,
    cooldownUntil: 0,
    penaltyLevel: 0,
    last429At: null,
    circuitState: 'closed',
    consecutiveSuccesses: 0,
    updatedAt: now,
  };
}

/** Process-local state store, used when the host injects no persistence. */
export class MemoryRateLimitStateStore implements RateLimitStateStore {
  private readonly map = new Map<string, RateLimitState>();
  load(scope: string): RateLimitState | null {
    return this.map.get(scope) ?? null;
  }
  save(scope: string, state: RateLimitState): void {
    // Clone so later in-place mutations cannot mutate the stored snapshot.
    this.map.set(scope, { ...state });
  }
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  delay(ms, undefined, signal ? { ref: false, signal } : { ref: false });

/**
 * The single shared gate for ALL Pixiv traffic of one client.
 *
 * Two responsibilities, both fixed here instead of spread across callers:
 *
 * 1. Pacing via SLOT RESERVATION. `acquire()` synchronously reserves the next
 *    send instant before it awaits anything. N concurrent callers therefore
 *    leave at t0, t0+interval, t0+2*interval ... instead of all waking from
 *    the same `nextAllowedAt` simultaneously (the old burst bug).
 *
 * 2. The global 429 cooldown + circuit breaker. A 429 anywhere parks the
 *    whole client (other requests wait at the gate, they do not fire); at
 *    openThreshold consecutive penalties the circuit opens and requests fast
 *    fail until one half-open probe succeeds.
 */
export class RateLimitGate {
  private readonly minIntervalMs: number;
  private readonly jitterRatio: number;
  private readonly initialCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly decaySuccesses: number;
  private readonly openThreshold: number;
  private readonly scope: string;
  private readonly store: RateLimitStateStore;
  private readonly clock: () => number;
  private readonly sleeper: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly random: () => number;
  private state: RateLimitState | null = null;
  private loaded: Promise<void> | null = null;
  /**
   * Reservation chain. Callers may REACH acquire() at different microtask
   * times (auth token fetch, coalescing), so synchronously mutating the slot
   * cursor is not enough: each caller must reserve strictly after the previous
   * caller reserved. The chain serializes ONLY the reservation, never the
   * request itself.
   */
  private reservationQueue: Promise<void> = Promise.resolve();

  /**
   * Synchronously warm the state from a state store whose load() is sync
   * (MemoryRateLimitStateStore, better-sqlite3, ...). Reservation in
   * {@link acquire} then happens with NO preceding await, which is what makes
   * concurrent callers serialize (A 0s, B 1s, C 2s ...).
   */
  preload(): void {
    if (this.state) return;
    try {
      const persisted = this.store.load(this.scope) as RateLimitState | null | Promise<RateLimitState | null>;
      if (persisted instanceof Promise) return; // truly async store: use ensureLoaded
      this.applyLoaded(persisted);
    } catch (e) {
      this.logger?.warn('rate-limit state load failed, starting fresh', { error: String(e) });
    }
  }

  constructor(
    options: RateLimitOptions = {},
    private readonly logger?: KitLogger,
    private readonly emit?: KitEventListener
  ) {
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_RATE_LIMIT.minIntervalMs;
    this.jitterRatio = options.jitterRatio ?? DEFAULT_RATE_LIMIT.jitterRatio;
    this.initialCooldownMs = options.initialCooldownMs ?? DEFAULT_RATE_LIMIT.initialCooldownMs;
    this.maxCooldownMs = options.maxCooldownMs ?? DEFAULT_RATE_LIMIT.maxCooldownMs;
    this.decaySuccesses = options.decaySuccesses ?? DEFAULT_RATE_LIMIT.decaySuccesses;
    this.openThreshold = options.openThreshold ?? DEFAULT_RATE_LIMIT.openThreshold;
    this.scope = options.scope ?? DEFAULT_RATE_LIMIT.scope;
    this.store = options.stateStore ?? new MemoryRateLimitStateStore();
    this.clock = options.now ?? (() => Date.now());
    this.sleeper = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    // Best-effort sync warmup: with a sync store this makes the very first
    // slot reservation synchronous too (no async-load burst at startup).
    this.preload();
  }

  private applyLoaded(persisted: RateLimitState | null): void {
    const now = this.clock();
    this.state = persisted ?? freshState(now);
    // A process restart lands in HALF_OPEN with an expired cooldown:
    // normalise to CLOSED so the gate is usable; an OPEN with remaining
    // cooldown stays OPEN.
    if (this.state.circuitState === 'half_open' && this.state.cooldownUntil <= now) {
      this.state.circuitState = 'closed';
    }
  }

  private async ensureLoaded(): Promise<RateLimitState> {
    if (this.state) return this.state;
    if (!this.loaded) {
      this.loaded = Promise.resolve(this.store.load(this.scope)).then((persisted) => {
        if (!this.state) this.applyLoaded(persisted);
      });
    }
    await this.loaded;
    return this.state!;
  }

  private persist(): void {
    if (!this.state) return;
    this.state.updatedAt = this.clock();
    try {
      const result = this.store.save(this.scope, { ...this.state });
      if (result instanceof Promise) result.catch((e) => this.logger?.warn('rate-limit state save failed', { error: String(e) }));
    } catch (e) {
      this.logger?.warn('rate-limit state save failed', { error: String(e) });
    }
  }

  /** Test/inspection helper. */
  async getState(): Promise<RateLimitState> {
    return this.ensureLoaded();
  }

  /**
   * Reserve a send slot and wait until it becomes due.
   * Throws PixivCircuitOpenError while OPEN and the cooldown has not elapsed;
   * when it has elapsed exactly one caller transitions to HALF_OPEN and acts
   * as the probe; further callers fast-fail until the probe resolves.
   */
  async acquire(signal?: AbortSignal): Promise<{ probe: boolean }> {
    if (signal?.aborted) throw new PixivAbortError('aborted before rate-limit slot');

    // Serialize the decision + reservation; the actual sleep happens AFTER
    // releasing the queue, so requests still overlap on the wire while send
    // times are strictly t, t+i, t+2i ... (never a t+i burst).
    const previous = this.reservationQueue;
    let release: () => void = () => {};
    this.reservationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    let waitMs: number;
    let probe = false;
    try {
      if (!this.state) await this.ensureLoaded();
      const s = this.state!;
      const now = this.clock();

      if (s.circuitState === 'open') {
        if (now < s.cooldownUntil) {
          throw new PixivCircuitOpenError('Pixiv rate-limit circuit is open', {
            retryAfterMs: s.cooldownUntil - now,
          });
        }
        // Cooldown elapsed: allow exactly one probe.
        s.circuitState = 'half_open';
        probe = true;
        this.emit?.({ type: 'circuit_half_open' });
        this.persist();
      } else if (s.circuitState === 'half_open') {
        throw new PixivCircuitOpenError('Pixiv rate-limit circuit half-open probe in flight', {
          retryAfterMs: Math.max(0, s.cooldownUntil - now),
        });
      }

      const scheduledAt = Math.max(now, s.nextAllowedAt, s.cooldownUntil);
      const jitter = this.minIntervalMs * this.jitterRatio * this.random();
      s.nextAllowedAt = scheduledAt + this.minIntervalMs + jitter;
      waitMs = scheduledAt - now;
    } finally {
      release();
    }

    if (waitMs > 0) {
      try {
        await this.sleeper(waitMs, signal);
      } catch {
        throw new PixivAbortError('aborted while waiting for rate-limit slot');
      }
      // Re-validate after sleeping: a 429 from a request that was IN FLIGHT
      // while this slot was reserved may have moved cooldownUntil forward.
      // Without this check, callers whose pacing slots were booked before the
      // 429 arrived would fire straight through the new cooldown.
      if (this.state) {
        const now2 = this.clock();
        if (this.state.circuitState === 'open' && now2 < this.state.cooldownUntil) {
          throw new PixivCircuitOpenError('Pixiv rate-limit circuit opened while waiting for a slot', {
            retryAfterMs: this.state.cooldownUntil - now2,
          });
        }
        if (now2 < this.state.cooldownUntil) {
          return this.acquire(signal);
        }
      }
    }
    return { probe };
  }

  /**
   * A half-open probe failed for ANY reason (429 or transient). Reopen the
   * circuit with a fresh cooldown rather than declaring health on one 5xx.
   */
  async reportProbeFailure(waitMs: number): Promise<void> {
    const s = await this.ensureLoaded();
    if (s.circuitState !== 'half_open') return;
    const now = this.clock();
    s.circuitState = 'open';
    s.cooldownUntil = Math.max(s.cooldownUntil, now + waitMs);
    s.nextAllowedAt = Math.max(s.nextAllowedAt, s.cooldownUntil);
    this.emit?.({ type: 'circuit_opened', until: s.cooldownUntil });
    this.persist();
  }

  /**
   * Record a 429 and compute the cooldown that was applied globally.
   * Retry-After is always respected as a floor; the exponential ladder is
   * 60s -> 120s -> 240s -> 480s ... capped at maxCooldownMs.
   */
  async reportRateLimited(retryAfterHeader?: string | null): Promise<{ waitMs: number; circuitOpened: boolean }> {
    const s = await this.ensureLoaded();
    const now = this.clock();
    s.penaltyLevel += 1;
    s.consecutiveSuccesses = 0;
    s.last429At = now;

    const hintedMs = parseRetryAfter(retryAfterHeader, now);
    const ladder = this.initialCooldownMs * 2 ** Math.max(0, s.penaltyLevel - 1);
    const jitteredLadder = ladder * (1 + this.random() * this.jitterRatio);
    const computed = Math.min(this.maxCooldownMs, jitteredLadder);
    const waitMs = Math.max(hintedMs ?? 0, computed);

    const wasOpen = s.circuitState === 'open';
    s.cooldownUntil = Math.max(s.cooldownUntil, now + waitMs);
    s.nextAllowedAt = Math.max(s.nextAllowedAt, s.cooldownUntil);

    let circuitOpened = false;
    if (s.penaltyLevel >= this.openThreshold && s.circuitState !== 'open') {
      s.circuitState = 'open';
      circuitOpened = true;
    } else if (s.circuitState === 'half_open') {
      // Probe failed: reopen.
      s.circuitState = 'open';
      circuitOpened = true;
    }

    this.emit?.({
      type: 'rate_limited',
      endpoint: '',
      retryAfterMs: waitMs,
      penaltyLevel: s.penaltyLevel,
    });
    this.emit?.({ type: 'cooldown_started', until: s.cooldownUntil, penaltyLevel: s.penaltyLevel });
    if (circuitOpened && !wasOpen) this.emit?.({ type: 'circuit_opened', until: s.cooldownUntil });
    this.logger?.warn('Pixiv rate limit cooldown', {
      penaltyLevel: s.penaltyLevel,
      waitSec: Math.round(waitMs / 1000),
      circuitState: s.circuitState,
    });
    this.persist();
    return { waitMs, circuitOpened };
  }

  /**
   * Record a successful response. The penalty level only DECAYS after a run of
   * consecutive successes — one lucky 200 never clears the punishment. A
   * successful half-open probe closes the circuit and buys one decay step.
   */
  async reportSuccess(): Promise<void> {
    const s = await this.ensureLoaded();
    const wasHalfOpen = s.circuitState === 'half_open';
    s.consecutiveSuccesses += 1;

    let changed = wasHalfOpen;
    if (wasHalfOpen) {
      s.circuitState = 'closed';
      s.penaltyLevel = Math.max(0, s.penaltyLevel - 1);
      s.consecutiveSuccesses = 0;
      this.emit?.({ type: 'circuit_closed' });
      this.logger?.info('Pixiv rate-limit probe succeeded, circuit closed');
    } else if (s.penaltyLevel > 0 && s.consecutiveSuccesses >= this.decaySuccesses) {
      s.penaltyLevel -= 1;
      s.consecutiveSuccesses = 0;
      changed = true;
    }
    if (changed) this.persist();
  }

  async getStatus(): Promise<RateLimitStatus> {
    const s = await this.ensureLoaded();
    const now = this.clock();
    return {
      circuitState: s.circuitState,
      cooldownRemainingMs: Math.max(0, s.cooldownUntil - now),
      penaltyLevel: s.penaltyLevel,
      last429At: s.last429At,
      nextAllowedInMs: Math.max(0, s.nextAllowedAt - now),
    };
  }
}

export function parseRetryAfter(value: string | null | undefined, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
