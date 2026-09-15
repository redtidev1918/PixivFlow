/**
 * Resource-scoped execution admission (§resource-governance).
 *
 * Concurrency is governed by the constrained RESOURCE a work item consumes
 * (today: a Pixiv account), never by bot, schedule or target. Every work item
 * that touches the scarce upstream — scheduled acquisition, fallback passes,
 * manual refetch, manual normal/relaxed recovery — declares the resource key
 * it needs and passes through this same bounded-capacity admission.
 *
 * Design constraints honoured here:
 *
 *  - Resource identity is a stable internal profile key (e.g.
 *    `pixiv-account:<accountId>`). Tokens/cookies/session values are never a
 *    resource key and never appear in logs.
 *  - Capacity is config-driven per resource identity; the scheduler code does
 *    not hardcode `1`.
 *  - Waiting is FIFO (arrival order) per resource key, so no producer is
 *    starved. Capacity is checked at the moment a lease is handed out, so a
 *    single process never exceeds `capacity` active leases for one key.
 *  - Different resource identities never block each other: account A and
 *    account B run concurrently under independent capacities (no global lock).
 *  - Waiting is NOT a failure: `acquire` resolves with `null` only when the
 *    bounded wait queue itself is full (the caller then leaves the work in its
 *    durable ledger for the recovery sweep). A queued work item is unfinished
 *    work — it must keep the idle-detector from shutting the worker down
 *    (see `waitingTotal` on the idle snapshot).
 *
 * Implementation level matches the production topology: one PixivFlow process
 * owns the whole ledger on one machine, so an in-process FIFO semaphore is the
 * correct mechanism. A durable/distributed lease would only be needed if the
 * same resource could be consumed by multiple processes at once.
 */
export interface ResourceLease {
  release(): void;
}

interface WaitingEntry {
  resourceKey: string;
  resolve: (lease: ResourceLease | null) => void;
}

/**
 * FIFO per-resource admission with config-driven capacity.
 *
 * `capacityOf(resourceKey)` returns the configured capacity for that key
 * (default 1). `maxWaiting` bounds the TOTAL number of parked work items
 * across all resources, mirroring the legacy `schedulerRuntime.queueLimit`
 * guard against an unbounded backlog.
 */
export class ResourceAdmission {
  private readonly active = new Map<string, number>();
  private readonly waiting: WaitingEntry[] = [];

  constructor(
    private readonly capacityOf: (resourceKey: string) => number,
    private maxWaiting = 8
  ) {}

  public setMaxWaiting(maxWaiting: number): void {
    this.maxWaiting = Math.max(0, maxWaiting);
  }

  /**
   * Acquire a lease on `resourceKey`. Resolves immediately when capacity is
   * available, parks the caller in a FIFO per-key queue otherwise, and resolves
   * `null` (never rejects) when the bounded wait queue is full.
   */
  public acquire(resourceKey: string): Promise<ResourceLease | null> {
    if (this.activeCount(resourceKey) < this.capacityOf(resourceKey)) {
      this.active.set(resourceKey, this.activeCount(resourceKey) + 1);
      return Promise.resolve(this.createLease(resourceKey));
    }
    if (this.waiting.length >= this.maxWaiting) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      this.waiting.push({ resourceKey, resolve });
    });
  }

  private createLease(resourceKey: string): ResourceLease {
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.releaseNext(resourceKey);
      },
    };
  }

  private releaseNext(resourceKey: string): void {
    // Hand the freed slot to the OLDEST waiter for this resource key (FIFO),
    // skipping waiters of other resources so they never block this one.
    const index = this.waiting.findIndex((entry) => entry.resourceKey === resourceKey);
    if (index === -1) {
      const remaining = Math.max(0, this.activeCount(resourceKey) - 1);
      this.active.set(resourceKey, remaining);
      return;
    }
    const [entry] = this.waiting.splice(index, 1);
    entry.resolve(this.createLease(resourceKey));
  }

  /** Active leases for one resource key. */
  public activeCount(resourceKey: string): number {
    return this.active.get(resourceKey) ?? 0;
  }

  /** Work items parked waiting for one resource key. */
  public waitingCount(resourceKey: string): number {
    return this.waiting.filter((entry) => entry.resourceKey === resourceKey).length;
  }

  /** Work items parked waiting for ANY resource. Unfinished work, not failure. */
  public waitingTotal(): number {
    return this.waiting.length;
  }
}

/** The canonical resource identity for the process's Pixiv credential profile. */
export function pixivAccountResourceKey(accountId: string | undefined): string {
  return `pixiv-account:${(accountId ?? 'default').trim() || 'default'}`;
}