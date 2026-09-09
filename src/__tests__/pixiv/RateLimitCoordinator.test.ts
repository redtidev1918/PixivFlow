/**
 * RateLimitCoordinator: one shared gate for all Pixiv requests.
 */
import { RateLimitCoordinator } from "../../pixiv/RateLimitCoordinator";

describe("RateLimitCoordinator", () => {
  let now: number;
  let clock: () => number;
  beforeEach(() => {
    now = 1_000_000;
    clock = () => now;
  });

  it("does not pace requests when minInterval is 0 (default)", () => {
    const rl = new RateLimitCoordinator(0, 2000, 600000, clock);
    expect(rl.preflightDelay(now)).toBe(0);
  });

  it("parks the whole client on a 429 for at least the default cooldown", () => {
    const rl = new RateLimitCoordinator(0, 2000, 600000, clock);
    const wait = rl.reportRateLimited(null, now);
    expect(wait).toBe(2000);
    expect(rl.preflightDelay(now)).toBe(2000);
    expect(rl.preflightDelay(now + 1000)).toBe(1000);
    expect(rl.preflightDelay(now + 2000)).toBe(0);
  });

  it("honors Retry-After seconds", () => {
    const rl = new RateLimitCoordinator(0, 2000, 600000, clock);
    const wait = rl.reportRateLimited("30", now);
    expect(wait).toBe(30_000);
  });

  it("escalates on repeated 429s and caps at max", () => {
    const rl = new RateLimitCoordinator(0, 2000, 60_000, clock);
    expect(rl.reportRateLimited(null, now)).toBe(2000);
    expect(rl.reportRateLimited(null, now)).toBe(4000);
    for (let i = 0; i < 8; i++) rl.reportRateLimited(null, now);
    expect(rl.cooldownRemainingMs).toBeLessThanOrEqual(60_000);
    expect(rl.cooldownRemainingMs).toBe(60_000);
  });

  it("resets escalation after a successful response (cooldown still elapses)", () => {
    const rl = new RateLimitCoordinator(0, 2000, 600000, clock);
    rl.reportRateLimited(null, now);
    rl.reportSuccess();
    expect(rl.reportRateLimited(null, now)).toBe(2000);
  });
});
