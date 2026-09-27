/**
 * Workflow Protocol v1 job facade — contract tests against LIVE producer output.
 *
 * `contract.test.ts` replays the vendored fixtures; this suite validates what
 * the producer actually produces: a real request goes through the real express
 * server, the real admission path and the real ledger, and the response body is
 * validated against `$defs` with the same dependency-free validator.
 *
 * Execution itself (the download) is deliberately out of scope: `admit` is
 * stubbed to "accepted", so every job here stays `queued` — which is exactly
 * the state the protocol's identity/liveness contract is hardest to get right
 * in, and the state a consumer observes first.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { StandaloneConfig } from '../../config';
import { Database } from '../../storage/Database';
import { parseCandidateSearchParamsJson } from '../../scheduler/CandidateSearchParams';
import { ManualJobAdmission } from '../../scheduler/ManualJobAdmission';
import { ManualJobService } from '../../scheduler/ManualJobService';
import { legacyRefetchStatus, legacyRefetchSubmit } from '../../scheduler/ManualRefetchAdapter';
import { ScheduleTriggerServer } from '../../scheduler/ScheduleTriggerServer';
import { SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { BUSINESS_TERMS, hasTerm, jsonKeys, validateEntry } from './schema-validator';

const REFETCH_TOKEN = 'refetch-token';
const KEY = '6eb50329-20f2-4ea7-b95b-e4676b50d9f1';
const PLAN_TIMEOUT_MS = 20 * 60 * 1000;

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

/**
 * The shape that actually breaks the generic face: several targets that each
 * wire manual candidate search, spread over two plans. Production runs exactly
 * this (2 bots × illustration/novel), which is why "discover the unique eligible
 * target" can never be satisfied there and an explicit selector is required.
 */
