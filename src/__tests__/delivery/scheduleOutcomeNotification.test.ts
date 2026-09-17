/**
 * P0-B regression contract: EVERY scheduled occurrence — success, partial or
 * failed — enqueues exactly one durable terminal notification (idempotent per
 * slot), delivered by the outbox to TelePost's `scheduleOutcomeUrl` as
 * machine-readable JSON. Success is NOT silent: "no news is good news" is
 * exactly what hid the 2026-09-14 illustration loss.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { NotificationPolicy } from '../../notification/NotificationPolicy';
import { DeliveryDispatcher } from '../../delivery/DeliveryDispatcher';
import { OutboxWorker } from '../../delivery/OutboxWorker';
import { SlotContext, SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { validateConfig } from '../../config/validation';
import { configValidator } from '../../utils/config-validator-unified';

const slot: SlotContext = {
  slotId: 'bot1-daily@2026-09-14T2200',
  scheduleId: 'bot1',
  occurrenceAt: Date.parse('2026-09-14T14:00:00Z'),
  occurrenceDate: '2026-09-14',
  occurrenceLabel: '22:00',
  timezone: 'Asia/Shanghai',
  triggerSource: 'http',
  slotName: '22:00',
  slotDate: '2026-09-14',
};

const schedule = { id: 'bot1', name: 'Bot1' } as any;

/** Production-shaped config: submission target with a scheduleOutcomeUrl. */
function cfg(statusOverrides?: Record<string, unknown>): any {
  return {
    delivery: {
      targets: {
        'bot1-submit': {
          type: 'httpMultipart',
          url: 'https://telepost.example/api/bot1/v1/submissions',
          scheduleOutcomeUrl: 'https://telepost.example/api/bot1/v1/schedule/outcomes',
        },
      },
    },
    targets: [
      {
        id: 'bot1-illust',
        type: 'illustration',
        tag: 'ボテ腹',
        delivery: { target: 'bot1-submit' },
      },
      {
        id: 'bot1-novel',
        type: 'novel',
        tag: 'ボテ腹',
        delivery: { target: 'bot1-submit' },
      },
    ],
    ...statusOverrides,
  };
}

type Row = { targetId: string; label: string; workType: string; status: string; workId: string | null; error: string | null; terminal_reason_code?: string | null; reason?: string | null };

const r = (targetId: string, workType: string, status: string, workId: string | null = null): Row => ({
  targetId, label: targetId, workType, status, workId, error: null,
});

function enqueued(db: Database): any[] {
  return db.outbox.list().filter((row: any) => row.kind === 'notification');
}

