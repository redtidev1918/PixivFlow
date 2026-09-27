/**
 * Workflow Protocol v1 event stream (§events) — contract tests against LIVE
 * producer output.
 *
 * `contract.test.ts` replays the vendored fixtures; this suite validates what
 * the producer actually serves: a real Task goes through the real express
 * server, the real admission path, the real `delivery_events` ledger and the
 * real outbox, and every response body is validated against `$defs` with the
 * same dependency-free validator.
 *
 * Two invariants get most of the attention here:
 *   - the ack cursor is a durable, monotonic, idempotent position — acking is
 *     never an error and never touches the job ledger;
 *   - a job that reached a terminal state ALWAYS has its terminal event, so a
 *     consumer that polls after a crash still learns the outcome.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { StandaloneConfig } from '../../config';
import { Database } from '../../storage/Database';
import { DeliveryDispatcher } from '../../delivery/DeliveryDispatcher';
import { EventCallbackError, EventCallbackPayload } from '../../delivery/EventCallbackDelivery';
import { OutboxWorker } from '../../delivery/OutboxWorker';
import {
  PROTOCOL_EVENT_FOR_INTERNAL_KIND,
  PROTOCOL_EVENT_TYPES,
  ProtocolAckResult,
  ProtocolEvent,
  ProtocolEventPage,
  ProtocolEventPayload,
  projectedInternalKinds,
  protocolEventId,
  protocolEventTypeFor,
} from '../../scheduler/JobFacade';
import { ManualJobAdmission } from '../../scheduler/ManualJobAdmission';
import { ManualJobService } from '../../scheduler/ManualJobService';
import { legacyRefetchStatus, legacyRefetchSubmit } from '../../scheduler/ManualRefetchAdapter';
import { ScheduleTriggerServer } from '../../scheduler/ScheduleTriggerServer';
import { SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { validateEntry } from './schema-validator';

const REFETCH_TOKEN = 'refetch-token';
const KEY = '6eb50329-20f2-4ea7-b95b-e4676b50d9f1';
const PLAN_TIMEOUT_MS = 20 * 60 * 1000;
const CALLBACK_URL = 'https://telesubmit-multi-bot.fly.dev/api/bot1/v1/jobs/events';

/** A deployment shaped like production: one plan, one target, one submit route. */
function makeConfig(): StandaloneConfig {
  return {
    pixiv: { accountId: 'default' },
    schedules: [
      {
        id: 'bot1-daily',
        name: 'Bot1 每日',
        enabled: true,
        timezone: 'Asia/Shanghai',
        timeout: PLAN_TIMEOUT_MS,
      },
    ],
    targets: [
      {
        id: 'bot1-illust-botefuku',
        type: 'illustration',
        tag: 'ボテ腹',
        delivery: { target: 'bot1-submit' },
      },
    ],
    delivery: {
      targets: {
        'bot1-submit': {
          type: 'httpMultipart',
          url: 'https://telepost.example/api/bot1/v1/submissions',
          refetchOutcomeUrl: 'https://telepost.example/api/bot1/v1/refetch-outcome',
          fields: { refetch_request_id: '{{refetchRequestId}}' },
        },
      },
    },
    schedulerRuntime: {
      queuedTimeoutMs: 30 * 60 * 1000,
      stallTimeoutMs: 15 * 60 * 1000,
    },
  } as unknown as StandaloneConfig;
}

/** `$defs/Task`, shaped like the canonical fixture. */
function taskBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocol_version: '1',
    job_type: 'candidate_search',
    idempotency_key: KEY,
    correlation_id: 'review-chain:135',
    labels: { origin: 'moderation', tenant: 'bot1' },
    callback_url: CALLBACK_URL,
    deadline_ms: 90 * 60 * 1000,
    params: {
      source: { platform: 'pixiv', account: 'default' },
      query: { tags: ['西瓜肚'], expand: true },
      constraints: {
        exclude: [{ kind: 'work', id: '149713091' }],
        limit: 1,
        scan_limit: 5,
        work_types: ['illustration'],
      },
    },
    ...over,
  };
}

