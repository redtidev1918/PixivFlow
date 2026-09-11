/**
 * External-worker run-to-completion lifecycle tests.
 *
 * The contract under test is narrow on purpose: the lifecycle must never exit
 * while the worker's own durable ledger still holds work, must exit once the
 * ledger is empty and the grace window has elapsed, and must never let a broken
 * probe or a wedged run hold the machine open past the hard backstop.
 */
import {
  DEFAULT_IDLE_GRACE_MS,
  DEFAULT_MAX_LIFETIME_MS,
  IdleSnapshot,
  SchedulerIdleLifecycle,
  isIdle,
} from '../../commands/SchedulerIdleLifecycle';

const IDLE: IdleSnapshot = { activeSlots: 0, processingOutbox: 0, pendingOutbox: 0 };

const POLL_MS = 15_000;
const GRACE_MS = 60_000;

describe('isIdle', () => {
  it('requires every counter to be zero', () => {
    expect(isIdle(IDLE)).toBe(true);
    expect(isIdle({ ...IDLE, activeSlots: 1 })).toBe(false);
    expect(isIdle({ ...IDLE, processingOutbox: 1 })).toBe(false);
    expect(isIdle({ ...IDLE, pendingOutbox: 1 })).toBe(false);
  });

  it('exposes safe defaults', () => {
    expect(DEFAULT_IDLE_GRACE_MS).toBe(10 * 60 * 1000);
    expect(DEFAULT_MAX_LIFETIME_MS).toBe(3 * 60 * 60 * 1000);
  });
});

describe('SchedulerIdleLifecycle', () => {
  let snapshot: IdleSnapshot;
  let onExit: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    snapshot = { ...IDLE };
    onExit = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const build = (overrides: Partial<{ idleGraceMs: number; maxLifetimeMs: number; pollMs: number }> = {}) =>
    new SchedulerIdleLifecycle({
      snapshot: () => snapshot,
      onExit,
      idleGraceMs: GRACE_MS,
      maxLifetimeMs: DEFAULT_MAX_LIFETIME_MS,
      pollMs: POLL_MS,
      ...overrides,
    });

  it('exits with reason "idle" only after the full grace window elapses', () => {
    const lifecycle = build();
    lifecycle.start();

    // Grace starts at the first idle observation (t=15s), so the exit is due at
    // t=75s — not at t=60s.
    jest.advanceTimersByTime(60_000);
    expect(onExit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(15_000);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith('idle');
  });

  it('stays awake while a non-terminal Slot is still owned by the ledger', () => {
    snapshot = { activeSlots: 1, processingOutbox: 0, pendingOutbox: 0 };
    const lifecycle = build();
    lifecycle.start();

    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('stays awake while an outbox row is in flight or waiting on backoff', () => {
    const processing = build();
    snapshot = { activeSlots: 0, processingOutbox: 1, pendingOutbox: 0 };
    processing.start();
    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(onExit).not.toHaveBeenCalled();

    onExit.mockClear();
    const retrying = build();
    snapshot = { activeSlots: 0, processingOutbox: 0, pendingOutbox: 1 };
    retrying.start();
    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('restarts the grace window when new work appears mid-grace', () => {
    const lifecycle = build();
    lifecycle.start();

    // Idle from t=15s, so the original window would close at t=75s.
    jest.advanceTimersByTime(45_000);
    snapshot = { activeSlots: 1, processingOutbox: 0, pendingOutbox: 0 };
    jest.advanceTimersByTime(15_000); // t=60s: busy cancels the window
    expect(onExit).not.toHaveBeenCalled();

    snapshot = { ...IDLE };
    jest.advanceTimersByTime(15_000); // t=75s: idle again, window restarts here
    jest.advanceTimersByTime(55_000); // t=130s: only 55s into the new window
    expect(onExit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5_000); // t=135s: new window complete
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith('idle');
  });

  it('exits on the maxLifetimeMs backstop even with work outstanding', () => {
    snapshot = { activeSlots: 1, processingOutbox: 1, pendingOutbox: 2 };
    const lifecycle = build({ maxLifetimeMs: 120_000 });
    lifecycle.start();

    jest.advanceTimersByTime(119_000);
    expect(onExit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1_000);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith('max-lifetime');

    // A backstop fires once; the poller must not resurrect the exit.
    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('treats a failed probe as "still awake" rather than as idleness', () => {
    let calls = 0;
    const lifecycle = new SchedulerIdleLifecycle({
      snapshot: () => {
        calls += 1;
        if (calls <= 2) throw new Error('database is locked');
        return { ...IDLE };
      },
      onExit,
      idleGraceMs: GRACE_MS,
      maxLifetimeMs: DEFAULT_MAX_LIFETIME_MS,
      pollMs: POLL_MS,
    });
    lifecycle.start();

    jest.advanceTimersByTime(45_000); // two throwing polls
    expect(onExit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(60_000); // recovery: idle from t=45s, due at t=105s
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith('idle');
  });

  it('exits on the first poll when the grace window is zero', () => {
    const lifecycle = build({ idleGraceMs: 0 });
    lifecycle.start();

    jest.advanceTimersByTime(POLL_MS);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith('idle');
  });

  it('disarms polling and the backstop on stop()', () => {
    const lifecycle = build();
    lifecycle.start();
    lifecycle.stop();

    jest.advanceTimersByTime(DEFAULT_MAX_LIFETIME_MS + GRACE_MS);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('start() is idempotent', () => {
    const lifecycle = build();
    lifecycle.start();
    lifecycle.start();

    jest.advanceTimersByTime(GRACE_MS + POLL_MS);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