function payloadJson(db: Database): any {
  const [row] = enqueued(db);
  return JSON.parse(row.payloadJson);
}

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-schedule-outcome-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('schedule outcome notification', () => {
  it('a FULL success is notified (no news is NOT good news)', () => {
    withDb((db) => {
      new NotificationPolicy(db, cfg()).sendSlotSummary(slot, schedule, [
        r('bot1-illust', 'illustration', 'submitted', '29118637'),
        r('bot1-novel', 'novel', 'submitted', '12345'),
      ]);
      expect(enqueued(db)).toHaveLength(1);
      expect(payloadJson(db).scheduleOutcome).toMatchObject({
        scheduleId: 'bot1',
        slotId: slot.slotId,
        status: 'success',
      });
      const text = payloadJson(db).text;
      expect(text).toContain('success');
      // No mention-capable entity anywhere in the user-visible summary (no tg://
      // anchors, no @username, no HTML links — P0-C).
      expect(text).not.toContain('tg://');
      expect(text).not.toContain('<a ');
      expect(text).not.toMatch(/@[A-Za-z0-9_]{2,}/);
    });
  });

  it('a partial result is notified with status partial', () => {
    withDb((db) => {
      new NotificationPolicy(db, cfg()).sendSlotSummary(slot, schedule, [
        r('bot1-illust', 'illustration', 'submitted', '29118637'),
        r('bot1-novel', 'novel', 'no_candidate'),
      ]);
      expect(payloadJson(db).scheduleOutcome.status).toBe('partial');
      expect(payloadJson(db).scheduleOutcome.targets).toEqual([
        { targetId: 'bot1-illust', workType: 'illustration', status: 'submitted', workId: '29118637', error: null, terminal_reason_code: null, reason: null, stage: null, retryable: null, operator_hint: null },
        { targetId: 'bot1-novel', workType: 'novel', status: 'no_candidate', workId: null, error: null, terminal_reason_code: null, reason: null, stage: null, retryable: null, operator_hint: null },
      ]);
    });
  });

  it('a total failure is notified with status failed', () => {
    withDb((db) => {
      new NotificationPolicy(db, cfg()).sendSlotSummary(slot, schedule, [
        r('bot1-illust', 'illustration', 'no_candidate'),
        r('bot1-novel', 'novel', 'failed', null),
      ]);
      expect(payloadJson(db).scheduleOutcome.status).toBe('failed');
    });
  });

  it('is idempotent per slot: repeated rollups never enqueue a second summary', () => {
    withDb((db) => {
      const policy = new NotificationPolicy(db, cfg());
      const rows = [r('bot1-illust', 'illustration', 'submitted', '29118637')];
      policy.sendSlotSummary(slot, schedule, rows);
      policy.sendSlotSummary(slot, schedule, rows); // recovery re-rolls the same terminal slot
      expect(enqueued(db)).toHaveLength(1);
    });
  });

  it('waits for every cell and never sends manual or other-bot summaries', () => {
    withDb((db) => {
      const config = cfg();
      config.targets.push({ id: 'bot2-illust', type: 'illustration', delivery: { target: 'bot2-submit' } });
      config.delivery.targets['bot2-submit'] = {
        type: 'httpMultipart', url: 'https://telepost.example/bot2/submit',
        scheduleOutcomeUrl: 'https://telepost.example/bot2/outcome',
      };
      const policy = new NotificationPolicy(db, config);
      policy.sendSlotSummary(slot, schedule, [r('bot1-illust', 'illustration', 'delivery_pending', '1')]);
      policy.sendSlotSummary({ ...slot, manualRequestId: 'request-uuid' }, schedule,
        [r('bot1-illust', 'illustration', 'failed')]);
      expect(enqueued(db)).toHaveLength(0);
      policy.sendSlotSummary(slot, schedule, [r('bot1-illust', 'illustration', 'submitted', '1')]);
      expect(enqueued(db)).toHaveLength(1);
      expect(enqueued(db)[0].deliveryTarget).toBe('bot1-submit');
    });
  });

  it('isolates a bot1 failure from a concurrent bot2 success', () => {
    withDb((db) => {
      const config = cfg();
      config.targets.push({ id: 'bot2-illust', type: 'illustration', delivery: { target: 'bot2-submit' } });
      config.delivery.targets['bot2-submit'] = {
        type: 'httpMultipart',
        url: 'https://telepost.example/bot2/submit',
        scheduleOutcomeUrl: 'https://telepost.example/bot2/outcome',
      };
      const policy = new NotificationPolicy(db, config);
      policy.sendSlotSummary(slot, schedule, [{
        ...r('bot1-illust', 'illustration', 'failed'),
        terminal_reason_code: 'download_failed', reason: '图片下载失败',
      }]);
      policy.sendSlotSummary(
        { ...slot, slotId: 'bot2-daily@2026-09-14T2210', scheduleId: 'bot2' },
        { id: 'bot2', name: 'Bot2' } as any,
        [r('bot2-illust', 'illustration', 'submitted', '42')]
      );
      const notifications = enqueued(db).map((row: any) => ({
        target: row.deliveryTarget,
        outcome: JSON.parse(row.payloadJson).scheduleOutcome,
      }));
      expect(notifications).toHaveLength(2);
      expect(notifications.find((n) => n.target === 'bot1-submit')?.outcome).toMatchObject({
        status: 'failed', targets: [{ targetId: 'bot1-illust' }],
      });
      expect(notifications.find((n) => n.target === 'bot2-submit')?.outcome).toMatchObject({
        status: 'success', targets: [{ targetId: 'bot2-illust' }],
      });
    });
  });

  it('recovers a summary after crash or late delivery ACK through the outbox pump', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-outcome-restart-'));
    const path = join(dir, 'test.db');
    let db = new Database(path);
    db.migrate();
    db.slots.getOrCreateSlot(slot.slotId, { ...slot, targetIds: ['bot1-illust', 'bot1-novel'] });
    db.slots.materializeCells(slot.slotId, ['bot1-illust', 'bot1-novel'], () => 'illustration');
    db.slots.setCellStatus(slot.slotId, 'bot1-illust', 'submitted');
    db.slots.setCellStatus(slot.slotId, 'bot1-novel', 'delivery_pending');
    new NotificationPolicy(db, cfg()).reconcileScheduleSummaries();
    expect(enqueued(db)).toHaveLength(0);
    // ACK is durable but the process dies before rollup/notification enqueue.
    db.slots.setCellStatus(slot.slotId, 'bot1-novel', 'submitted');
    db.close();
    db = new Database(path);
    const originalFetch = global.fetch;
    const send = jest.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    global.fetch = send as typeof fetch;
    try {
      const policy = new NotificationPolicy(db, cfg());
      const worker = new OutboxWorker(db, new DeliveryDispatcher(cfg().delivery), {
        beforeDrain: () => policy.reconcileScheduleSummaries(),
      });
      expect((await worker.drainOnce()).done).toBe(1);
      expect(db.slots.getSlot(slot.slotId)?.status).toBe('success');
      expect(payloadJson(db).scheduleOutcome.status).toBe('success');
      await worker.drainOnce();
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reconciles the durable terminal reason into the operational contract', () => {
    withDb((db) => {
      db.slots.getOrCreateSlot(slot.slotId, { ...slot, targetIds: ['bot1-illust'] });
      db.slots.materializeCells(slot.slotId, ['bot1-illust'], () => 'illustration');
      const coordinator = new SlotCoordinator(db);
      coordinator.applyOutcome(slot.slotId, 'bot1-illust', {
        kind: 'failed', retryable: false, error: 'download failed while fetching controlled fixture',
      });
      new NotificationPolicy(db, cfg()).reconcileScheduleSummaries();
      expect(payloadJson(db).scheduleOutcome.targets[0]).toMatchObject({
        targetId: 'bot1-illust',
        terminal_reason_code: 'download_failed',
        reason: '图片下载失败',
        stage: 'download',
        retryable: true,
      });
      expect(payloadJson(db).scheduleOutcome.targets[0].operator_hint).toContain('重试');
    });
  });

  it('stays silent only when NO delivery target declares scheduleOutcomeUrl', () => {
    withDb((db) => {
      const bare: any = cfg();
      delete bare.delivery.targets['bot1-submit'].scheduleOutcomeUrl;
      new NotificationPolicy(db, bare).sendSlotSummary(slot, schedule, [
        r('bot1-illust', 'illustration', 'submitted', '29118637'),
      ]);
      expect(enqueued(db)).toHaveLength(0);
    });
  });
});