function makeMultiTargetConfig(): StandaloneConfig {
  const all = ['bot1-illust-botefuku', 'bot1-novel-botefuku', 'bot2-illust-marunomi', 'bot2-novel-marunomi'];
  return {
    pixiv: { accountId: 'default' },
    schedules: [
      {
        id: 'bot1-daily',
        name: 'Bot1 每日',
        enabled: true,
        timezone: 'Asia/Shanghai',
        timeout: PLAN_TIMEOUT_MS,
        targetIds: ['bot1-illust-botefuku', 'bot1-novel-botefuku'],
      },
      {
        id: 'bot2-daily',
        name: 'Bot2 每日',
        enabled: true,
        timezone: 'Asia/Shanghai',
        timeout: PLAN_TIMEOUT_MS,
        targetIds: ['bot2-illust-marunomi', 'bot2-novel-marunomi'],
      },
    ],
    targets: all.map((id) => ({
      id,
      type: id.includes('novel') ? 'novel' : 'illustration',
      tag: id.startsWith('bot1') ? 'ボテ腹' : '丸呑み',
      delivery: { target: id.startsWith('bot1') ? 'bot1-submit' : 'bot2-submit' },
    })),
    delivery: {
      targets: {
        'bot1-submit': {
          type: 'httpMultipart',
          url: 'https://telepost.example/api/bot1/v1/submissions',
          refetchOutcomeUrl: 'https://telepost.example/api/bot1/v1/refetch-outcome',
          fields: { refetch_request_id: '{{refetchRequestId}}' },
        },
        'bot2-submit': {
          type: 'httpMultipart',
          url: 'https://telepost.example/api/bot2/v1/submissions',
          refetchOutcomeUrl: 'https://telepost.example/api/bot2/v1/refetch-outcome',
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
    callback_url: 'https://telesubmit-multi-bot.fly.dev/api/bot1/v1/jobs/events',
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

/**
 * The exact body TelePost's port sends today: no `query`, no `constraints`,
 * nothing but the target it wants (`telepost/application/pixivflow_jobs.py`
 * `_protocol_submit`). It is the request the live acceptance run once answered
 * with `400 params.query must be a JSON object`.
 */
function telepostShapedBody(targetId: string, key: string): Record<string, unknown> {
  return {
    protocol_version: '1',
    job_type: 'candidate_search',
    idempotency_key: key,
    correlation_id: 'refetch-42',
    params: { target_id: targetId },
  };
}

interface Harness {
  db: Database;
  config: StandaloneConfig;
  base: string;
  close: () => void;
}

const auth = { Authorization: `Bearer ${REFETCH_TOKEN}`, 'Content-Type': 'application/json' };

async function boot(overrides: StandaloneConfig = makeConfig()): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-jobfacade-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  const config = overrides;
  const admission = new ManualJobAdmission({
    database: db,
    coordinator: new SlotCoordinator(db),
    config: () => config,
    // Execution is not this suite's subject: accepting the work is enough to
    // make the durable slot/cell real, which is what the facade reads.
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
      // The real production adapters, not copies: both endpoints must ride the
      // one shared admission and one identity space.
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
    config,
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

describe('protocol v1 job facade (live producer output)', () => {
  it('serves a live Job that validates against $defs/Job, and reads it back', async () => {
    const h = await boot();
    try {
      const response = await post(h.base, '/jobs', taskBody());
      expect(response.status).toBe(202);
      const { job } = (await response.json()) as { job: Record<string, unknown> };

      expect(validateEntry('Job', job)).toEqual([]);
      expect(job.protocol_version).toBe('1');
      expect(job.job_type).toBe('candidate_search');
      expect(job.status).toBe('queued');
      expect(job.idempotency_key).toBe(KEY);
      // Opaque correlation: stored and echoed, never interpreted.
      expect(job.correlation_id).toBe('review-chain:135');
      expect(typeof job.created_at).toBe('number');
      expect(typeof job.updated_at).toBe('number');
      // A job id is an opaque handle, not a ledger coordinate.
      expect(job.job_id).not.toContain('refetch');
      expect(Object.keys(job)).not.toContain('slot_id');

      const byId = await get(h.base, `/jobs/${job.job_id}`);
      expect(byId.status).toBe(200);
      const readBack = (await byId.json()) as Record<string, unknown>;
      expect(validateEntry('Job', readBack)).toEqual([]);
      expect(readBack).toEqual(job);

      const page = await get(h.base, `/jobs?idempotency_key=${KEY}`);
      expect(page.status).toBe(200);
      const body = (await page.json()) as { jobs: Array<Record<string, unknown>> };
      expect(validateEntry('JobPage', body)).toEqual([]);
      expect(body.jobs.map((item) => item.job_id)).toEqual([job.job_id]);
    } finally {
      h.close();
    }
  });

  it('keeps timestamps, heartbeat and lease honest across the job lifecycle', async () => {
    const h = await boot();
    try {
      const created = (await (await post(h.base, '/jobs', taskBody())).json()) as { job: Record<string, unknown> };
      const jobId = created.job.job_id as string;
      // queued: no start, no heartbeat, no lease, but a created/updated stamp.
      expect(created.job.status).toBe('queued');
      expect(created.job.started_at).toBeNull();
      expect(created.job.lease_active).toBe(false);
      expect(typeof created.job.created_at).toBe('number');
      expect(typeof created.job.updated_at).toBe('number');

      // running: a live worker holds the lease and heartbeats.
      const targetId = h.db.slots.getSlot(jobId)!.targetIds[0]!;
      h.db.slots.markSlotStatus(jobId, 'running');
      h.db.slots.transitionCell(jobId, targetId, 'selected');
      const now = Date.now();
      h.db.slots.claimSlotLease(jobId, 'worker-1', now + 60_000, now);
      const running = (await (await get(h.base, `/jobs/${jobId}`)).json()) as Record<string, unknown>;
      expect(validateEntry('Job', running)).toEqual([]);
      expect(running.status).toBe('running');
      expect(typeof running.started_at).toBe('number');
      expect(typeof running.heartbeat_at).toBe('number');
      expect(running.lease_active).toBe(true);
      expect(running.lease_expires_at).toBe(now + 60_000);
      expect((running.progress as Record<string, unknown>).stage).toBe('searching');

      // terminal: the same projection, with the outcome the consumer reads.
      h.db.slots.transitionCell(jobId, targetId, 'submitted');
      h.db.slots.markSlotStatus(jobId, 'success');
      const done = (await (await get(h.base, `/jobs/${jobId}`)).json()) as Record<string, unknown>;
      expect(validateEntry('Job', done)).toEqual([]);
      expect(done.status).toBe('succeeded');
      expect(typeof done.updated_at).toBe('number');
      // `error` is optional in the schema; a successful job simply has none.
      expect(done.error).toBeUndefined();
    } finally {
      h.close();
    }
  });

  it('answers a duplicate idempotency_key with the same job and creates exactly one slot and one delivery', async () => {
    const h = await boot();
    try {
      const first = (await (await post(h.base, '/jobs', taskBody())).json()) as { job: Record<string, unknown> };
      const slot = h.db.slots.findManualSlotByKey(KEY)!;
      expect(slot).toBeDefined();
      const targetId = slot.targetIds[0];
      // The executor would have created this intent; the facade must never make
      // a second one for a replayed key.
      h.db.deliveries.insertIntent({
        id: 'delivery-1',
        deliveryTarget: 'bot1-submit',
        workType: 'illustration',
        pixivId: '149713091',
        slotId: slot.id,
        targetId,
        idempotencyKey: 'delivery-key-1',
      });
      h.db.outbox.enqueue({
        kind: 'delivery',
        idempotencyKey: 'outbox-key-1',
        deliveryId: 'delivery-1',
        deliveryTarget: 'bot1-submit',
        payload: {},
      });

      const second = await post(h.base, '/jobs', taskBody());
      // A replay is not a new resource: the same Job, idempotently.
      expect([200, 202]).toContain(second.status);
      const replay = (await second.json()) as { job: Record<string, unknown> };
      expect(replay.job.job_id).toBe(first.job.job_id);

      const mine = h.db.slots.getRecentSlots(50).filter((row) => row.manualRequestId === KEY);
      expect(mine).toHaveLength(1);
      expect(mine[0].id).toBe(first.job.job_id);
      expect(h.db.deliveries.listForSlotCell(slot.id, targetId)).toHaveLength(1);
      expect(h.db.outbox.listForDeliveryIds(['delivery-1']).size).toBe(1);
    } finally {
      h.close();
    }
  });

  it('refuses a reused key carrying different params instead of silently reinterpreting the job', async () => {
    const h = await boot();
    try {
      await post(h.base, '/jobs', taskBody());
      const conflicting = await post(
        h.base,
        '/jobs',
        taskBody({
          params: {
            source: { platform: 'pixiv', account: 'default' },
            query: { tags: ['別のタグ'] },
          },
        })
      );
      expect(conflicting.status).toBe(409);
      const body = (await conflicting.json()) as { error?: Record<string, unknown> };
      expect(validateEntry('Error', body.error)).toEqual([]);
      expect(body.error?.code).toBe('idempotency_conflict');
      expect(body.error?.retryable).toBe(false);
      expect(h.db.slots.getRecentSlots(50).filter((row) => row.manualRequestId === KEY)).toHaveLength(1);
    } finally {
      h.close();
    }
  });

  it('answers unprotocolable requests with a protocol Error body', async () => {
    const h = await boot();
    try {
      const version = await post(h.base, '/jobs', taskBody({ protocol_version: '2' }));
      expect(version.status).toBe(400);
      const versionBody = (await version.json()) as { error: Record<string, unknown> };
      expect(validateEntry('Error', versionBody.error)).toEqual([]);
      expect(versionBody.error.code).toBe('unsupported_protocol_version');
      expect(versionBody.error.retryable).toBe(false);

      const jobType = await post(h.base, '/jobs', taskBody({ job_type: 'video_upload' }));
      expect(jobType.status).toBe(400);
      const jobTypeBody = (await jobType.json()) as { error: Record<string, unknown> };
      expect(validateEntry('Error', jobTypeBody.error)).toEqual([]);
      // The published enum has no `unsupported_job_type`; §11.1 says invalid_params.
      expect(jobTypeBody.error.code).toBe('invalid_params');

      const params = await post(h.base, '/jobs', taskBody({ params: { query: { tags: [] } } }));
      expect(params.status).toBe(400);
      const paramsBody = (await params.json()) as { error: Record<string, unknown> };
      expect(validateEntry('Error', paramsBody.error)).toEqual([]);
      expect(paramsBody.error.code).toBe('invalid_params');
      expect(paramsBody.error.retryable).toBe(false);

      const unknown = await get(h.base, '/jobs/does-not-exist');
      expect(unknown.status).toBe(404);
      const unknownBody = (await unknown.json()) as { error: Record<string, unknown> };
      expect(validateEntry('Error', unknownBody.error)).toEqual([]);
      expect(unknownBody.error.code).toBe('invalid_params');
    } finally {
      h.close();
    }
  });

  it('cancels idempotently, terminalises the job and stops further deliveries', async () => {
    const h = await boot();
    try {
      const created = (await (await post(h.base, '/jobs', taskBody())).json()) as { job: Record<string, unknown> };
      const jobId = created.job.job_id as string;
      const slot = h.db.slots.getSlot(jobId)!;
      const targetId = slot.targetIds[0]!;
      h.db.deliveries.insertIntent({
        id: 'delivery-1',
        deliveryTarget: 'bot1-submit',
        workType: 'illustration',
        pixivId: '149713091',
        slotId: slot.id,
        targetId,
        idempotencyKey: 'delivery-key-1',
      });
      const pending = h.db.outbox.enqueue({
        kind: 'delivery',
        idempotencyKey: 'outbox-key-1',
        deliveryId: 'delivery-1',
        deliveryTarget: 'bot1-submit',
        payload: {},
      });
      expect(h.db.outbox.hasActionableDelivery('delivery-1')).toBe(true);

      const cancelled = await post(h.base, `/jobs/${jobId}/cancel`, {});
      expect(cancelled.status).toBe(200);
      const job = (await cancelled.json()) as Record<string, unknown>;
      expect(validateEntry('Job', job)).toEqual([]);
      expect(job.status).toBe('cancelled');
      const error = job.error as Record<string, unknown>;
      expect(validateEntry('Error', error)).toEqual([]);
      expect(error.code).toBe('cancelled_by_consumer');
      expect(error.retryable).toBe(false);
      // The internal vocabulary stays available for diagnosis, prefixed.
      expect((error.detail as Record<string, unknown>).internal_code).toBe('cancelled_by_consumer');

      const cell = h.db.slots.getCell(jobId, targetId)!;
      expect(cell.status).toBe('failed');
      expect(cell.terminalReasonCode).toBe('cancelled_by_consumer');
      // Stopping delivery is part of the cancel, in the same transaction.
      expect(h.db.outbox.get(pending.id)!.status).toBe('cancelled');
      expect(h.db.outbox.hasActionableDelivery('delivery-1')).toBe(false);

      const again = await post(h.base, `/jobs/${jobId}/cancel`, {});
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual(job);
    } finally {
      h.close();
    }
  });

  it('exposes no producer-private or consumer-business vocabulary in the job surface keys', async () => {
    const h = await boot();
    try {
      const capabilities = (await (await get(h.base, '/capabilities')).json()) as Record<string, unknown>;
      const created = (await (await post(h.base, '/jobs', taskBody())).json()) as Record<string, unknown>;
      const page = (await (await get(h.base, `/jobs?idempotency_key=${KEY}`)).json()) as Record<string, unknown>;
      const failed = (await (await get(h.base, '/jobs/does-not-exist')).json()) as Record<string, unknown>;

      const keys = [...jsonKeys(capabilities), ...jsonKeys(created), ...jsonKeys(page), ...jsonKeys(failed)];
      const offenders = keys
        .filter(([, key]) => BUSINESS_TERMS.some((term) => hasTerm(key, term)))
        .map(([where, key]) => `${where} = ${key}`);
      expect(offenders).toEqual([]);

      // `job_id` is the slot id, but the field NAME must not leak the ledger.
      expect(Object.keys(created)).toEqual(['job']);
      expect(Object.keys(created.job as Record<string, unknown>)).not.toContain('slotId');
      expect(Object.keys(created.job as Record<string, unknown>)).not.toContain('refetch_request_id');
    } finally {
      h.close();
    }
  });

  it('declares budgets the live configuration owns', async () => {
    const h = await boot();
    try {
      const read = async (): Promise<Record<string, unknown>> => {
        const body = (await (await get(h.base, '/capabilities')).json()) as {
          job_types: Array<Record<string, unknown>>;
        };
        expect(validateEntry('Capabilities', body)).toEqual([]);
        return body.job_types[0];
      };

      const declared = await read();
      expect(declared.name).toBe('candidate_search');
      expect(declared.params_schema).toBe('#/$defs/CandidateSearchParams');
      expect(declared.result_schema).toBe('#/$defs/Result_CandidateSearch');
      expect(declared.queued_timeout_ms).toBe(30 * 60 * 1000);
      expect(declared.stall_timeout_ms).toBe(15 * 60 * 1000);
      expect(declared.heartbeat_interval_ms).toBe(30000);
      expect(declared.default_deadline_ms).toBe(PLAN_TIMEOUT_MS);

      // Change the config, and the declaration follows: budgets are derived,
      // never hardcoded.
      h.config.schedulerRuntime!.queuedTimeoutMs = 11 * 60 * 1000;
      h.config.schedulerRuntime!.stallTimeoutMs = 7 * 60 * 1000;
      const updated = await read();
      expect(updated.queued_timeout_ms).toBe(11 * 60 * 1000);
      expect(updated.stall_timeout_ms).toBe(7 * 60 * 1000);

      // A job reports the ceiling this deployment actually enforces.
      const created = (await (await post(h.base, '/jobs', taskBody())).json()) as { job: Record<string, unknown> };
      const slot = h.db.slots.getSlot(created.job.job_id as string)!;
      expect(created.job.deadline_at).toBe(slot.occurrenceAt! + PLAN_TIMEOUT_MS);
    } finally {
      h.close();
    }
  });

  it('keeps the legacy refetch endpoints byte-compatible over the shared admission path', async () => {
    const h = await boot();
    try {
      const response = await fetch(`${h.base}/internal/targets/bot1-illust-botefuku/refetch`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ requestId: KEY, correlationId: 'legacy-chain-1' }),
      });
      expect(response.status).toBe(202);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ status: 'accepted', disposition: 'accepted' });
      expect(body.slotId).toBe(`bot1-daily@manual-${KEY}`);
      expect(body.requestId).toBeUndefined();

      // Same identity space: the legacy handle resolves the generic job.
      const generic = (await (await get(h.base, `/jobs?idempotency_key=${KEY}`)).json()) as {
        jobs: Array<Record<string, unknown>>;
      };
      expect(generic.jobs).toHaveLength(1);
      expect(generic.jobs[0].job_id).toBe(body.slotId);

      // The legacy status read keeps its flat projection AND its fields.
      const status = await fetch(`${h.base}/internal/targets/bot1-illust-botefuku/refetch/${KEY}`, {
        headers: auth,
      });
      expect(status.status).toBe(200);
      expect(await status.json()).toMatchObject({
        requestId: KEY,
        slotId: body.slotId,
        state: 'pending',
        slotStatus: 'pending',
        manualRequestId: KEY,
      });
    } finally {
      h.close();
    }
  });
});

describe('protocol v1 job facade (job API disabled)', () => {
  it('fails closed when no job handlers are mounted, without starting a second server', async () => {
    const server = new ScheduleTriggerServer(
      REFETCH_TOKEN,
      {
        listSchedules: () => [],
        resolve: () => ({ error: 'unused', status: 404 }),
        run: async () => ({ scheduleId: 'x', slotId: 'x', disposition: 'rejected', status: 'pending' }),
        status: () => ({}),
      },
      REFETCH_TOKEN
    );
    const srv = server.start('127.0.0.1', 0);
    if (!srv.listening) await new Promise<void>((resolve) => srv.once('listening', () => resolve()));
    const { port } = srv.address() as { port: number };
    try {
      const response = await post(`http://127.0.0.1:${port}`, '/jobs', taskBody());
      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: Record<string, unknown> };
      expect(validateEntry('Error', body.error)).toEqual([]);
      expect(body.error.code).toBe('internal_error');
      expect(body.error.retryable).toBe(false);
    } finally {
      server.stop();
    }
  });
});

/**
 * §3.2 — the explicit target selector, and the exact reason it exists.
 *
 * Production runs FOUR targets that all wire manual candidate search, so v1's
 * "discover the unique eligible target" rule can never be satisfied there: the
 * generic face could only answer `409 ambiguous_target`, while the legacy route
 * (target in the URL) worked. That made the two entry points unable to share one
 * identity space. v1.1 makes the target nameable again — as a SELECTOR.
 */
describe('protocol v1.1 target selector (params.target_id)', () => {
  it("accepts TelePost's exact production body in a deployment with four manual targets", async () => {
    const h = await boot(makeMultiTargetConfig());
    try {
      // `{params: {target_id}}` — no query, no constraints: the literal body
      // `telepost/application/pixivflow_jobs.py:_protocol_submit` builds.
      const response = await post(h.base, '/jobs', telepostShapedBody('bot2-novel-marunomi', KEY));
      expect(response.status).toBe(202);
      const body = (await response.json()) as { job: Record<string, unknown> };
      expect(validateEntry('Job', body.job)).toEqual([]);

      const slot = h.db.slots.findManualSlotByKey(KEY)!;
      expect(slot.targetIds).toEqual(['bot2-novel-marunomi']);
      expect(slot.scheduleId).toBe('bot2-daily');
    } finally {
      h.close();
    }
  });

  it('keeps the selector out of the stored retrieval view, so the target runs as configured', async () => {
    const h = await boot(makeMultiTargetConfig());
    try {
      await post(h.base, '/jobs', telepostShapedBody('bot1-illust-botefuku', KEY));
      const slot = h.db.slots.findManualSlotByKey(KEY)!;
      expect(slot.paramsJson ?? '').not.toContain('target_id');
      // "No retrieval override" is exactly how a pre-protocol refetch behaved.
      expect(parseCandidateSearchParamsJson(slot.paramsJson)).toBeNull();
    } finally {
      h.close();
    }
  });

  it('still refuses an unhinted request when more than one target is eligible', async () => {
    const h = await boot(makeMultiTargetConfig());
    try {
      const response = await post(h.base, '/jobs', { ...taskBody(), idempotency_key: KEY });
      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: Record<string, unknown> };
      expect(validateEntry('Error', body.error)).toEqual([]);
      expect(body.error.code).toBe('invalid_params');
      expect((body.error.detail as Record<string, unknown>).reason).toBe('ambiguous_target');
      expect((body.error.detail as Record<string, unknown>).targets).toEqual([
        'bot1-illust-botefuku',
        'bot1-novel-botefuku',
        'bot2-illust-marunomi',
        'bot2-novel-marunomi',
      ]);
    } finally {
      h.close();
    }
  });

  it('answers an unknown selector with unknown_target instead of inventing a target', async () => {
    const h = await boot(makeMultiTargetConfig());
    try {
      const response = await post(h.base, '/jobs', telepostShapedBody('bot9-illust-nope', KEY));
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: Record<string, unknown> };
      expect(validateEntry('Error', body.error)).toEqual([]);
      expect((body.error.detail as Record<string, unknown>).reason).toBe('unknown_target');
      expect(h.db.slots.findManualSlotByKey(KEY)).toBeNull();
    } finally {
      h.close();
    }
  });

  it('selects a target that does not wire manual delivery only by refusing it', async () => {
    const config = makeMultiTargetConfig();
    // `bot2-novel-marunomi` keeps its target entry but loses the outcome wiring:
    // a selector picks an existing target, it never upgrades one.
    delete (config.delivery as { targets: Record<string, unknown> }).targets['bot2-submit'];
    const h = await boot(config);
    try {
      const response = await post(h.base, '/jobs', telepostShapedBody('bot2-novel-marunomi', KEY));
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: Record<string, unknown> };
      expect((body.error.detail as Record<string, unknown>).reason).toBe('delivery_outcome_not_configured');
    } finally {
      h.close();
    }
  });

  it('rejects a malformed selector instead of silently ignoring it', async () => {
    const h = await boot(makeMultiTargetConfig());
    try {
      for (const bad of [42, '', '   ']) {
        const response = await post(h.base, '/jobs', {
          ...telepostShapedBody('bot1-illust-botefuku', KEY),
          params: { target_id: bad },
        });
        expect(response.status).toBe(400);
        const body = (await response.json()) as { error: Record<string, unknown> };
        expect(body.error.code).toBe('invalid_params');
      }
    } finally {
      h.close();
    }
  });

  it('lets the legacy endpoint and the generic face resolve one identity space', async () => {
    const h = await boot(makeMultiTargetConfig());
    try {
      const viaJobs = (await (
        await post(h.base, '/jobs', telepostShapedBody('bot1-novel-botefuku', KEY))
      ).json()) as { job: Record<string, unknown> };
      const viaJobsId = String(viaJobs.job.job_id);

      // The same key arriving through the legacy URL must be the SAME job, not a
      // second one — this is what §3.1's mapping table promises and what a lost
      // target in the mapping broke.
      const legacy = await post(h.base, '/internal/targets/bot1-novel-botefuku/refetch', {
        requestId: KEY,
        correlationId: 'refetch-42',
      });
      expect(legacy.status).toBe(202);
      const legacyBody = (await legacy.json()) as Record<string, unknown>;
      expect(String(legacyBody.slotId)).toBe(viaJobsId);
      expect(h.db.slots.getRecentSlots(50).filter((row) => row.manualRequestId === KEY)).toHaveLength(1);
    } finally {
      h.close();
    }
  });

  it('declares the selector in /capabilities so consumers can negotiate it', async () => {
    const h = await boot(makeMultiTargetConfig());
    try {
      const capabilities = (await (await get(h.base, '/capabilities')).json()) as {
        job_types: { name: string; features: string[] }[];
      };
      const candidateSearch = capabilities.job_types.find((entry) => entry.name === 'candidate_search')!;
      expect(candidateSearch.features).toEqual(expect.arrayContaining(['target_selector', 'events']));
    } finally {
      h.close();
    }
  });
});
