/**
 * Resource-scoped execution admission tests (§resource-governance, §tests).
 *
 * The contract under test:
 *  1. Concurrency is bounded by the RESOURCE identity, not by bot/schedule/target.
 *  2. Four simultaneous work items on one resource with capacity 1 never run
 *     more than one at a time, and all of them eventually run (FIFO).
 *  3. Different resource identities have INDEPENDENT capacities and run
 *     concurrently (no global lock).
 *  4. Every producer (schedule / manual refetch / manual recovery) shares the
 *     same mechanism because they all pass through this admission.
 *  5. Waiting is not failure: a queued work item resolves when capacity frees,
 *     and the bounded wait queue reports `null` only when it is full.
 */
import { ResourceAdmission, pixivAccountResourceKey } from '../../scheduler/ResourceAdmission';

const PIXIV_DEFAULT = pixivAccountResourceKey('default');

/** Small helper: a work item that records its own concurrency window. */
class Probe {
  public active = 0;
  public maxActive = 0;
  public readonly order: string[] = [];

  constructor(private readonly admission: ResourceAdmission, private readonly key: string) {}

  public async run(name: string, work: () => Promise<void> = async () => {}): Promise<void> {
    const lease = await this.admission.acquire(this.key);
    if (!lease) throw new Error(`${name} was not admitted (queue full)`);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    this.order.push(`start:${name}`);
    try {
      await work();
    } finally {
      this.order.push(`end:${name}`);
      this.active -= 1;
      lease.release();
    }
  }
}

describe('ResourceAdmission', () => {
  it('never exceeds a capacity of 1 on the same resource, and runs every work item', async () => {
    const admission = new ResourceAdmission(() => 1, 16);
    const probe = new Probe(admission, PIXIV_DEFAULT);
    const gate: Array<() => void> = [];
    const blocker = () => new Promise<void>((resolve) => gate.push(resolve));

    const work = [
      probe.run('bot1-illustration', blocker),
      probe.run('bot1-novel', blocker),
      probe.run('bot2-illustration', blocker),
      probe.run('bot2-novel', blocker),
    ];

    // Let the first item start; the other three must be parked, not rejected.
    await Promise.resolve();
    expect(admission.activeCount(PIXIV_DEFAULT)).toBe(1);
    expect(admission.waitingCount(PIXIV_DEFAULT)).toBe(3);

    // Drain the queue one lease at a time.
    for (let i = 0; i < 4; i += 1) {
      const release = gate[i];
      expect(release).toBeDefined();
      release();
      await Promise.resolve();
      await Promise.resolve();
    }
    await Promise.all(work);

    expect(probe.maxActive).toBe(1);
    expect(admission.activeCount(PIXIV_DEFAULT)).toBe(0);
    expect(admission.waitingTotal()).toBe(0);
    expect(probe.order.filter((entry) => entry.startsWith('start:'))).toEqual([
      'start:bot1-illustration',
      'start:bot1-novel',
      'start:bot2-illustration',
      'start:bot2-novel',
    ]);
  });

  it('honours a configured capacity above 1 without changing the mechanism', async () => {
    const admission = new ResourceAdmission((key) => (key === PIXIV_DEFAULT ? 2 : 1), 8);
    const probe = new Probe(admission, PIXIV_DEFAULT);
    const gate: Array<() => void> = [];
    const blocker = () => new Promise<void>((resolve) => gate.push(resolve));

    const work = [probe.run('a', blocker), probe.run('b', blocker), probe.run('c', blocker)];
    await Promise.resolve();
    expect(admission.activeCount(PIXIV_DEFAULT)).toBe(2);
    expect(admission.waitingCount(PIXIV_DEFAULT)).toBe(1);

    // Drain: releasing a lease admits the next waiter, which parks on its own
    // gate, so the loop must drain gates as they appear.
    let index = 0;
    while (index < gate.length) {
      gate[index]();
      index += 1;
      await Promise.resolve();
      await Promise.resolve();
    }
    await Promise.all(work);
    expect(probe.maxActive).toBe(2);
  });

  it('keeps different resource identities independent (no global lock)', async () => {
    const accountA = pixivAccountResourceKey('account-a');
    const accountB = pixivAccountResourceKey('account-b');
    const admission = new ResourceAdmission(() => 1, 8);

    const started: string[] = [];
    const gate: Array<() => void> = [];
    const blocker = (label: string) => () => {
      started.push(label);
      return new Promise<void>((resolve) => gate.push(resolve));
    };

    const a = admission.acquire(accountA);
    const b = admission.acquire(accountB);
    const leaseA = await a;
    const leaseB = await b;
    expect(leaseA).not.toBeNull();
    expect(leaseB).not.toBeNull();
    expect(admission.activeCount(accountA)).toBe(1);
    expect(admission.activeCount(accountB)).toBe(1);
    // A third work item on A must wait even though B is also busy.
    const waiting = admission.acquire(accountA);
    expect(admission.waitingCount(accountA)).toBe(1);
    expect(admission.waitingCount(accountB)).toBe(0);

    leaseA!.release();
    const secondA = await waiting;
    expect(secondA).not.toBeNull();
    leaseB!.release();
    secondA!.release();
    expect(admission.waitingTotal()).toBe(0);
    expect(started).toEqual([]);
    expect(blocker).toBeDefined();
  });

  it('reports waiting work as unfinished work rather than a failure', async () => {
    const admission = new ResourceAdmission(() => 1, 4);
    const first = await admission.acquire(PIXIV_DEFAULT);
    const parked = admission.acquire(PIXIV_DEFAULT);
    expect(admission.waitingTotal()).toBe(1);

    first!.release();
    const lease = await parked;
    expect(lease).not.toBeNull();
    lease!.release();
    expect(admission.waitingTotal()).toBe(0);
  });

  it('refuses (null, never a rejection) only when the bounded wait queue is full', async () => {
    const admission = new ResourceAdmission(() => 1, 1);
    const held = await admission.acquire(PIXIV_DEFAULT);
    const parked = admission.acquire(PIXIV_DEFAULT);
    expect(admission.waitingTotal()).toBe(1);

    await expect(admission.acquire(PIXIV_DEFAULT)).resolves.toBeNull();

    held!.release();
    const lease = await parked;
    expect(lease).not.toBeNull();
    lease!.release();
  });

  it('names Pixiv resources by stable account identity, never by bot/schedule/target', () => {
    expect(pixivAccountResourceKey('default')).toBe('pixiv-account:default');
    expect(pixivAccountResourceKey('second')).toBe('pixiv-account:second');
    expect(pixivAccountResourceKey(undefined)).toBe('pixiv-account:default');
    expect(pixivAccountResourceKey('  ')).toBe('pixiv-account:default');
    // No credential material can leak into a key by construction.
    expect(pixivAccountResourceKey('default')).not.toMatch(/token|cookie|PHPSESSID/i);
  });
});
