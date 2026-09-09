import { setTimeout as delay } from 'node:timers/promises';

/**
 * Process-wide Pixiv rate-limit coordinator.
 *
 * Every Pixiv HTTP request routes through the SAME gate. On a 429 (or an
 * explicit Retry-After) the WHOLE client enters a cooldown: other candidate
 * requests due meanwhile wait at the gate instead of hammering Pixiv in
 * parallel, which is what produced inner*outer retry storms.
 */
export class RateLimitCoordinator {
  private nextAllowedAt = 0;
  private cooldownUntil = 0;
  private signals = 0;

  constructor(
    private readonly minIntervalMs: number = 500,
    private readonly defaultCooldownMs: number = 2_000,
    private readonly maxCooldownMs: number = 10 * 60_000,
    private readonly clock: () => number = () => Date.now()
  ) {}

  preflightDelay(now: number = this.clock()): number {
    const dueCooldown = Math.max(0, this.cooldownUntil - now);
    const duePace = Math.max(0, this.nextAllowedAt - now);
    return Math.max(dueCooldown, duePace);
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    const wait = this.preflightDelay();
    this.nextAllowedAt = this.clock() + Math.max(wait, this.minIntervalMs);
    if (wait > 0) await this.sleep(wait, signal);
  }

  reportRateLimited(retryAfter?: string | null, now: number = this.clock()): number {
    this.signals++;
    const hinted = parseRetryAfter(retryAfter, now);
    const base = hinted ?? Math.min(this.maxCooldownMs, this.defaultCooldownMs * 2 ** Math.min(this.signals - 1, 6));
    const until = now + Math.min(this.maxCooldownMs, Math.max(1000, base));
    this.cooldownUntil = Math.max(this.cooldownUntil, until);
    this.nextAllowedAt = Math.max(this.nextAllowedAt, until);
    return until - now;
  }

  reportSuccess(): void { this.signals = 0; }

  get cooldownRemainingMs(): number { return Math.max(0, this.cooldownUntil - this.clock()); }

  status(now: number = this.clock()) {
    return { cooldownUntil: this.cooldownUntil, cooldownRemainingMs: Math.max(0, this.cooldownUntil - now), signals: this.signals };
  }

  private async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    await delay(ms, undefined, signal ? { ref: false, signal } : { ref: false });
  }
}

function parseRetryAfter(value: string | null | undefined, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}