/**
 * Run-to-completion lifecycle for the external-clock (autosleep) deployment.
 *
 * A PixivFlow machine can be woken by an authenticated HTTP trigger, execute a
 * schedule, deliver through the durable outbox, and must then return to
 * `stopped` on its own. Two things make that non-trivial:
 *
 *  - Platform-side auto-stop cannot be used. The trigger endpoint answers as
 *    soon as the occurrence is durable (deliberately — a 10-40 minute run cannot
 *    survive a router/proxy/client timeout), so from the proxy's point of view
 *    the machine goes idle while the run is still in progress. Auto-stop would
 *    kill a download mid-flight.
 *  - "The request returned" and "nobody connected recently" are both wrong
 *    signals. HTTP activity says nothing about whether a download is still
 *    running, a Slot is still open, or an outbox row is still retrying.
 *
 * So this reads the worker's OWN durable ledger instead, and exits only when
 * that ledger says nothing is left: no non-terminal Slot, no in-flight outbox
 * row, no undelivered outbox row. It is deliberately the only thing it does —
 * no second business state machine, no scheduler of its own, no queue.
 *
 * The idle grace is a merge window, not a timeout: two schedules ten minutes
 * apart are normally served by a single wake-up, and a delivery retry that lands
 * just after the run is drained without paying for a second cold start.
 *
 * `maxLifetimeMs` is a backstop, never the normal path. It exists so a worker
 * that somehow never reaches idle (a wedged run, a Slot that recovery cannot
 * re-dispatch) cannot bill indefinitely. Reaching it deletes nothing: the
 * process closes its database cleanly and the next wake resumes from the same
 * Slot/outbox rows.
 */

import { logger } from '../logger';

export type IdleExitReason = 'idle' | 'max-lifetime';

/**
 * A read-only view of the worker's own authoritative state. Every field must be
 * derived from durable rows, never from in-memory scheduling or HTTP activity.
 */
export interface IdleSnapshot {
  /** Non-terminal Slots (pending/running): work this ledger still owes. */
  activeSlots: number;
  /** Outbox rows currently claimed by this or another live worker. */
  processingOutbox: number;
  /** Undelivered outbox rows (pending, or waiting on a bounded retry backoff). */
  pendingOutbox: number;
}

/** True only when the worker has no work of any kind left. */
export function isIdle(snapshot: IdleSnapshot): boolean {
  return (
    snapshot.activeSlots === 0 &&
    snapshot.processingOutbox === 0 &&
    snapshot.pendingOutbox === 0
  );
}

/** Default idle grace: long enough to merge two schedules ~10 minutes apart. */
export const DEFAULT_IDLE_GRACE_MS = 10 * 60 * 1000;
/** Default backstop on awake time; the idle detector is the normal exit path. */
export const DEFAULT_MAX_LIFETIME_MS = 3 * 60 * 60 * 1000;
/** How often the durable ledger is re-read. */
export const DEFAULT_IDLE_POLL_MS = 15 * 1000;

export interface IdleLifecycleOptions {
  /** Reads the worker's authoritative state. Must not mutate anything. */
  snapshot(): IdleSnapshot;
  /**
   * Invoked at most once, either on real idleness or on the hard backstop. The
   * caller owns the shutdown itself (stop serving, flush, exit).
   */
  onExit(reason: IdleExitReason): void;
  idleGraceMs?: number;
  maxLifetimeMs?: number;
  pollMs?: number;
}

export class SchedulerIdleLifecycle {
  private readonly idleGraceMs: number;
  private readonly maxLifetimeMs: number;
  private readonly pollMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private lifetimeTimer: NodeJS.Timeout | null = null;
  private idleSince: number | null = null;
  private exiting = false;

  constructor(private readonly options: IdleLifecycleOptions) {
    this.idleGraceMs = options.idleGraceMs ?? DEFAULT_IDLE_GRACE_MS;
    this.maxLifetimeMs = options.maxLifetimeMs ?? DEFAULT_MAX_LIFETIME_MS;
    this.pollMs = options.pollMs ?? DEFAULT_IDLE_POLL_MS;
  }

  /** Arm polling and the backstop. Idempotent. */
  public start(): void {
    if (this.pollTimer || this.lifetimeTimer) return;
    logger.info('External worker lifecycle armed; will exit once real idleness is confirmed', {
      idleGraceMs: this.idleGraceMs,
      maxLifetimeMs: this.maxLifetimeMs,
      pollMs: this.pollMs,
    });
    this.lifetimeTimer = setTimeout(() => this.exit('max-lifetime'), this.maxLifetimeMs);
    this.pollTimer = setInterval(() => this.poll(), this.pollMs);
  }

  /** Disarm without exiting. Idempotent; used by the signal shutdown path. */
  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.lifetimeTimer) {
      clearTimeout(this.lifetimeTimer);
      this.lifetimeTimer = null;
    }
  }

  private poll(): void {
    if (this.exiting) return;

    let snapshot: IdleSnapshot;
    try {
      snapshot = this.options.snapshot();
    } catch (error) {
      // A failed read is NOT evidence of idleness. Stay awake and retry; the
      // backstop still bounds how long a broken probe can hold the machine.
      logger.warn('Idle probe failed; staying awake and will retry', {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (!isIdle(snapshot)) {
      if (this.idleSince !== null) {
        logger.info('External worker picked up new work; idle grace window cancelled', { ...snapshot });
      }
      this.idleSince = null;
      return;
    }

    if (this.idleGraceMs === 0) {
      this.exit('idle');
      return;
    }

    const now = Date.now();
    if (this.idleSince === null) {
      this.idleSince = now;
      logger.info('External worker idle; starting exit grace window', {
        idleGraceMs: this.idleGraceMs,
        ...snapshot,
      });
      return;
    }
    if (now - this.idleSince >= this.idleGraceMs) {
      this.exit('idle');
    }
  }

  private exit(reason: IdleExitReason): void {
    if (this.exiting) return;
    this.exiting = true;
    this.stop();
    this.options.onExit(reason);
  }
}