interface Harness {
  db: Database;
  jobs: ManualJobService;
  base: string;
  close: () => void;
}

const auth = { Authorization: `Bearer ${REFETCH_TOKEN}`, 'Content-Type': 'application/json' };

async function boot(): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-events-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  const config = makeConfig();
  const admission = new ManualJobAdmission({
    database: db,
    coordinator: new SlotCoordinator(db),
    config: () => config,
    // Execution is not this suite's subject: accepting the work is enough to
    // make the durable slot/cell real, and the event stream is reconciled from
    // the ledger — never from a live run.
    admit: () => true,
  });
  const jobs = new ManualJobService({ database: db, config: () => config, admission });
  const server = new ScheduleTriggerServer(
    REFETCH_TOKEN,
    {
      listSchedules: () => ['bot1-daily'],
      resolve: () => ({ error: 'unused', status: 404 }),
      run: async () => ({ scheduleId: 'bot1-daily', slotId: 'unused', disposition: 'rejected', status: 'pending' }),
      status: () => ({ scheduleId: 'bot1-daily' }),
      jobs,
      refetch: legacyRefetchSubmit(admission),
      refetchStatus: legacyRefetchStatus(db),
    },
    REFETCH_TOKEN
  );
  const srv = server.start('127.0.0.1', 0);
  if (!srv.listening) {
    await new Promise<void>((resolve) => srv.once('listening', () => resolve()));
  }
  const { port } = srv.address() as { port: number };
  return {
    db,
    jobs,
    base: `http://127.0.0.1:${port}`,
    close: () => {
      server.stop();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function post(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
}

function get(base: string, path: string): Promise<Response> {
  return fetch(`${base}${path}`, { headers: auth });
}

/** Submit the canonical Task and return the accepted job id. */
async function submit(h: Harness, over: Record<string, unknown> = {}): Promise<string> {
  const response = await post(h.base, '/jobs', taskBody(over));
  expect(response.status).toBe(202);
  const { job } = (await response.json()) as { job: Record<string, unknown> };
  return job.job_id as string;
}

async function eventsPage(h: Harness, jobId: string, query = ''): Promise<ProtocolEventPage> {
  const response = await get(h.base, `/jobs/${jobId}/events${query}`);
  expect(response.status).toBe(200);
  return (await response.json()) as ProtocolEventPage;
}

function types(page: ProtocolEventPage): string[] {
  return page.events.map((event) => event.type);
}

/** Drive the ledger to a terminal `failed` cell, exactly as production does. */
function fail(h: Harness, jobId: string, reason = 'queued_too_long', message = '排队超时，未能开始执行'): void {
  const targetId = h.db.slots.getSlot(jobId)!.targetIds[0]!;
  h.db.slots.transitionCell(jobId, targetId, 'failed', message);
  h.db.slots.setCellTerminalReason(jobId, targetId, reason, message);
  h.db.slots.markSlotStatus(jobId, 'failed', message);
}

describe('protocol v1 event stream (live producer output)', () => {
  it('serves a $defs/EventPage that validates against the vendored schema', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      const page = await eventsPage(h, jobId);

      expect(validateEntry('EventPage', page)).toEqual([]);
      expect(page.job_id).toBe(jobId);
      expect(page.unacked).toBe(1);
      expect(typeof page.server_time).toBe('number');

      // Every event is individually schema-valid, because a page is only as
      // valid as its members.
      for (const event of page.events) expect(validateEntry('Event', event)).toEqual([]);

      expect(types(page)).toEqual(['job.accepted']);
      const [accepted] = page.events;
      expect(accepted.protocol_version).toBe('1');
      expect(accepted.job_id).toBe(jobId);
      expect(accepted.correlation_id).toBe('review-chain:135');
      expect(Number.isInteger(accepted.at)).toBe(true);
      expect(accepted.at).toBeGreaterThan(0);
      // Opaque, resolvable, and stable: consumers dedupe on it.
      expect(accepted.event_id).toMatch(/^evt-\d+-\d+$/);

      // The mapping is a decision, not a passthrough: the internal kind is
      // reported as non-normative detail, never as the protocol type.
      expect(accepted.type).not.toBe('job.requested');
      expect((accepted.payload as Record<string, unknown>).detail).toEqual({
        internal_kind: 'job.requested',
      });

      // A page that is not truncated must not invite a pointless next poll.
      expect(page.next_after).toBeUndefined();
    } finally {
      h.close();
    }
  });

  it('keeps the event stream behind the same bearer token as every other endpoint', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      const unauthenticated = await fetch(`${h.base}/jobs/${jobId}/events`);
      expect(unauthenticated.status).toBe(401);

      const badAck = await fetch(`${h.base}/jobs/${jobId}/events/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ack_through: 'evt-1-1' }),
      });
      expect(badAck.status).toBe(401);
    } finally {
      h.close();
    }
  });

  it('answers an unknown job with a protocol $defs/Error, not an empty page', async () => {
    const h = await boot();
    try {
      const response = await get(h.base, '/jobs/does-not-exist/events');
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: Record<string, unknown> };
      expect(validateEntry('Error', body.error)).toEqual([]);
      expect(body.error.code).toBe('invalid_params');
    } finally {
      h.close();
    }
  });

  it('orders events ascending by at and continues from an opaque next_after cursor', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      // A claimed, running slot is what makes `started_at` durable.
      h.db.slots.markSlotStatus(jobId, 'running');

      const page = await eventsPage(h, jobId);
      expect(types(page)).toEqual(['job.accepted', 'job.started']);
      const at = page.events.map((event) => event.at);
      expect([...at].sort((a, b) => a - b)).toEqual(at);

      // `?after=` is the designed continuation, and it is exclusive.
      const rest = await eventsPage(h, jobId, `?after=${encodeURIComponent(page.events[0].event_id)}`);
      expect(types(rest)).toEqual(['job.started']);
      // The position, not the caller's paging, is what `unacked` reports.
      expect(rest.unacked).toBe(2);
    } finally {
      h.close();
    }
  });

  it('serves a $defs/AckResult, is idempotent, and stops replaying what was acked', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      h.db.slots.markSlotStatus(jobId, 'running');
      const page = await eventsPage(h, jobId);
      const last = page.events[page.events.length - 1];

      const first = await post(h.base, `/jobs/${jobId}/events/ack`, { ack_through: last.event_id });
      expect(first.status).toBe(200);
      const acked = (await first.json()) as ProtocolAckResult;
      expect(validateEntry('AckResult', acked)).toEqual([]);
      expect(acked.job_id).toBe(jobId);
      expect(acked.acked).toBe(2);
      expect(acked.unacked).toBe(0);
      expect(typeof acked.server_time).toBe('number');

      // Replaying the same cursor is a no-op that reports the same truth.
      const replay = await post(h.base, `/jobs/${jobId}/events/ack`, { ack_through: last.event_id });
      expect(replay.status).toBe(200);
      const replayed = (await replay.json()) as ProtocolAckResult;
      expect(replayed.job_id).toBe(acked.job_id);
      expect(replayed.acked).toBe(acked.acked);
      expect(replayed.unacked).toBe(acked.unacked);

      // `?unacked=1` is a replay-from-cursor: nothing is left unaacked…
      const drained = await eventsPage(h, jobId, '?unacked=1');
      expect(drained.events).toEqual([]);
      expect(drained.unacked).toBe(0);
      // …but acking never deletes history: a fresh reader still sees it all.
      const full = await eventsPage(h, jobId);
      expect(types(full)).toEqual(['job.accepted', 'job.started']);
    } finally {
      h.close();
    }
  });

  it('treats an unknown or older cursor as a no-op, never an error', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      h.db.slots.markSlotStatus(jobId, 'running');
      const page = await eventsPage(h, jobId);

      // Unknown cursor: accepted, but it can never move the durable position.
      const unknown = await post(h.base, `/jobs/${jobId}/events/ack`, { ack_through: 'evt-99999999999-999999' });
      expect(unknown.status).toBe(200);
      const unknownBody = (await unknown.json()) as ProtocolAckResult;
      expect(validateEntry('AckResult', unknownBody)).toEqual([]);
      expect(unknownBody.acked).toBe(0);
      expect(unknownBody.unacked).toBe(2);
      expect((await eventsPage(h, jobId)).unacked).toBe(2);

      // A row that exists but is internal-only must not be ackable either:
      // otherwise `unacked` could be moved by telemetry the consumer never saw.
      h.db.outbox.recordEvent({ slotId: jobId, event: 'execution.summary', countsAsAttempt: 0 });
      const internal = h.db.outbox.slotEvent(jobId, 'execution.summary')!;
      const opaqueInternal = await post(h.base, `/jobs/${jobId}/events/ack`, {
        ack_through: protocolEventId(internal.ts, internal.id),
      });
      expect(opaqueInternal.status).toBe(200);
      expect(((await opaqueInternal.json()) as ProtocolAckResult).acked).toBe(0);

      // Advancing is monotonic: an older cursor cannot rewind it.
      await post(h.base, `/jobs/${jobId}/events/ack`, { ack_through: page.events[1].event_id });
      expect(((await (await post(h.base, `/jobs/${jobId}/events/ack`, { ack_through: page.events[0].event_id })).json()) as ProtocolAckResult).acked).toBe(2);
      const after = await post(h.base, `/jobs/${jobId}/events/ack`, { ack_through: 'evt-1-1' });
      const final = (await after.json()) as ProtocolAckResult;
      expect(final.acked).toBe(2);
      expect(final.unacked).toBe(0);
    } finally {
      h.close();
    }
  });

  it('rejects a malformed ack body with a protocol error and leaves the cursor alone', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      for (const body of [{}, { ack_through: '' }, { ack_through: 42 }]) {
        const response = await post(h.base, `/jobs/${jobId}/events/ack`, body);
        expect(response.status).toBe(400);
        const parsed = (await response.json()) as { error: Record<string, unknown> };
        expect(validateEntry('Error', parsed.error)).toEqual([]);
        expect(parsed.error.code).toBe('invalid_params');
      }
      expect((await eventsPage(h, jobId)).unacked).toBe(1);

      const badQuery = await get(h.base, `/jobs/${jobId}/events?unacked=maybe`);
      expect(badQuery.status).toBe(400);
    } finally {
      h.close();
    }
  });

  it('never mutates the job when a cursor is acknowledged', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      h.db.slots.markSlotStatus(jobId, 'running');
      const before = (await (await get(h.base, `/jobs/${jobId}`)).json()) as Record<string, unknown>;
      const page = await eventsPage(h, jobId);

      await post(h.base, `/jobs/${jobId}/events/ack`, { ack_through: page.events[page.events.length - 1].event_id });

      const after = (await (await get(h.base, `/jobs/${jobId}`)).json()) as Record<string, unknown>;
      expect(after).toEqual(before);
    } finally {
      h.close();
    }
  });

  it('always exposes the terminal event of a failed job, even after a full ack', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      h.db.slots.markSlotStatus(jobId, 'running');
      fail(h, jobId, 'delivery_failed', '交付失败');

      const page = await eventsPage(h, jobId);
      expect(validateEntry('EventPage', page)).toEqual([]);
      expect(types(page)).toEqual(['job.accepted', 'job.started', 'job.failed']);
      const terminal = page.events[page.events.length - 1];
      expect(validateEntry('Event', terminal)).toEqual([]);
      expect((terminal.payload as Record<string, unknown>).detail).toEqual({
        internal_kind: 'job.outcome_failed',
      });
      // The failure travels with the same Job body the endpoint serves, plus a
      // closed-enum protocol error — never the raw internal reason code.
      const payload = terminal.payload as ProtocolEventPayload;
      expect(payload.job!.status).toBe('failed');
      expect(payload.error).toBeDefined();
      expect(validateEntry('Error', payload.error)).toEqual([]);
      expect(payload.error!.code).toBe('delivery_failed');

      // A terminal page is never empty, and acking cannot make it empty: the
      // terminal event is history, not a mailbox slot.
      await post(h.base, `/jobs/${jobId}/events/ack`, { ack_through: terminal.event_id });
      const afterAck = await eventsPage(h, jobId);
      expect(afterAck.events.length).toBeGreaterThan(0);
      expect(types(afterAck)).toContain('job.failed');
      expect(afterAck.unacked).toBe(0);
      // Re-reads are stable: reconciling is idempotent, never duplicating.
      expect((await eventsPage(h, jobId)).events).toEqual(afterAck.events);
    } finally {
      h.close();
    }
  });

  it('distinguishes a queued-timeout expiry from a real failure', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      fail(h, jobId, 'queued_too_long', '排队超时，未能开始执行');

      const page = await eventsPage(h, jobId);
      expect(validateEntry('EventPage', page)).toEqual([]);
      // A job that never started still gets exactly one honest terminal event,
      // and the queue timeout is an expiry — not a delivery failure.
      expect(types(page)).toEqual(['job.accepted', 'job.expired']);
      const terminal = page.events[page.events.length - 1];
      expect(validateEntry('Event', terminal)).toEqual([]);
      expect((terminal.payload as Record<string, unknown>).detail).toEqual({
        internal_kind: 'job.outcome_expired',
      });
      const payload = terminal.payload as ProtocolEventPayload;
      expect(payload.job!.status).toBe('expired');
      expect(payload.error!.code).toBe('queued_too_long');
      expect(payload.job!.started_at ?? null).toBeNull();
    } finally {
      h.close();
    }
  });

  it('always exposes the terminal event of a succeeded job with its result', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      const targetId = h.db.slots.getSlot(jobId)!.targetIds[0]!;
      h.db.slots.markSlotStatus(jobId, 'running');
      h.db.slots.transitionCell(jobId, targetId, 'submitted');
      h.db.slots.markSlotStatus(jobId, 'success');

      const page = await eventsPage(h, jobId);
      expect(validateEntry('EventPage', page)).toEqual([]);
      expect(types(page)).toContain('job.succeeded');
      const terminal = page.events[page.events.length - 1];
      expect(validateEntry('Event', terminal)).toEqual([]);
      const payload = terminal.payload as ProtocolEventPayload;
      expect(payload.job!.status).toBe('succeeded');
      expect(payload.result).toBeDefined();
      expect((terminal.payload as Record<string, unknown>).error).toBeUndefined();
    } finally {
      h.close();
    }
  });

  it('exposes the terminal event of a cancelled job', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      const cancelled = await post(h.base, `/jobs/${jobId}/cancel`, {});
      expect([200, 202]).toContain(cancelled.status);

      const page = await eventsPage(h, jobId);
      expect(validateEntry('EventPage', page)).toEqual([]);
      expect(types(page)).toContain('job.cancelled');
      expect(page.events.length).toBeGreaterThan(0);
    } finally {
      h.close();
    }
  });

  it('serves the event stream for a job that declared no callback_url, and pushes nothing', async () => {
    const h = await boot();
    try {
      // `callback_url` is optional (§Task): the pull channel must not depend on it.
      const jobId = await submit(h, { callback_url: null });
      fail(h, jobId, 'no_candidate', '无候选作品');

      const page = await eventsPage(h, jobId);
      expect(validateEntry('EventPage', page)).toEqual([]);
      expect(types(page)).toEqual(['job.accepted', 'job.failed']);
      expect(page.unacked).toBe(2);
      // With no declared endpoint there is exactly nothing owed and nothing to
      // guess at: an absent callback is not an empty-string target.
      expect(h.db.outbox.getByKey('event_callback', `job-event:${jobId}:${page.events[0].event_id}`)).toBeNull();
    } finally {
      h.close();
    }
  });

  it('records the declared callback_url as one durable, deduped outbox intent per event', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      const page = await eventsPage(h, jobId);
      const accepted = page.events[0];

      const key = `job-event:${jobId}:${accepted.event_id}`;
      const row = h.db.outbox.getByKey('event_callback', key);
      expect(row).not.toBeNull();
      expect(row!.kind).toBe('event_callback');
      expect(row!.deliveryTarget).toBe(CALLBACK_URL);
      expect(row!.status).toBe('pending');
      expect(row!.maxAttempts).toBe(8);

      const payload = JSON.parse(row!.payloadJson) as EventCallbackPayload;
      expect(payload.job_id).toBe(jobId);
      expect(payload.context).toEqual({ slotId: jobId });
      // The callback body is produced by the same builder as the endpoint, so
      // a receiver can never be handed a shape the reader would not serve.
      expect(validateEntry('Event', payload.event)).toEqual([]);
      expect((payload.event as ProtocolEvent).event_id).toBe(accepted.event_id);
      expect((payload.event as ProtocolEvent).type).toBe('job.accepted');

      // Reading twice, or reconciling at a terminal transition, never queues a
      // second copy of the same event.
      await eventsPage(h, jobId);
      fail(h, jobId);
      await eventsPage(h, jobId);
      const terminalRow = h.db.outbox.getByKey(
        'event_callback',
        `job-event:${jobId}:${(await eventsPage(h, jobId)).events.slice(-1)[0].event_id}`
      );
      expect(terminalRow).not.toBeNull();
      expect(terminalRow!.id).not.toBe(row!.id);
      expect(h.db.outbox.getByKey('event_callback', key)!.id).toBe(row!.id);
    } finally {
      h.close();
    }
  });

  it('keeps events readable whether or not the callback was delivered', async () => {
    const h = await boot();
    try {
      const jobId = await submit(h);
      const delivered: Array<{ url: string; payload: EventCallbackPayload }> = [];
      const worker = new OutboxWorker(h.db, {
        isReady: async () => true,
        deliverEventCallback: async (url: string, request: { payload: EventCallbackPayload }) => {
          delivered.push({ url, payload: request.payload });
          return 200;
        },
      } as unknown as DeliveryDispatcher);

      const summary = await worker.drainOnce();
      expect(summary.done).toBe(1);
      expect(delivered).toHaveLength(1);
      expect(delivered[0].url).toBe(CALLBACK_URL);
      expect(validateEntry('Event', delivered[0].payload.event)).toEqual([]);
      const deliveredEventId = (delivered[0].payload.event as ProtocolEvent).event_id;
      expect(h.db.outbox.getByKey('event_callback', `job-event:${jobId}:${deliveredEventId}`)!.status).toBe('done');

      // The pull channel is independent of the push channel.
      const page = await eventsPage(h, jobId);
      expect(types(page)).toEqual(['job.accepted']);
      expect(page.unacked).toBe(1);
    } finally {
      h.close();
    }
  });

  it('retries a failing callback and dead-letters a permanent one, without ever touching the job', async () => {
    const h = await boot();
    try {
      // Remote 5xx: retryable, so the intent stays owed and is rescheduled.
      const jobId = await submit(h);
      const before = (await (await get(h.base, `/jobs/${jobId}`)).json()) as Record<string, unknown>;
      const eventId = (await eventsPage(h, jobId)).events[0].event_id;
      const key = `job-event:${jobId}:${eventId}`;

      const transient = new OutboxWorker(h.db, {
        isReady: async () => true,
        deliverEventCallback: async () => {
          throw new EventCallbackError('job event callback answered HTTP 503', 503);
        },
      } as unknown as DeliveryDispatcher);
      expect((await transient.drainOnce()).retried).toBe(1);
      const retrying = h.db.outbox.getByKey('event_callback', key)!;
      expect(retrying.status).toBe('retry_wait');
      expect(retrying.attempts).toBe(1);
      expect(retrying.lastError).toContain('503');
      // The intent is auditable in the one ledger — never silently dropped.
      expect(h.db.outbox.slotEvent(jobId, 'outbox.retry_scheduled')).not.toBeNull();
      expect(h.db.outbox.slotEvent(jobId, 'outbox.dead')).toBeNull();
      // The events endpoint is unaffected by a failed push.
      expect(types(await eventsPage(h, jobId))).toEqual(['job.accepted']);

      // Remote 4xx: permanent, so it is dead-lettered and still auditable.
      const permanentJobId = await submit(h, { idempotency_key: 'AAAAAAAA-20f2-4ea7-b95b-e4676b50d9f1' });
      const permanentEventId = (await eventsPage(h, permanentJobId)).events[0].event_id;
      const permanentKey = `job-event:${permanentJobId}:${permanentEventId}`;
      const permanent = new OutboxWorker(h.db, {
        isReady: async () => true,
        deliverEventCallback: async () => {
          throw new EventCallbackError('job event callback answered HTTP 404', 404);
        },
      } as unknown as DeliveryDispatcher);
      expect((await permanent.drainOnce()).dead).toBe(1);
      const dead = h.db.outbox.getByKey('event_callback', permanentKey)!;
      expect(dead.status).toBe('dead');
      expect(dead.lastError).toContain('404');
      expect(h.db.outbox.slotEvent(permanentJobId, 'outbox.dead')).not.toBeNull();

      // A failed callback is not a failed job, and never hides the job's events.
      const after = (await (await get(h.base, `/jobs/${jobId}`)).json()) as Record<string, unknown>;
      expect(after).toEqual(before);
      expect(types(await eventsPage(h, jobId))).toEqual(['job.accepted']);
      expect(types(await eventsPage(h, permanentJobId))).toEqual(['job.accepted']);
    } finally {
      h.close();
    }
  });

  it('maps every internal event kind in the source tree explicitly, and drops the unknown', async () => {
    const ledgerKinds = [
      'job.requested',
      'job.execution_started',
      'job.progressed',
      'job.outcome_succeeded',
      'job.outcome_failed',
      'job.outcome_expired',
      'job.outcome_cancelled',
      'execution.summary',
      'delivery.duplicate',
      'media.fallback',
      'outbox.claimed',
      'outbox.deferred',
      'outbox.delivered',
      'outbox.retry_scheduled',
      'outbox.dead',
      'outbox.cancelled',
      'outbox.replay_requested',
    ];
    for (const kind of ledgerKinds) {
      expect(Object.prototype.hasOwnProperty.call(PROTOCOL_EVENT_FOR_INTERNAL_KIND, kind)).toBe(true);
    }

    // The projected set is exactly the lifecycle kinds: no internal-only row can
    // ever enter a page (and so can never pin `unacked`).
    expect(new Set(projectedInternalKinds())).toEqual(
      new Set(ledgerKinds.filter((kind) => kind.startsWith('job.')))
    );

    // Every protocol type is reachable from some internal kind.
    expect(new Set(Object.values(PROTOCOL_EVENT_FOR_INTERNAL_KIND).filter(Boolean))).toEqual(
      new Set(PROTOCOL_EVENT_TYPES)
    );

    // A brand-new internal kind is DROPPED, never passed through as an unknown
    // protocol type.
    expect(protocolEventTypeFor('job.brand_new_thing')).toBeNull();
    expect(protocolEventTypeFor('totally.unmapped')).toBeNull();

    // Census the real source tree: any `event: '…'` literal that reaches the
    // delivery ledger must be a mapped key. The allowlist is exactly the
    // logger/outcome vocabularies, which are not `delivery_events` kinds.
    const notLedgerKinds = new Set([
      'schedule.outcome',
      'schedule.trigger_accepted',
      'schedule.trigger_already_running',
      'schedule.trigger_already_completed',
      'schedule.trigger_rejected',
      'schedule.trigger_received',
    ]);
    const literals = new Set<string>();
    for (const file of sourceFiles(join(__dirname, '..', '..'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/event:\s*'([^']+)'/g)) literals.add(match[1]);
    }
    expect(literals.size).toBeGreaterThan(0);
    const unmapped = [...literals].filter(
      (kind) =>
        !notLedgerKinds.has(kind) &&
        !Object.prototype.hasOwnProperty.call(PROTOCOL_EVENT_FOR_INTERNAL_KIND, kind)
    );
    expect(unmapped).toEqual([]);
  });
});

/** Every `.ts` file under `src`, minus the tests themselves. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}
