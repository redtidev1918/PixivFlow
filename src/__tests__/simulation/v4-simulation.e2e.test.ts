/**
 * V4 SIMULATION E2E — 100% offline.
 *
 * Wires the REAL PixivFlow Core components against fake providers so the whole
 * production chain can be exercised with no network, no credential and no
 * provider account:
 *
 *   fake clock
 *     -> real OccurrenceResolver / SlotCoordinator (slot ledger + cell FSM)
 *     -> fake Pixiv API (candidate selection per target)
 *     -> real delivery ledger + real OutboxWorker (retry / idempotency / restart)
 *     -> fake TelePost ReviewService (idempotency-key semantics of the real API)
 *     -> fake Telegram API (review message publish)
 *
 * Determinism note: the *occurrence* clock is fully injected. The outbox handles
 * due-time arithmetic against wall-clock time, so every drain in this file uses
 * `retryBaseMs: 0` (the established pattern in OutboxFailureInjection.test.ts),
 * which makes retry timing deterministic without faking Date.now globally.
 *
 * Covered scenarios: illustration, novel, album, no_candidate, partial, lost ACK,
 * retry, restart, duplicate idempotency, publish failure, notification pump.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from '../../storage/Database';
import { SlotCoordinator, SlotContext, SlotRunSummary } from '../../scheduler/SlotCoordinator';
import { OutboxWorker } from '../../delivery/OutboxWorker';
import type { DeliveryDispatcher } from '../../delivery/DeliveryDispatcher';
import type { DeliveryAck } from '../../delivery/DeliveryAck';
import type {
  DeliveryNotificationRequest,
  DeliveryRequest,
  DeliveryResult,
} from '../../delivery/types';
import type { ScheduleConfig, StandaloneConfig, TargetConfig } from '../../config';

// ---------------------------------------------------------------------------
// Fake clock
// ---------------------------------------------------------------------------

/** Injectable clock: every occurrence resolution reads time from here. */
class FakeClock {
  private current: number;
  constructor(iso: string) {
    this.current = Date.parse(iso);
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

// ---------------------------------------------------------------------------
// Fake Telegram API
// ---------------------------------------------------------------------------

interface TelegramMessage {
  chatId: string;
  text: string;
  mediaCount: number;
}

class FakeTelegram {
  readonly published: TelegramMessage[] = [];
  constructor(private readonly chatId: string) {}

  async sendReviewMessage(text: string, mediaCount: number): Promise<{ message_id: number }> {
    const message_id = this.published.length + 1;
    this.published.push({ chatId: this.chatId, text, mediaCount });
    return { message_id };
  }
}

// ---------------------------------------------------------------------------
// Fake TelePost ReviewService
// ---------------------------------------------------------------------------

interface ReviewRecord {
  reviewId: string;
  idempotencyKey: string;
  targetId: string;
  workType: string;
  pixivId: string;
  messageId: number;
  fileCount: number;
}

interface SubmitInput {
  idempotencyKey: string;
  targetId: string;
  workType: string;
  pixivId: string;
  files: string[];
}

/**
 * Mirrors the TelePost review API contract that PixivFlow's DeliveryAck parser
 * understands: a repeat of OUR key replays the same record; the same work from a
 * DIFFERENT key is a historical duplicate; a down provider is retryable.
 */
class FakeTelePostReviewService {
  readonly records: ReviewRecord[] = [];
  /** Ordered ack kinds the provider returned, so replay paths are observable. */
  readonly ackKinds: DeliveryAck['kind'][] = [];
  private readonly byKey = new Map<string, ReviewRecord>();
  private readonly byWork = new Map<string, ReviewRecord>();
  /** Keys whose ACK is dropped after the record was created (network timeout). */
  private readonly dropAck = new Set<string>();
  /** Remaining attempts that fail before any record is created. */
  private transientFailures = 0;
  /** Remaining deterministic 4xx-style rejections. */
  private permanentFailures = 0;

  constructor(private readonly telegram: FakeTelegram) {}

  failTransient(times: number): void {
    this.transientFailures = times;
  }

  failPermanent(times: number): void {
    this.permanentFailures = times;
  }

  /** Provider created the record but the ACK was lost (first attempt only). */
  dropAckFor(key: string): void {
    this.dropAck.add(key);
  }

  submit(input: SubmitInput): DeliveryAck {
    const ack = this.attempt(input);
    this.ackKinds.push(ack.kind);
    return ack;
  }

  private attempt(input: SubmitInput): DeliveryAck {
    const replay = this.byKey.get(input.idempotencyKey);
    if (replay) {
      return { kind: 'idempotent_replay', remoteId: replay.reviewId, remoteStatus: 'pending_review' };
    }

    const workKey = `${input.targetId}:${input.workType}:${input.pixivId}`;
    const prior = this.byWork.get(workKey);
    if (prior) {
      return {
        kind: 'duplicate_existing',
        remoteId: prior.reviewId,
        matchedKey: prior.idempotencyKey,
        remoteStatus: 'pending_review',
      };
    }

    if (this.permanentFailures > 0) {
      this.permanentFailures -= 1;
      return { kind: 'permanent_failure', error: 'telepost rejected the submission (422)' };
    }

    if (this.transientFailures > 0) {
      this.transientFailures -= 1;
      return { kind: 'retryable_failure', error: 'telepost review service unavailable' };
    }

    const messageId = this.telegram.published.length + 1;
    const record: ReviewRecord = {
      reviewId: `rv-${this.records.length + 1}`,
      idempotencyKey: input.idempotencyKey,
      targetId: input.targetId,
      workType: input.workType,
      pixivId: input.pixivId,
      messageId,
      fileCount: input.files.length,
    };
    this.records.push(record);
    this.byKey.set(input.idempotencyKey, record);
    this.byWork.set(workKey, record);
    void this.telegram.sendReviewMessage(`review for #${input.pixivId}`, input.files.length);

    if (this.dropAck.delete(input.idempotencyKey)) {
      // The review exists on the provider, but the caller never saw the ACK.
      throw new Error('timeout awaiting provider ack');
    }
    return { kind: 'accepted', remoteId: record.reviewId, remoteStatus: 'pending_review' };
  }
}

// ---------------------------------------------------------------------------
// SimulationDispatcher — satisfies the real DeliveryDispatcher contract
// ---------------------------------------------------------------------------

class SimulationDispatcher {
  deliverCalls = 0;

  constructor(
    private readonly telepost: FakeTelePostReviewService,
    private readonly telegram: FakeTelegram,
  ) {}

  async isReady(): Promise<boolean> {
    return true;
  }

  async readinessProbe(): Promise<{ ready: boolean }> {
    return { ready: true };
  }

  async deliver(_name: string, request: DeliveryRequest): Promise<DeliveryResult> {
    this.deliverCalls += 1;
    const ctx = request.context;
    const key = String(ctx.idempotencyKey ?? '');
    const ack = this.telepost.submit({
      idempotencyKey: key,
      targetId: String(ctx.targetId ?? 'unknown-target'),
      workType: String(ctx.type),
      pixivId: String(ctx.pixivId),
      files: request.files ?? [],
    });
    return { ack };
  }

  async notify(_name: string, request: DeliveryNotificationRequest): Promise<DeliveryResult> {
    await this.telegram.sendReviewMessage(request.text, 0);
    return { ack: { kind: 'accepted' } };
  }
}

// ---------------------------------------------------------------------------
// Fake Pixiv API
// ---------------------------------------------------------------------------

interface Candidate {
  workId: string;
  workType: 'illustration' | 'novel';
  /** How many files this work expands to (album = many). */
  fileCount: number;
}

/** Scripted candidate source: one entry per target id, null = no candidate. */
class FakePixivApi {
  readonly calls: string[] = [];
  constructor(
    private readonly script: Record<string, Candidate | null>,
    private readonly mediaDir: string,
  ) {}

  pick(targetId: string): Candidate | null {
    this.calls.push(targetId);
    return this.script[targetId] ?? null;
  }

  /** Materialize the local artifacts a real download would have produced. */
  materialize(candidate: Candidate): string[] {
    return Array.from({ length: candidate.fileCount }, (_, i) => {
      const file = join(this.mediaDir, `${candidate.workId}-${i}.jpg`);
      writeFileSync(file, 'synthetic-bytes');
      return file;
    });
  }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const CREDENTIAL_A = 'credential-a';
const CREDENTIAL_B = 'credential-b';

interface SimEnv {
  db: Database;
  root: string;
  mediaDir: string;
  coord: SlotCoordinator;
  telegram: FakeTelegram;
  telepost: FakeTelePostReviewService;
  dispatcher: SimulationDispatcher;
  worker: OutboxWorker;
  close(): void;
}

function createEnv(): SimEnv {
  const root = mkdtempSync(join(tmpdir(), 'pixivflow-v4-sim-'));
  const mediaDir = join(root, 'media');
  mkdirSync(mediaDir, { recursive: true });
  const db = new Database(join(root, 'test.db'));
  db.migrate();

  const coord = new SlotCoordinator(db);
  const telegram = new FakeTelegram('@sim-review');
  const telepost = new FakeTelePostReviewService(telegram);
  const dispatcher = new SimulationDispatcher(telepost, telegram);
  const worker = new OutboxWorker(db, dispatcher as unknown as DeliveryDispatcher, {
    retryBaseMs: 0,
    retryMaxMs: 0,
    batchSize: 8,
  });

  return {
    db,
    root,
    mediaDir,
    coord,
    telegram,
    telepost,
    dispatcher,
    worker,
    close() {
      db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const SCHEDULE: ScheduleConfig = {
  id: 'schedule-v4',
  name: 'V4 simulation',
  cron: '0 10 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
} as ScheduleConfig;

const CONFIG = { schedulerRuntime: { trigger: { graceMinutes: 120 } } } as StandaloneConfig;

const target = (id: string, credential: string): TargetConfig =>
  ({ id, type: 'illustration', credential } as unknown as TargetConfig);

interface RunInput {
  schedule?: ScheduleConfig;
  targets: TargetConfig[];
  pixiv: FakePixivApi;
  at: Date;
}

/**
 * Drives one occurrence through the REAL slot ledger, delivery ledger and
 * outbox, exactly as a scheduler run would, minus the network-bound download.
 */
async function runOccurrence(env: SimEnv, input: RunInput): Promise<SlotRunSummary> {
  const schedule = input.schedule ?? SCHEDULE;
  const slot = env.coord.resolveOccurrence(schedule, CONFIG, 'cron', input.at).context!;
  env.coord.begin(slot, schedule, input.targets);

  const pending = env.coord.pendingTargets(slot.slotId, input.targets);
  for (const { target: t, cell } of pending) {
    const targetId = t.id as string;
    const candidate = input.pixiv.pick(targetId);

    if (!candidate) {
      env.coord.applyOutcome(slot.slotId, targetId, { kind: 'no_candidate', reason: 'no matching works' });
      continue;
    }

    // A resume must re-use the work locked by the first attempt.
    const workId = cell.workId ?? candidate.workId;
    const workType = candidate.workType;
    env.coord.lockWork(slot.slotId, targetId, workId, workType);

    const files = input.pixiv.materialize(candidate);
    const deliveryId = `${slot.slotId}:${targetId}`;
    const idempotencyKey = `${targetId}:${workType}:${workId}:${slot.slotId}`;

    env.db.deliveries.insertIntent({
      id: deliveryId,
      deliveryTarget: targetId,
      workType,
      pixivId: workId,
      slotId: slot.slotId,
      targetId,
      idempotencyKey,
    });

    env.db.outbox.enqueue({
      kind: 'delivery',
      deliveryTarget: targetId,
      idempotencyKey,
      deliveryId,
      payload: {
        files,
        context: {
          title: `work ${workId}`,
          pixivId: workId,
          type: workType,
          targetId,
          idempotencyKey,
          slotId: slot.slotId,
          executionId: slot.slotId,
        },
        deleteAfterDelivery: true,
      },
      maxAttempts: 3,
    });

    env.coord.applyOutcome(slot.slotId, targetId, {
      kind: 'delivery_pending',
      workId,
      workType,
      deliveryId,
    });
  }

  await env.worker.drainOnce();

  // Reconcile the ledger into the slot cell (what the real runner does after pump).
  for (const { target: t } of pending) {
    const targetId = t.id as string;
    const ledger = env.db.deliveries.getById(`${slot.slotId}:${targetId}`);
    const cell = env.db.slots.getCell(slot.slotId, targetId);
    if (!ledger || !cell?.workId) continue;

    if (ledger.status === 'delivered') {
      env.coord.markDelivered(slot.slotId, targetId, cell.workId, cell.workType ?? 'illustration');
    } else if (ledger.status === 'duplicate') {
      env.coord.applyOutcome(slot.slotId, targetId, {
        kind: 'duplicate',
        workId: cell.workId,
        reason: 'historical duplicate',
      });
    } else if (ledger.status === 'failed') {
      env.coord.applyOutcome(slot.slotId, targetId, {
        kind: 'failed',
        retryable: false,
        error: ledger.lastError ?? 'delivery failed',
      });
    }
  }

  return env.coord.finish(slot, schedule, input.targets);
}

const AT = new Date('2026-09-08T02:00:30Z'); // 10:00 Asia/Shanghai

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('V4 simulation E2E — real Core against fake providers', () => {
  let env: SimEnv;

  beforeEach(() => {
    env = createEnv();
  });

  afterEach(() => {
    env.close();
  });

  it('illustration: posts exactly one review message and clears the cache', async () => {
    const pixiv = new FakePixivApi({ 'bot1-illust': { workId: '100', workType: 'illustration', fileCount: 1 } }, env.mediaDir);
    const summary = await runOccurrence(env, { targets: [target('bot1-illust', CREDENTIAL_A)], pixiv, at: AT });

    expect(env.telepost.records).toHaveLength(1);
    expect(env.telegram.published).toHaveLength(1);
    expect(env.telegram.published[0].mediaCount).toBe(1);
    expect(env.telepost.records[0].pixivId).toBe('100');
    expect(env.telepost.records[0].workType).toBe('illustration');

    const ledger = env.db.deliveries.getById(`${summary.slotId}:bot1-illust`)!;
    expect(ledger.status).toBe('delivered');
    expect(env.db.slots.getCell(summary.slotId, 'bot1-illust')!.status).toBe('submitted');
    expect(summary.status).toBe('success');

    // Confirmed delivery removes the cached media.
    const cached = join(env.mediaDir, '100-0.jpg');
    expect(existsSync(cached)).toBe(false);
  });

  it('novel: delivered through the same pipeline', async () => {
    const pixiv = new FakePixivApi({ 'bot2-novel': { workId: '200', workType: 'novel', fileCount: 1 } }, env.mediaDir);
    const summary = await runOccurrence(env, { targets: [target('bot2-novel', CREDENTIAL_A)], pixiv, at: AT });

    expect(env.telepost.records).toHaveLength(1);
    expect(env.telepost.records[0].workType).toBe('novel');
    expect(env.db.slots.getCell(summary.slotId, 'bot2-novel')!.status).toBe('submitted');
  });

  it('album: a multi-file work becomes ONE review with all files attached', async () => {
    const pixiv = new FakePixivApi({ 'bot1-album': { workId: '300', workType: 'illustration', fileCount: 7 } }, env.mediaDir);
    await runOccurrence(env, { targets: [target('bot1-album', CREDENTIAL_A)], pixiv, at: AT });

    expect(env.telepost.records).toHaveLength(1);
    expect(env.telepost.records[0].fileCount).toBe(7);
    expect(env.telegram.published).toHaveLength(1);
  });

  it('no_candidate: settles the cell without creating any delivery intent', async () => {
    const pixiv = new FakePixivApi({ 'bot1-empty': null }, env.mediaDir);
    const summary = await runOccurrence(env, { targets: [target('bot1-empty', CREDENTIAL_A)], pixiv, at: AT });

    expect(env.db.slots.getCell(summary.slotId, 'bot1-empty')!.status).toBe('no_candidate');
    expect(env.telepost.records).toHaveLength(0);
    expect(env.db.deliveries.getById(`${summary.slotId}:bot1-empty`)).toBeNull();
    expect(env.dispatcher.deliverCalls).toBe(0);
  });

  it('partial: one target delivers, another has no candidate -> slot partial', async () => {
    const pixiv = new FakePixivApi(
      {
        'bot1-ok': { workId: '400', workType: 'illustration', fileCount: 1 },
        'bot1-empty': null,
      },
      env.mediaDir,
    );
    const summary = await runOccurrence(env, {
      targets: [target('bot1-ok', CREDENTIAL_A), target('bot1-empty', CREDENTIAL_B)],
      pixiv,
      at: AT,
    });

    expect(summary.status).toBe('partial');
    expect(env.db.slots.getCell(summary.slotId, 'bot1-ok')!.status).toBe('submitted');
    expect(env.db.slots.getCell(summary.slotId, 'bot1-empty')!.status).toBe('no_candidate');
    expect(env.telepost.records).toHaveLength(1);
  });

  it('lost ACK: a timeout after the provider created the record converges to exactly one review', async () => {
    const pixiv = new FakePixivApi({ 'bot1-illust': { workId: '500', workType: 'illustration', fileCount: 1 } }, env.mediaDir);
    const key = `bot1-illust:illustration:500:${env.coord.resolveOccurrence(SCHEDULE, CONFIG, 'cron', AT).context!.slotId}`;
    env.telepost.dropAckFor(key);

    const summary = await runOccurrence(env, { targets: [target('bot1-illust', CREDENTIAL_A)], pixiv, at: AT });

    expect(env.telepost.records).toHaveLength(1); // provider-side record created once
    expect(env.telegram.published).toHaveLength(1);
    const ledger = env.db.deliveries.getById(`${summary.slotId}:bot1-illust`)!;
    expect(ledger.status).toBe('delivered');
    // First attempt dropped its ACK, the retry was recognised as a replay.
    expect(env.telepost.ackKinds).toEqual(['idempotent_replay']);
    expect(ledger.remoteStatus).toBe('pending_review');
    expect(env.db.slots.getCell(summary.slotId, 'bot1-illust')!.status).toBe('submitted');
  });

  it('retry: a transient provider failure is retried and still yields one review', async () => {
    const pixiv = new FakePixivApi({ 'bot1-illust': { workId: '600', workType: 'illustration', fileCount: 1 } }, env.mediaDir);
    env.telepost.failTransient(2);

    await runOccurrence(env, { targets: [target('bot1-illust', CREDENTIAL_A)], pixiv, at: AT });

    expect(env.dispatcher.deliverCalls).toBe(3); // 2 failures + 1 success
    expect(env.telepost.records).toHaveLength(1);
    expect(env.telegram.published).toHaveLength(1);
  });

  it('restart: a crashed worker lease is reclaimed and resumes the SAME intent', async () => {
    const pixiv = new FakePixivApi({ 'bot1-illust': { workId: '700', workType: 'illustration', fileCount: 1 } }, env.mediaDir);
    const slot = env.coord.resolveOccurrence(SCHEDULE, CONFIG, 'cron', AT).context!;
    env.coord.begin(slot, SCHEDULE, [target('bot1-illust', CREDENTIAL_A)]);
    env.coord.lockWork(slot.slotId, 'bot1-illust', '700', 'illustration');

    const key = `bot1-illust:illustration:700:${slot.slotId}`;
    env.db.deliveries.insertIntent({
      id: `${slot.slotId}:bot1-illust`,
      deliveryTarget: 'bot1-illust',
      workType: 'illustration',
      pixivId: '700',
      slotId: slot.slotId,
      targetId: 'bot1-illust',
      idempotencyKey: key,
    });
    const row = env.db.outbox.enqueue({
      kind: 'delivery',
      deliveryTarget: 'bot1-illust',
      idempotencyKey: key,
      deliveryId: `${slot.slotId}:bot1-illust`,
      payload: {
        files: pixiv.materialize({ workId: '700', workType: 'illustration', fileCount: 1 }),
        context: { title: 'work 700', pixivId: '700', type: 'illustration', targetId: 'bot1-illust', idempotencyKey: key, slotId: slot.slotId },
      },
      maxAttempts: 3,
    });

    // Process killed between claim and markDone: the lease owner is gone.
    env.db.outbox.claimDue('dead-worker-pid', 100, 10);
    expect(env.db.outbox.get(row.id)!.status).toBe('processing');
    expect(await env.worker.drainOnce()).toMatchObject({ processed: 0 }); // lease still live

    await new Promise((resolve) => setTimeout(resolve, 120));
    const resumed = await env.worker.drainOnce();

    expect(resumed.done).toBe(1);
    expect(env.db.outbox.get(row.id)!.status).toBe('done');
    expect(env.telepost.records).toHaveLength(1);
    expect(env.telepost.records[0].idempotencyKey).toBe(key);
  });

  it('duplicate idempotency: the same key enqueued three times delivers once', async () => {
    const pixiv = new FakePixivApi({ 'bot1-illust': { workId: '800', workType: 'illustration', fileCount: 1 } }, env.mediaDir);
    const key = 'bot1-illust:illustration:800:slot-dup';
    const files = pixiv.materialize({ workId: '800', workType: 'illustration', fileCount: 1 });
    env.db.deliveries.insertIntent({
      id: 'd-dup',
      deliveryTarget: 'bot1-illust',
      workType: 'illustration',
      pixivId: '800',
      idempotencyKey: key,
    });
    for (let i = 0; i < 3; i++) {
      env.db.outbox.enqueue({
        kind: 'delivery',
        deliveryTarget: 'bot1-illust',
        idempotencyKey: key,
        deliveryId: 'd-dup',
        payload: {
          files,
          context: { title: 'work 800', pixivId: '800', type: 'illustration', targetId: 'bot1-illust', idempotencyKey: key },
        },
      });
    }

    const result = await env.worker.drainOnce();

    expect(result.done).toBe(1);
    expect(env.dispatcher.deliverCalls).toBe(1);
    expect(env.telepost.records).toHaveLength(1);
  });

  it('publish failure: a deterministic rejection dead-letters and the cell ends failed', async () => {
    const pixiv = new FakePixivApi({ 'bot1-illust': { workId: '900', workType: 'illustration', fileCount: 1 } }, env.mediaDir);
    env.telepost.failPermanent(99);

    const summary = await runOccurrence(env, { targets: [target('bot1-illust', CREDENTIAL_A)], pixiv, at: AT });

    expect(env.telepost.records).toHaveLength(0);
    expect(env.db.slots.getCell(summary.slotId, 'bot1-illust')!.status).toBe('failed');
    const ledger = env.db.deliveries.getById(`${summary.slotId}:bot1-illust`)!;
    expect(ledger.status).toBe('failed');
    const outboxRow = env.db.outbox.getByKey('delivery', `bot1-illust:illustration:900:${summary.slotId}`)!;
    expect(outboxRow.status).toBe('dead');
    expect(outboxRow.attempts).toBe(3); // maxAttempts
  });

  it('notification side effects are pumped independently of content delivery', async () => {
    env.db.outbox.enqueue({
      kind: 'notification',
      deliveryTarget: 'bot1-illust',
      idempotencyKey: 'note-1',
      payload: { text: 'queued for review' },
    });

    await env.worker.drainOnce();

    expect(env.telegram.published).toHaveLength(1);
    expect(env.telegram.published[0].text).toBe('queued for review');
  });

  it('occurrence identity is stable: a duplicate trigger resumes the SAME slot and never re-posts', async () => {
    const pixiv = new FakePixivApi({ 'bot1-illust': { workId: '1000', workType: 'illustration', fileCount: 1 } }, env.mediaDir);
    const first = await runOccurrence(env, { targets: [target('bot1-illust', CREDENTIAL_A)], pixiv, at: AT });
    // A second, independent trigger for the same cron occurrence.
    const second = await runOccurrence(env, { targets: [target('bot1-illust', CREDENTIAL_A)], pixiv, at: AT });

    expect(second.slotId).toBe(first.slotId);
    expect(env.telepost.records).toHaveLength(1);
    expect(env.telegram.published).toHaveLength(1);
  });
});

describe('V4 architecture contract', () => {
  let env: SimEnv;
  beforeEach(() => {
    env = createEnv();
  });
  afterEach(() => {
    env.close();
  });

  it('the slot FSM rejects a downgrade from submitted back to failed', async () => {
    const slot = env.coord.resolveOccurrence(SCHEDULE, CONFIG, 'cron', AT).context! as SlotContext;
    env.coord.begin(slot, SCHEDULE, [target('a', CREDENTIAL_A)]);
    env.coord.lockWork(slot.slotId, 'a', '1100', 'illustration');
    env.coord.markCell(slot.slotId, 'a', 'submitted');

    expect(() => env.db.slots.transitionCell(slot.slotId, 'a', 'failed', 'late timeout')).toThrow();
    expect(env.db.slots.getCell(slot.slotId, 'a')!.status).toBe('submitted');
  });

  it('a delivery intent is keyed by (target, type, pixivId) and replays idempotently', () => {
    const first = env.db.deliveries.insertIntent({
      id: 'd-1',
      deliveryTarget: 'bot1',
      workType: 'illustration',
      pixivId: '1200',
      idempotencyKey: 'k-1200',
    });
    const again = env.db.deliveries.insertIntent({
      id: 'd-2',
      deliveryTarget: 'bot1',
      workType: 'illustration',
      pixivId: '1200',
      idempotencyKey: 'k-1200',
    });

    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.row.id).toBe('d-1');
  });

  it('every delivered intent carries the full correlation tuple', async () => {
    const pixiv = new FakePixivApi({ 'bot1-illust': { workId: '1300', workType: 'illustration', fileCount: 1 } }, env.mediaDir);
    const summary = await runOccurrence(env, {
      targets: [target('bot1-illust', CREDENTIAL_A)],
      pixiv,
      at: AT,
    });

    const row = env.db.deliveries.getById(`${summary.slotId}:bot1-illust`)!;
    // slotId -> targetId -> workId -> idempotencyKey -> reviewId, all on one row.
    expect(row.slotId).toBe(summary.slotId);
    expect(row.targetId).toBe('bot1-illust');
    expect(row.workType).toBe('illustration');
    expect(row.pixivId).toBe('1300');
    expect(row.idempotencyKey).toBe(`bot1-illust:illustration:1300:${summary.slotId}`);
    expect(row.remoteId).toBe(env.telepost.records[0].reviewId);
    expect(row.status).toBe('delivered');

    // The same tuple is recoverable from the outbox row for post-mortems.
    const outboxRow = env.db.outbox.getByKey('delivery', row.idempotencyKey)!;
    expect(outboxRow.deliveryId).toBe(row.id);
    expect(outboxRow.deliveryTarget).toBe('bot1-illust');
  });

  it('the outbox deduplicates on (kind, idempotency_key) at enqueue time', () => {
    const enqueueOnce = () =>
      env.db.outbox.enqueue({
        kind: 'delivery',
        deliveryTarget: 'bot1',
        idempotencyKey: 'k-dedupe',
        payload: { files: [], context: {} },
      });
    const a = enqueueOnce();
    const b = enqueueOnce();
    expect(b.id).toBe(a.id);
    expect(env.db.outbox.list('pending')).toHaveLength(1);
  });
});