describe('schedule outcome delivery to TelePost', () => {
  it('posts machine-readable JSON to scheduleOutcomeUrl through the durable outbox', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-schedule-send-'));
    const db = new Database(join(dir, 'test.db'));
    db.migrate();
    const originalFetch = global.fetch;
    const send = jest.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    global.fetch = send as typeof fetch;
    try {
      const config = cfg();
      new NotificationPolicy(db, config).sendSlotSummary(slot, schedule, [
        r('bot1-illust', 'illustration', 'submitted', '29118637'),
        r('bot1-novel', 'novel', 'no_candidate'),
      ]);
      const result = await new OutboxWorker(db, new DeliveryDispatcher(config.delivery)).drainOnce();
      expect(result.done).toBe(1);

      const [url, options] = send.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://telepost.example/api/bot1/v1/schedule/outcomes');
      expect(JSON.parse(String(options.body))).toEqual({
        schedule_id: 'bot1',
        slot_id: slot.slotId,
        status: 'partial',
        targets: [
          { target_id: 'bot1-illust', work_type: 'illustration', status: 'submitted', work_id: '29118637', terminal_reason_code: null, reason: null, stage: null, retryable: null, operator_hint: null },
          { target_id: 'bot1-novel', work_type: 'novel', status: 'no_candidate', work_id: null, terminal_reason_code: null, reason: null, stage: null, retryable: null, operator_hint: null },
        ],
      });
    } finally {
      global.fetch = originalFetch;
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves operational failure fields across the HTTP boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-operational-result-'));
    const db = new Database(join(dir, 'test.db'));
    db.migrate();
    const originalFetch = global.fetch;
    const send = jest.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    global.fetch = send as typeof fetch;
    try {
      const config = cfg();
      new NotificationPolicy(db, config).sendSlotSummary(slot, schedule, [{
        ...r('bot1-illust', 'illustration', 'failed'),
        terminal_reason_code: 'download_failed',
        reason: '图片下载失败',
      }]);
      await new OutboxWorker(db, new DeliveryDispatcher(config.delivery)).drainOnce();
      const body = JSON.parse(String((send.mock.calls[0] as [string, RequestInit])[1].body));
      expect(body.targets[0]).toMatchObject({
        terminal_reason_code: 'download_failed',
        reason: '图片下载失败',
        stage: 'download',
        retryable: true,
      });
      expect(body.targets[0].operator_hint).toContain('重试');
    } finally {
      global.fetch = originalFetch;
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scheduleOutcomeUrl config validation (both validators)', () => {
  function withHttpTarget(extra: Record<string, unknown>): any {
    return {
      pixiv: { clientId: 'id', clientSecret: 'secret', deviceToken: 'd', refreshToken: 'r', userAgent: 'PixivAndroidApp/5.0.234' },
      delivery: { targets: { 'bot1-submit': { type: 'httpMultipart', url: 'https://telepost.example/submit', ...extra } } },
    };
  }

  it('accepts a valid scheduleOutcomeUrl and a ${ENV} placeholder', () => {
    for (const extra of [
      { scheduleOutcomeUrl: 'https://telepost.example/api/bot1/v1/schedule/outcomes' },
      { scheduleOutcomeUrl: '${TELEPOST_API_BASE_URL}/api/bot1/v1/schedule/outcomes' },
    ]) {
      // Other mandatory config may be rejected (e.g. no live refresh token) —
      // what matters is that scheduleOutcomeUrl itself is never an error.
      try {
        validateConfig(withHttpTarget(extra), 'test');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toMatch(/scheduleOutcomeUrl/);
      }
      const unified = configValidator.validate(withHttpTarget(extra)).errors;
      expect(unified.some((e) => String(e.field).includes('scheduleOutcomeUrl'))).toBe(false);
    }
  });

  it('rejects a malformed scheduleOutcomeUrl in BOTH validators', () => {
    const bad = { scheduleOutcomeUrl: 'not a url' };
    expect(() => validateConfig(withHttpTarget(bad), 'test')).toThrow(/scheduleOutcomeUrl/);
    const unified = configValidator.validate(withHttpTarget(bad)).errors;
    expect(unified.some((e) => String(e.field).includes('scheduleOutcomeUrl'))).toBe(true);
  });

  it('rejects a non-http(s) protocol', () => {
    const bad = { scheduleOutcomeUrl: 'ftp://telepost.example/x' };
    expect(() => validateConfig(withHttpTarget(bad), 'test')).toThrow(/scheduleOutcomeUrl/);
  });
});
