/**
 * Watchdog helper (runWithTimeout) tests.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isDuplicateOnlyDeadEnd, notifyScheduleFailure, runWithTimeout } from '../../commands/scheduler-runtime';
import { Database } from '../../storage/Database';
import { DeliveryDispatcher } from '../../delivery/DeliveryDispatcher';
import { OutboxWorker } from '../../delivery/OutboxWorker';

describe('runWithTimeout watchdog', () => {
  it('resolves when the task finishes before the deadline', async () => {
    const onTimeout = jest.fn();
    const result = await runWithTimeout(
      Promise.resolve('done'),
      5000,
      onTimeout,
      'plan test'
    );
    expect(result).toBe('done');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('rejects and cancels when the task exceeds the deadline', async () => {
    const onTimeout = jest.fn();
    const hang = new Promise<never>((resolve) => {
      // never settles
      void resolve;
    });
    await expect(
      runWithTimeout(hang, 50, onTimeout, 'plan test')
    ).rejects.toThrow(/exceeded 50ms watchdog/);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('propagates the original task error when it fails first', async () => {
    const onTimeout = jest.fn();
    await expect(
      runWithTimeout(Promise.reject(new Error('download boom')), 5000, onTimeout, 'plan test')
    ).rejects.toThrow('download boom');
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

it('notifies only the delivery targets assigned to the failed schedule', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pixivflow-scheduler-notify-'));
  const db = new Database(join(directory, 'pixivflow.db'));
  db.migrate();
  const originalFetch = global.fetch;
  const fetchMock = jest.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 201 })
  );
  global.fetch = fetchMock as typeof fetch;
  try {
    const deliveryTarget = (name: string) => ({
      type: 'httpMultipart',
      url: `https://example.test/${name}/submit`,
      notificationUrl: `https://example.test/${name}/notify`,
      success: { statuses: [201] },
      maxAttempts: 1,
    });
    const config = {
      targets: [
        { id: 't1', type: 'illustration', delivery: { target: 'bot1' } },
        { id: 't2', type: 'novel', delivery: { target: 'bot2' } },
      ],
      delivery: { targets: { bot1: deliveryTarget('bot1'), bot2: deliveryTarget('bot2') } },
    } as any;

    await notifyScheduleFailure(
      config,
      db,
      { id: 'morning', name: 'Morning', enabled: true, cron: '0 10 * * *', targetIds: ['t1'] },
      {
        scheduleId: 'morning',
        executionNumber: 7,
        status: 'failed',
        errorMessage: 'network down',
        consecutiveFailures: 3,
        stopped: true,
      }
    );

    // Notifications are durable outbox rows; pump them once to observe the POST.
    const worker = new OutboxWorker(db, new DeliveryDispatcher(config.delivery));
    const res = await worker.drainOnce();
    expect(res.done).toBe(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/bot1/notify');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual(expect.objectContaining({
      idempotency_key: 'pixivflow:schedule-failure:morning:7',
      text: expect.stringContaining('已达到连续失败上限并自动停止'),
    }));
  } finally {
    global.fetch = originalFetch;
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
describe('isDuplicateOnlyDeadEnd', () => {
  it('flags a scan that attempted nothing and only hit duplicates', () => {
    expect(isDuplicateOnlyDeadEnd({
      kind: 'no_candidate',
      reason: 'all duplicates',
      scan: {
        bound: 0,
        attempted: 0,
        outages: [],
        skipped: [
          { code: 'duplicate', workId: '149654619', reason: 'already delivered' },
          { code: 'duplicate', workId: '149638093', reason: 'already delivered' },
        ],
      },
    })).toBe(true);
  });

  it('does not flag a scan that attempted candidates or hit a real skip', () => {
    expect(isDuplicateOnlyDeadEnd({
      kind: 'no_candidate',
      reason: 'attempted',
      scan: { bound: 1, attempted: 1, outages: [], skipped: [] },
    })).toBe(false);
    expect(isDuplicateOnlyDeadEnd({
      kind: 'no_candidate',
      reason: 'filtered',
      scan: { bound: 2, attempted: 0, outages: [], skipped: [
        { code: 'duplicate', workId: '1', reason: 'dup' },
        { code: 'filtered', workId: '2', reason: 'lang' },
      ] },
    })).toBe(false);
    expect(isDuplicateOnlyDeadEnd({ kind: 'failed', retryable: true, error: 'x' })).toBe(false);
  });
});
