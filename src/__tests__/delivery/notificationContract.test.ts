/**
 * Regression tests for the 2026-09-12 stuck notification outbox row.
 *
 * `NotificationPolicy.noteOutcome()` addressed per-target failures to
 * `target.delivery.target` — a SUBMISSION endpoint (multipart POST of a work),
 * not a notification endpoint — and enqueued without checking whether that
 * target could receive a notification at all. Production config declares only
 * `bot1-submit` / `bot2-submit`, neither with a `notificationUrl`, so the row
 * could never be delivered:
 *
 *   outbox 7b5ab057 kind=notification delivery_target=bot1-submit
 *   status=retry_wait attempts=7
 *   last_error="Delivery target does not configure notificationUrl: bot1-submit"
 *
 * Two invariants are pinned here:
 *   1. a notification is only enqueued for a target that can receive one;
 *   2. a local configuration error dead-letters immediately instead of burning
 *      a retry budget in `retry_wait`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { NotificationPolicy } from '../../notification/NotificationPolicy';
import { OutboxWorker } from '../../delivery/OutboxWorker';
import { ConfigError } from '../../utils/errors';
import { SlotContext } from '../../scheduler/SlotCoordinator';

const slot: SlotContext = {
  slotId: 'bot1-daily@2026-09-12T1800',
  scheduleId: 'bot1',
  occurrenceAt: Date.parse('2026-09-12T10:00:00Z'),
  occurrenceDate: '2026-09-12',
  occurrenceLabel: '18:00',
  timezone: 'Asia/Shanghai',
  triggerSource: 'http',
  slotName: '18:00',
  slotDate: '2026-09-12',
};

const schedule = { id: 'bot1', name: 'Bot1' } as any;

/** Two submission targets, exactly like the canonical production config. */
function config(targets: Record<string, unknown>): any {
  return { delivery: { targets } };
}

const submissionTarget = {
  id: 'bot1-illust-botefuku',
  type: 'illustration',
  tag: 'ボテ腹',
  delivery: { target: 'bot1-submit' },
} as any;

const failedOutcome = { kind: 'failed', retryable: false, error: 'aborted before rate-limit slot' } as any;

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-notify-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('notifications only target endpoints that can receive them', () => {
  it('does not enqueue for a submission target without notificationUrl', () => {
    withDb((db) => {
      const policy = new NotificationPolicy(
        db,
        config({ 'bot1-submit': { type: 'httpMultipart', url: 'https://telepost.example/submit' } })
      );

      policy.noteOutcome(slot.slotId, slot, schedule, submissionTarget, failedOutcome);

      // Pre-fix this produced a row that could never be delivered.
      expect(db.outbox.list()).toHaveLength(0);
    });
  });

  it('enqueues when the delivery target exposes a notificationUrl', () => {
    withDb((db) => {
      const policy = new NotificationPolicy(
        db,
        config({
          'bot1-submit': {
            type: 'httpMultipart',
            url: 'https://telepost.example/submit',
            notificationUrl: 'https://telepost.example/notify',
          },
        })
      );

      policy.noteOutcome(slot.slotId, slot, schedule, submissionTarget, failedOutcome);

      const rows = db.outbox.list();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'notification', deliveryTarget: 'bot1-submit' });
    });
  });

  it('stays silent when no target is notifiable at all', () => {
    withDb((db) => {
      const policy = new NotificationPolicy(
        db,
        config({ 'bot1-submit': { type: 'httpMultipart', url: 'https://telepost.example/submit' } })
      );

      policy.sendSlotSummary(slot, schedule, [
        {
          targetId: 'bot1-illust-botefuku',
          label: 'bot1-illust-botefuku',
          workType: 'illustration',
          status: 'submitted',
          workId: '149590937',
          error: null,
        },
      ]);

      expect(db.outbox.list()).toHaveLength(0);
    });
  });
});

/** A provider that rejects the notification because the target is misconfigured. */
class ConfigFailingDispatcher {
  notifyCalls = 0;
  async isReady(): Promise<boolean> {
    return true;
  }
  async deliver(): Promise<never> {
    throw new Error('unexpected deliver call');
  }
  async notify(name: string): Promise<void> {
    this.notifyCalls++;
    throw new ConfigError(`Delivery target does not configure notificationUrl: ${name}`);
  }
}

describe('a configuration error dead-letters instead of retrying forever', () => {
  it('goes straight to dead on the first attempt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-notify-dead-'));
    const db = new Database(join(dir, 'test.db'));
    db.migrate();
    try {
      const dispatcher = new ConfigFailingDispatcher();
      const dead: string[] = [];
      const worker = new OutboxWorker(db, dispatcher as any, {
        retryBaseMs: 0,
        onDead: (row) => dead.push(row.id),
      });
      db.outbox.enqueue({
        kind: 'notification',
        deliveryTarget: 'bot1-submit',
        idempotencyKey: 'k-notify-dead',
        payload: { text: '❌ PixivFlow 本次处理失败' },
      });

      const first = await worker.drainOnce();

      // `markRetry` would have parked it in retry_wait for up to 12 attempts.
      expect(first).toMatchObject({ processed: 1, retried: 0, dead: 1 });
      expect(db.outbox.getByKey('notification', 'k-notify-dead')).toMatchObject({
        status: 'dead',
        attempts: 1,
      });
      expect(dead).toHaveLength(1);
      expect(dispatcher.notifyCalls).toBe(1);

      // Nothing left to retry, so the outbox drains clean.
      expect(db.outbox.counts().retryWait).toBe(0);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
