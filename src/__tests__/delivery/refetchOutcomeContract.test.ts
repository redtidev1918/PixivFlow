/**
 * Contract tests for remote manual replacement ("重抓") outcome reporting.
 *
 * A terminal refetch verdict (no_alternative / failed) must reach the requester
 * (TelePost) through the SAME durable outbox as content: the outbox owns
 * retries, the idle lifecycle holds the machine awake while the row is pending,
 * and a crash before delivery resumes on the next wake. Replacement success is
 * NOT reported here — it rides the submission payload (refetch_request_id).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { NotificationPolicy } from '../../notification/NotificationPolicy';
import { SlotContext } from '../../scheduler/SlotCoordinator';
import { SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { DeliveryDispatcher } from '../../delivery/DeliveryDispatcher';
import { OutboxWorker } from '../../delivery/OutboxWorker';

const manualSlot: SlotContext = {
  slotId: 'bot1-daily@manual-6eb50329-20f2-4ea7-b95b-e4676b50d9f1',
  scheduleId: 'bot1-daily',
  occurrenceAt: Date.now(),
  occurrenceDate: '2026-09-13',
  occurrenceLabel: 'manual',
  timezone: 'Asia/Shanghai',
  triggerSource: 'manual',
  slotName: '审核群重抓',
  slotDate: '2026-09-13',
  manualRequestId: '6eb50329-20f2-4ea7-b95b-e4676b50d9f1',
  correlationId: 'chain-1',
};

const schedule = { id: 'bot1-daily', name: 'Bot1 每日' } as any;

const target = {
  id: 'bot1-illust-botefuku',
  type: 'illustration',
  tag: 'ボテ腹',
  delivery: { target: 'bot1-submit' },
} as any;

function config(targets: Record<string, unknown>): any {
  return { delivery: { targets } };
}

const submitTarget = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'httpMultipart',
  url: 'https://telepost.example/api/bot1/v1/submissions',
  ...over,
});

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-refetch-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function outcomeJson(row: { payloadJson?: string }): any {
  return JSON.parse(row.payloadJson ?? '{}');
}

describe('refetch outcome reporting', () => {
  it('enqueues a no_alternative verdict with the request id and scan bookkeeping', () => {
    withDb((db) => {
      const policy = new NotificationPolicy(
        db,
        config({
          'bot1-submit': submitTarget({ refetchOutcomeUrl: 'https://telepost.example/api/bot1/v1/refetch/outcomes' }),
        })
      );

      policy.noteRefetchOutcome(manualSlot, schedule, target, manualSlot.manualRequestId!, {
        kind: 'no_candidate',
        reason: 'no eligible candidate',
        scan: {
          bound: 5,
          attempted: 5,
          skipped: [
            { code: 'duplicate', workId: '111', reason: 'already submitted' },
            { code: 'duplicate', workId: '222', reason: 'already handled' },
            { code: 'deleted', workId: '333', reason: 'gone' },
          ],
          outages: [],
        },
      });

      const rows = db.outbox.list();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'notification', deliveryTarget: 'bot1-submit' });
      const payload = outcomeJson(rows[0]);
      expect(payload.refetchOutcome).toMatchObject({
        requestId: manualSlot.manualRequestId,
        disposition: 'no_alternative',
        reason: 'no eligible candidate',
        scanned: 5,
        skipped: { total: 3, duplicate: 2, invalid: 1, unavailable: 0 },
      });
    });
  });

  it('enqueues a failed verdict for a non-retryable terminal failure', () => {
    withDb((db) => {
      const policy = new NotificationPolicy(
        db,
        config({
          'bot1-submit': submitTarget({ refetchOutcomeUrl: 'https://telepost.example/api/bot1/v1/refetch/outcomes' }),
        })
      );

      policy.noteRefetchOutcome(manualSlot, schedule, target, manualSlot.manualRequestId!, {
        kind: 'failed',
        retryable: false,
        error: 'pixiv auth failure',
      });

      const payload = outcomeJson(db.outbox.list()[0]);
      expect(payload.refetchOutcome).toMatchObject({
        requestId: manualSlot.manualRequestId,
        disposition: 'failed',
        reason: 'pixiv auth failure',
      });
    });
  });

  it('skips reporting when no refetchOutcomeUrl is configured (content stays durable)', () => {
    withDb((db) => {
      const policy = new NotificationPolicy(
        db,
        config({ 'bot1-submit': submitTarget() })
      );

      policy.noteRefetchOutcome(manualSlot, schedule, target, manualSlot.manualRequestId!, {
        kind: 'no_candidate',
        reason: 'nothing',
      });

      expect(db.outbox.list()).toHaveLength(0);
    });
  });

  it('is idempotent per manual slot: repeated verdicts do not enqueue twice', () => {
    withDb((db) => {
      const policy = new NotificationPolicy(
        db,
        config({
          'bot1-submit': submitTarget({ refetchOutcomeUrl: 'https://telepost.example/api/bot1/v1/refetch/outcomes' }),
        })
      );

      const verdict = { kind: 'no_candidate' as const, reason: 'nothing' };
      policy.noteRefetchOutcome(manualSlot, schedule, target, manualSlot.manualRequestId!, verdict);
      policy.noteRefetchOutcome(manualSlot, schedule, target, manualSlot.manualRequestId!, verdict);

      expect(db.outbox.list()).toHaveLength(1);
    });
  });

  it('does not report retryable failures (the slot stays resumable, not terminal)', () => {
    withDb((db) => {
      const policy = new NotificationPolicy(
        db,
        config({
          'bot1-submit': submitTarget({ refetchOutcomeUrl: 'https://telepost.example/api/bot1/v1/refetch/outcomes' }),
        })
      );

      policy.noteRefetchOutcome(manualSlot, schedule, target, manualSlot.manualRequestId!, {
        kind: 'failed',
        retryable: true,
        error: 'transient network error',
      });

      expect(db.outbox.list()).toHaveLength(0);
    });
  });
});

describe('manual slot durability', () => {
  it('persists manualRequestId and correlationId with the slot and round-trips them', () => {
    withDb((db) => {
      const created = db.slots.getOrCreateSlot(manualSlot.slotId, {
        scheduleId: manualSlot.scheduleId,
        occurrenceAt: manualSlot.occurrenceAt,
        occurrenceDate: manualSlot.occurrenceDate,
        occurrenceLabel: manualSlot.occurrenceLabel,
        timezone: manualSlot.timezone,
        targetIds: ['bot1-illust-botefuku'],
        triggerSource: 'manual',
        slotDate: manualSlot.slotDate,
        slotName: manualSlot.slotName,
        manualRequestId: manualSlot.manualRequestId,
        correlationId: manualSlot.correlationId,
      });
      expect(created.created).toBe(true);

      const reloaded = db.slots.getSlot(manualSlot.slotId);
      expect(reloaded).not.toBeNull();
      expect(reloaded!.manualRequestId).toBe(manualSlot.manualRequestId);
      expect(reloaded!.correlationId).toBe(manualSlot.correlationId);
      expect(db.slots.findManualSlot(manualSlot.manualRequestId!, 'bot1-illust-botefuku')?.id).toBe(manualSlot.slotId);
      expect(db.slots.findManualSlot(manualSlot.manualRequestId!, 'wrong-target')).toBeNull();

      // Re-open with the SAME request id resumes the SAME slot (idempotency):
      // no second row, identity preserved.
      const resumed = db.slots.getOrCreateSlot(manualSlot.slotId, {
        scheduleId: manualSlot.scheduleId,
        occurrenceAt: manualSlot.occurrenceAt,
        occurrenceDate: manualSlot.occurrenceDate,
        occurrenceLabel: manualSlot.occurrenceLabel,
        timezone: manualSlot.timezone,
        targetIds: ['bot1-illust-botefuku'],
        triggerSource: 'manual',
        slotDate: manualSlot.slotDate,
        slotName: manualSlot.slotName,
        manualRequestId: manualSlot.manualRequestId,
        correlationId: manualSlot.correlationId,
      });
      expect(resumed.created).toBe(false);
      expect(resumed.slot.manualRequestId).toBe(manualSlot.manualRequestId);
    });
  });

  it('keeps a pending manual slot visible to the idle lifecycle as active work', () => {
    withDb((db) => {
      const { isIdle } = require('../../commands/SchedulerIdleLifecycle');
      const created = db.slots.getOrCreateSlot(manualSlot.slotId, {
        scheduleId: manualSlot.scheduleId,
        occurrenceAt: manualSlot.occurrenceAt,
        occurrenceDate: manualSlot.occurrenceDate,
        occurrenceLabel: manualSlot.occurrenceLabel,
        timezone: manualSlot.timezone,
        targetIds: ['bot1-illust-botefuku'],
        triggerSource: 'manual',
        slotDate: manualSlot.slotDate,
        slotName: manualSlot.slotName,
        manualRequestId: manualSlot.manualRequestId,
      });
      expect(created.created).toBe(true);
      // activeSlots counts non-terminal slots from the ledger; a pending manual
      // slot must therefore keep the machine awake (no shadow flag involved).
      expect(isIdle({ activeSlots: 1, processingOutbox: 0, pendingOutbox: 0 })).toBe(false);
    });
  });
});

it('sends a refetch outcome without a generic notificationUrl', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-refetch-send-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  const originalFetch = global.fetch;
  const send = jest.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  global.fetch = send as typeof fetch;
  try {
    const cfg = config({
      'bot1-submit': submitTarget({ refetchOutcomeUrl: 'https://telepost.example/api/bot1/v1/refetch/outcomes' }),
    });
    new NotificationPolicy(db, cfg).noteRefetchOutcome(manualSlot, schedule, target, manualSlot.manualRequestId!, {
      kind: 'no_candidate', reason: 'none',
    });
    const result = await new OutboxWorker(db, new DeliveryDispatcher(cfg.delivery)).drainOnce();
    expect(result.done).toBe(1);
    expect(send.mock.calls[0][0]).toBe('https://telepost.example/api/bot1/v1/refetch/outcomes');
    expect(JSON.parse(send.mock.calls[0][1].body).request_id).toBe(manualSlot.manualRequestId);
  } finally {
    global.fetch = originalFetch;
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('reports a retryable target failure after the slot exhausts its run', () => {
  withDb((db) => {
    const cfg = {
      ...config({ 'bot1-submit': submitTarget({ refetchOutcomeUrl: 'https://telepost.example/refetch/outcomes' }) }),
      targets: [target],
    };
    const coordinator = new SlotCoordinator(db);
    coordinator.prepare(manualSlot, schedule, [target]);
    coordinator.applyOutcome(manualSlot.slotId, target.id, {
      kind: 'failed', retryable: true, error: 'Pixiv 429 after bounded retries',
    });
    expect(db.slots.getCell(manualSlot.slotId, target.id)?.status).toBe('pending');
    coordinator.finish(manualSlot, schedule, [target]);
    const policy = new NotificationPolicy(db, cfg);
    policy.noteTerminalRefetchCell(manualSlot.slotId, target.id);
    policy.noteTerminalRefetchCell(manualSlot.slotId, target.id);
    expect(db.outbox.list()).toHaveLength(1);
    expect(outcomeJson(db.outbox.list()[0]).refetchOutcome).toMatchObject({
      requestId: manualSlot.manualRequestId,
      disposition: 'failed',
      reason: 'Pixiv 429 after bounded retries',
    });
  });
});
