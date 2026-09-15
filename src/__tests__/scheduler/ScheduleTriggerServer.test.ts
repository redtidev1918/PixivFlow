/**
 * Schedule trigger server auth + per-schedule dispatch tests (live ephemeral
 * express socket). The server is a thin adapter: authenticate, resolve the
 * canonical occurrence, delegate, serialize. It never knows business state.
 */
import http from 'node:http';

import { logger } from '../../logger';
import { ScheduleTriggerServer } from '../../scheduler/ScheduleTriggerServer';

const ctx = {
  slotId: 'schedule-a@2026-09-08T1000',
  scheduleId: 'schedule-a',
  occurrenceAt: Date.parse('2026-09-08T02:00:00Z'),
  occurrenceDate: '2026-09-08',
  occurrenceLabel: '10:00',
  timezone: 'Asia/Shanghai',
  triggerSource: 'http' as const,
  slotName: '10:00',
  slotDate: '2026-09-08',
};

function handlers(overrides: Record<string, unknown> = {}) {
  return {
    listSchedules: () => ['schedule-a', 'schedule-b'],
    resolve: jest.fn(() => ({ context: { ...ctx } })),
    run: jest.fn(async (id: string) => ({
      scheduleId: id,
      slotId: ctx.slotId,
      disposition: 'accepted' as const,
      status: 'pending',
      cells: [{ targetId: 't', status: 'pending', workId: null }],
    })),
    status: jest.fn((id: string) => ({ scheduleId: id, mode: 'external' })),
    ...overrides,
  };
}

describe('ScheduleTriggerServer token resolution', () => {
  it('fails closed with no token (config nor env)', () => {
    const prev = process.env.SCHEDULER_TRIGGER_TOKEN;
    delete process.env.SCHEDULER_TRIGGER_TOKEN;
    expect(ScheduleTriggerServer.resolveToken(undefined)).toBeUndefined();
    expect(ScheduleTriggerServer.resolveToken('')).toBeUndefined();
    process.env.SCHEDULER_TRIGGER_TOKEN = 'env-secret';
    expect(ScheduleTriggerServer.resolveToken(undefined)).toBe('env-secret');
    expect(ScheduleTriggerServer.resolveToken('cfg-secret')).toBe('cfg-secret');
    if (prev === undefined) delete process.env.SCHEDULER_TRIGGER_TOKEN;
    else process.env.SCHEDULER_TRIGGER_TOKEN = prev;
  });
});

describe('trigger endpoint auth + dispatch (live ephemeral express)', () => {
  it('reads exact manual refetch state with the refetch token', async () => {
    const requestId = '6eb50329-20f2-4ea7-b95b-e4676b50d9f1';
    const refetchStatus = jest.fn((targetId: string, id: string) =>
      targetId === 'target-a' && id === requestId
        ? { requestId: id, slotId: 'manual-slot', state: 'delivery_pending', slotStatus: 'running' }
        : null
    );
    const { base, close } = await boot('schedule-token', handlers({ refetchStatus }), 'refetch-token');
    const url = `${base}/internal/targets/target-a/refetch/${requestId}`;
    try {
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { headers: { Authorization: 'Bearer schedule-token' } })).status).toBe(401);
      const response = await fetch(url, { headers: { Authorization: 'Bearer refetch-token' } });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ requestId, state: 'delivery_pending' });
      expect((await fetch(`${base}/internal/targets/other/refetch/${requestId}`, { headers: { Authorization: 'Bearer refetch-token' } })).status).toBe(404);
      expect((await fetch(`${base}/internal/targets/target-a/refetch/bad`, { headers: { Authorization: 'Bearer refetch-token' } })).status).toBe(400);
    } finally {
      close();
    }
  });

  it('accepts a single-target manual refetch only with its own token and a UUID', async () => {
    const refetch = jest.fn(async () => ({ slotId: 'manual-slot', disposition: 'accepted' }));
    const h = handlers({ refetch });
    const { base, close } = await boot('schedule-token', h, 'refetch-token');
    const url = `${base}/internal/targets/target-a/refetch`;
    const requestId = '6eb50329-20f2-4ea7-b95b-e4676b50d9f1';
    try {
      const wrong = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer schedule-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId }) });
      expect(wrong.status).toBe(401);
      const invalid = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer refetch-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'bad' }) });
      expect(invalid.status).toBe(400);
      expect(refetch).not.toHaveBeenCalled();
      const accepted = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer refetch-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, correlationId: 'chain-1' }) });
      expect(accepted.status).toBe(202);
      expect(await accepted.json()).toMatchObject({ status: 'accepted', slotId: 'manual-slot' });
      expect(refetch).toHaveBeenCalledWith('target-a', requestId, 'chain-1');
    } finally {
      close();
    }
  });

  it('accepts an optional correlation id and rejects an oversized one', async () => {
    const refetch = jest.fn(async () => ({ slotId: 'manual-slot', disposition: 'accepted' }));
    const h = handlers({ refetch });
    const { base, close } = await boot('schedule-token', h, 'refetch-token');
    const url = `${base}/internal/targets/target-a/refetch`;
    const requestId = '6eb50329-20f2-4ea7-b95b-e4676b50d9f1';
    try {
      const without = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer refetch-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId }) });
      expect(without.status).toBe(202);
      expect(refetch).toHaveBeenLastCalledWith('target-a', requestId, undefined);
      const oversized = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer refetch-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, correlationId: 'x'.repeat(201) }) });
      expect(oversized.status).toBe(400);
      expect(refetch).toHaveBeenCalledTimes(1);
    } finally {
      close();
    }
  });

  it('rejects requests without a valid bearer token (401)', async () => {
    const { base, close } = await boot('secret-token', handlers());
    try {
      const url = `${base}/internal/schedules/schedule-a/run`;
      const noAuth = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      expect(noAuth.status).toBe(401);
      const badAuth = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
        body: '{}',
      });
      expect(badAuth.status).toBe(401);
    } finally {
      close();
    }
  });

  it('returns 503 when no token configured (fail closed)', async () => {
    const { base, close } = await boot(undefined, handlers());
    try {
      const res = await fetch(`${base}/internal/schedules/schedule-a/run`, { method: 'POST', body: '{}' });
      expect(res.status).toBe(503);
    } finally {
      close();
    }
  });

  it('404 on unknown schedule id and does not run', async () => {
    const h = handlers();
    const { base, close } = await boot('secret-token', h);
    try {
      const res = await fetch(`${base}/internal/schedules/nope/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: '{}',
      });
      expect(res.status).toBe(404);
      expect(h.run).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('dispatches only the requested schedule and answers 202 queued, not "completed"', async () => {
    const h = handlers();
    const { base, close } = await boot('secret-token', h);
    try {
      const res = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: JSON.stringify({ label: '今日早班' }),
      });
      // 202 Accepted: the run was admitted, NOT finished. A clock that reads this
      // as "done" is the bug that silently lost slots in production.
      expect(res.status).toBe(202);
      const body = (await res.json()) as {
        status: string;
        note: string;
        schedule?: { scheduleId: string; slotId: string; disposition: string };
      };
      expect(body.status).toBe('accepted');
      expect(body.note).toBe('queued');
      expect(body.schedule?.disposition).toBe('accepted');
      expect(body.schedule?.scheduleId).toBe('schedule-a');
      expect(body.schedule?.slotId).toBe(ctx.slotId);
      expect(h.run).toHaveBeenCalledTimes(1); // exactly one schedule, not all of them
      expect(h.run).toHaveBeenCalledWith('schedule-a', expect.objectContaining({ slotId: ctx.slotId }));
    } finally {
      close();
    }
  });

  it('a still-running occurrence answers 202 already_running and is never called completed', async () => {
    const h = handlers({
      run: jest.fn(async (id: string) => ({
        scheduleId: id,
        slotId: ctx.slotId,
        disposition: 'already_running' as const,
        status: 'running',
      })),
    });
    const { base, close } = await boot('secret-token', h);
    try {
      const res = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: '{}',
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as { status: string; note: string };
      expect(body.note).toBe('already_running');
      expect(body.status).toBe('running');
      expect(body.note).not.toBe('already_completed');
    } finally {
      close();
    }
  });

  it('a terminal occurrence answers 200 already_completed', async () => {
    const h = handlers({
      run: jest.fn(async (id: string) => ({
        scheduleId: id,
        slotId: ctx.slotId,
        disposition: 'already_completed' as const,
        status: 'success',
        alreadyCompleted: true,
      })),
    });
    const { base, close } = await boot('secret-token', h);
    try {
      const res = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: '{}',
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; note: string };
      expect(body.note).toBe('already_completed');
      expect(body.status).toBe('completed');
    } finally {
      close();
    }
  });

  it('a refusal answers 503 rejected so the clock keeps its retry eligibility', async () => {
    const h = handlers({
      run: jest.fn(async (id: string) => ({
        scheduleId: id,
        slotId: ctx.slotId,
        disposition: 'rejected' as const,
        status: 'pending',
      })),
    });
    const { base, close } = await boot('secret-token', h);
    try {
      const res = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: '{}',
      });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { status: string; note: string };
      expect(body.status).toBe('rejected');
      expect(body.note).toBe('rejected');
    } finally {
      close();
    }
  });

  it('surfaces resolver window errors (e.g. expired occurrence) as 4xx', async () => {
    const h = handlers({
      resolve: jest.fn(() => ({ error: 'occurrence expired (grace 90m)', status: 410 })),
    });
    const { base, close } = await boot('secret-token', h);
    try {
      const res = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: '{}',
      });
      expect(res.status).toBe(410);
      expect(h.run).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('GET /health is open and reports ok', async () => {
    const { base, close } = await boot('secret-token', handlers());
    try {
      const res = await fetch(`${base}/health`);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { status: string }).status).toBe('ok');
    } finally {
      close();
    }
  });

  it('POST /internal/outbox/drain requires auth and delegates to the handler', async () => {
    const drain = jest.fn(async () => ({ processed: 2, done: 2, retried: 0, dead: 0 }));
    const { base, close } = await boot('secret-token', handlers({ drainOutbox: drain }));
    try {
      const unauth = await fetch(`${base}/internal/outbox/drain`, { method: 'POST' });
      expect(unauth.status).toBe(401);
      expect(drain).not.toHaveBeenCalled();

      const res = await fetch(`${base}/internal/outbox/drain`, {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token' },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: 'ok', result: { processed: 2, done: 2 } });
      expect(drain).toHaveBeenCalledTimes(1);
    } finally {
      close();
    }
  });

  it('POST /internal/outbox/drain is 503 when the runtime provides no pump', async () => {
    const { base, close } = await boot('secret-token', handlers({ drainOutbox: undefined }));
    try {
      const res = await fetch(`${base}/internal/outbox/drain`, {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token' },
      });
      expect(res.status).toBe(503);
    } finally {
      close();
    }
  });
});

describe('manual recovery endpoint (§manual-recovery)', () => {
  it('admits a recovery with a named policy preset and reports the mode', async () => {
    const requestId = '6eb50329-20f2-4ea7-b95b-e4676b50d9f1';
    const recover = jest.fn(async () => ({ slotId: 'recover-slot', disposition: 'accepted' }));
    const { base, close } = await boot('schedule-token', handlers({ recover }), 'refetch-token');
    try {
      const relaxed = await fetch(`${base}/internal/targets/target-a/recover`, {
        method: 'POST',
        headers: { Authorization: 'Bearer refetch-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, retryMode: 'relaxed', correlationId: 'schedule-x' }),
      });
      expect(relaxed.status).toBe(202);
      const body = (await relaxed.json()) as { status?: string; retryMode?: string };
      expect(body.status).toBe('accepted');
      expect(body.retryMode).toBe('relaxed');
      expect(recover).toHaveBeenCalledWith('target-a', requestId, 'relaxed', 'schedule-x');

      // No retryMode => the server defaults to the 'normal' preset.
      const normal = await fetch(`${base}/internal/targets/target-a/recover`, {
        method: 'POST',
        headers: { Authorization: 'Bearer refetch-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: '7eb50329-20f2-4ea7-b95b-e4676b50d9f1' }),
      });
      expect(normal.status).toBe(202);
      expect(recover).toHaveBeenLastCalledWith(
        'target-a', '7eb50329-20f2-4ea7-b95b-e4676b50d9f1', 'normal', undefined
      );
    } finally {
      close();
    }
  });

  it('rejects raw acquisition parameters and bad request ids before admission', async () => {
    const recover = jest.fn(async () => ({ slotId: 's', disposition: 'accepted' }));
    const { base, close } = await boot('schedule-token', handlers({ recover }), 'refetch-token');
    try {
      const badMode = await fetch(`${base}/internal/targets/target-a/recover`, {
        method: 'POST',
        headers: { Authorization: 'Bearer refetch-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: '6eb50329-20f2-4ea7-b95b-e4676b50d9f1',
          retryMode: 'lookbackDays=30&scanCap=500', // client-supplied tuning attempt
        }),
      });
      expect(badMode.status).toBe(400);

      const badId = await fetch(`${base}/internal/targets/target-a/recover`, {
        method: 'POST',
        headers: { Authorization: 'Bearer refetch-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ retryMode: 'relaxed', requestId: 'not-a-uuid' }),
      });
      expect(badId.status).toBe(400);
      expect(recover).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('serves recovery status only with the manual-work token', async () => {
    const requestId = '6eb50329-20f2-4ea7-b95b-e4676b50d9f1';
    const recoverStatus = jest.fn((targetId: string, id: string) =>
      targetId === 'target-a' && id === requestId
        ? { requestId: id, slotId: 'recover-slot', state: 'submitted', slotStatus: 'success' }
        : null
    );
    const { base, close } = await boot('schedule-token', handlers({ recoverStatus }), 'refetch-token');
    try {
      const ok = await fetch(`${base}/internal/targets/target-a/recover/${requestId}`, {
        headers: { Authorization: 'Bearer refetch-token' },
      });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { state?: string };
      expect(body.state).toBe('submitted');

      const wrongToken = await fetch(`${base}/internal/targets/target-a/recover/${requestId}`, {
        headers: { Authorization: 'Bearer schedule-token' },
      });
      expect(wrongToken.status).toBe(401);

      const unknown = await fetch(`${base}/internal/targets/target-a/recover/7eb50329-20f2-4ea7-b95b-e4676b50d9f1`, {
        headers: { Authorization: 'Bearer refetch-token' },
      });
      expect(unknown.status).toBe(404);
    } finally {
      close();
    }
  });
});

/**
 * Admission observability: every request outcome must leave exactly one
 * structured line, and the HTTP status the clock sees must match the `event` an
 * operator reads. Before this, a trigger rejected with 401/404/429/503 — or one
 * that never arrived — was indistinguishable from a healthy one.
 */
describe('trigger admission observability', () => {
  let info: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  // Every argument of every captured line: a leak assertion that only looked at
  // the meta object would miss a secret embedded in the message itself.
  const allLines = (): unknown[][] => [...info.mock.calls, ...warn.mock.calls, ...error.mock.calls];
  const linesWithEvent = (event: string): unknown[][] =>
    allLines().filter((call) => (call[1] as { event?: string } | undefined)?.event === event);
  const metaFor = (event: string): Record<string, unknown> | undefined =>
    linesWithEvent(event)[0]?.[1] as Record<string, unknown> | undefined;

  beforeEach(() => {
    info = jest.spyOn(logger, 'info').mockImplementation(() => {});
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    error = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const runResult = (disposition: string, status: string) =>
    jest.fn(async (id: string) => ({ scheduleId: id, slotId: ctx.slotId, disposition, status }));

  // Requirement 1: disposition -> BOTH the HTTP status and the exact event name.
  const CASES: Array<{ disposition: string; httpStatus: number; event: string; note: string }> = [
    { disposition: 'accepted', httpStatus: 202, event: 'schedule.trigger_accepted', note: 'queued' },
    { disposition: 'already_running', httpStatus: 202, event: 'schedule.trigger_already_running', note: 'already_running' },
    { disposition: 'already_completed', httpStatus: 200, event: 'schedule.trigger_already_completed', note: 'already_completed' },
    { disposition: 'rejected', httpStatus: 503, event: 'schedule.trigger_rejected', note: 'rejected' },
  ];

  it.each(CASES)(
    'disposition $disposition answers $httpStatus and logs $event',
    async ({ disposition, httpStatus, event, note }) => {
      const h = handlers({ run: runResult(disposition, 'pending') });
      const { base, close } = await boot('secret-token', h);
      try {
        const res = await fetch(`${base}/internal/schedules/schedule-a/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
          body: '{}',
        });
        expect(res.status).toBe(httpStatus);
        // The wire body is unchanged: an external clock depends on it.
        expect(await res.json()).toMatchObject({ note, schedule: { disposition } });

        // Exactly one outcome line, and it names THIS status.
        const outcomeLines = allLines().filter((call) => {
          const name = (call[1] as { event?: string } | undefined)?.event;
          return typeof name === 'string' && name.startsWith('schedule.trigger_') && name !== 'schedule.trigger_received';
        });
        expect(outcomeLines).toHaveLength(1);

        const meta = metaFor(event);
        expect(meta).toBeDefined();
        expect(meta?.http_status).toBe(httpStatus);
        expect(meta?.disposition).toBe(disposition);
      } finally {
        close();
      }
    }
  );

  it('unknown schedule answers 404 and logs schedule.trigger_not_found', async () => {
    const h = handlers();
    const { base, close } = await boot('secret-token', h);
    try {
      const res = await fetch(`${base}/internal/schedules/nope/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: '{}',
      });
      expect(res.status).toBe(404);
      expect(metaFor('schedule.trigger_not_found')).toMatchObject({ http_status: 404, schedule_id: 'nope' });
      expect(h.run).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('a resolve refusal logs schedule.trigger_rejected with the real status, not 503', async () => {
    const h = handlers({ resolve: jest.fn(() => ({ error: 'occurrence expired (grace 90m)', status: 410 })) });
    const { base, close } = await boot('secret-token', h);
    try {
      const res = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: '{}',
      });
      expect(res.status).toBe(410);
      expect(metaFor('schedule.trigger_rejected')).toMatchObject({
        http_status: 410,
        disposition: 'rejected',
        reason: 'occurrence expired (grace 90m)',
      });
    } finally {
      close();
    }
  });

  // Requirement 2: correlation id + well-formed occurrence identity.
  it('carries attempt_id, slot_id and a well-formed occurrence_at for an accepted trigger', async () => {
    const { base, close } = await boot('secret-token', handlers());
    try {
      const res = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
          'x-schedule-attempt-id': '  bot1-daily:2026-09-08T02:00Z  ',
        },
        body: '{}',
      });
      expect(res.status).toBe(202);
      const meta = metaFor('schedule.trigger_accepted');
      expect(meta?.attempt_id).toBe('bot1-daily:2026-09-08T02:00Z');
      expect(meta?.slot_id).toBe(ctx.slotId);
      expect(meta?.occurrence_at).toBe('2026-09-08T02:00:00.000Z');
      expect(new Date(String(meta?.occurrence_at)).toISOString()).toBe(meta?.occurrence_at);
      expect(meta?.trigger_source).toBe('http');
      expect(typeof meta?.elapsed_ms).toBe('number');
    } finally {
      close();
    }
  });

  it('falls back to x-attempt-id, and omits attempt_id when no clock id was sent', async () => {
    const { base, close } = await boot('secret-token', handlers());
    try {
      await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
          'x-attempt-id': 'fallback-id',
        },
        body: '{}',
      });
      expect(metaFor('schedule.trigger_received')?.attempt_id).toBe('fallback-id');

      info.mockClear();
      await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: '{}',
      });
      // Omitted, never replaced by a random value: the clock is the only issuer.
      const received = metaFor('schedule.trigger_received');
      expect(received).toBeDefined();
      expect(Object.prototype.hasOwnProperty.call(received, 'attempt_id')).toBe(false);
    } finally {
      close();
    }
  });

  // Provider self-identification is log-only correlation and nothing more.
  it('records X-Schedule-Provider as sanitized log-only metadata, and it cannot change behaviour', async () => {
    const { base, close } = await boot('secret-token', handlers());
    try {
      const send = (provider?: string) =>
        fetch(`${base}/internal/schedules/schedule-a/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer secret-token',
            ...(provider ? { 'x-schedule-provider': provider } : {}),
          },
          body: '{}',
        });

      const messy = `  cron-job-org; rm -rf / <script> ${'x'.repeat(60)}  `;
      expect((await send(messy)).status).toBe(202);
      const recorded = String(metaFor('schedule.trigger_accepted')?.provider);
      // Bounded, and reduced to a log-safe alphabet: no shell/HTML can survive.
      expect(recorded.length).toBeLessThanOrEqual(32);
      expect(recorded).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(recorded.startsWith('cron-job-org')).toBe(true);
      expect(JSON.stringify(allLines())).not.toContain('<script>');

      // Omitted, never defaulted, so "unidentified clock" stays visible.
      info.mockClear();
      expect((await send()).status).toBe(202);
      const anonymous = metaFor('schedule.trigger_received');
      expect(Object.prototype.hasOwnProperty.call(anonymous, 'provider')).toBe(false);

      // A clock that names itself `cloudflare` is NOT thereby trusted: provider
      // is observability, never authorization, and never occurrence identity.
      info.mockClear();
      expect((await send('cloudflare')).status).toBe(202);
      const spoofed = metaFor('schedule.trigger_accepted');
      expect(spoofed?.provider).toBe('cloudflare');
      expect(spoofed?.slot_id).toBe(ctx.slotId);
      expect(spoofed?.occurrence_at).toBe('2026-09-08T02:00:00.000Z');
    } finally {
      close();
    }
  });

  // Requirement 3: no auth material anywhere in the logs, ever.
  it('never logs the bearer token or any fragment of it', async () => {
    const SECRET = 'hunter2-super-secret';
    const { base, close } = await boot(SECRET, handlers());
    try {
      const accepted = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: '{}',
      });
      const refused = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}-nope` },
        body: '{}',
      });
      expect(accepted.status).toBe(202);
      expect(refused.status).toBe(401);

      // Non-vacuous: real lines were produced by both requests.
      expect(linesWithEvent('schedule.trigger_accepted')).toHaveLength(1);
      expect(linesWithEvent('schedule.trigger_unauthorized')).toHaveLength(1);

      const dumped = JSON.stringify(allLines());
      expect(dumped).not.toContain(SECRET);
      expect(dumped).not.toContain(SECRET.slice(0, 8)); // 'hunter2-'
      expect(dumped.toLowerCase()).not.toContain('authorization');
    } finally {
      close();
    }
  });

  // Requirement 4: the arrival line is emitted before auth, and is clean.
  it('logs schedule.trigger_received before auth and carries no request secrets', async () => {
    const { base, close } = await boot('hunter2-super-secret', handlers());
    try {
      const res = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' },
        body: JSON.stringify({ label: 'x' }),
      });
      expect(res.status).toBe(401);

      const indexOf = (name: string): number =>
        allLines().findIndex((call) => (call[1] as { event?: string } | undefined)?.event === name);
      const receivedAt = indexOf('schedule.trigger_received');
      const refusedAt = indexOf('schedule.trigger_unauthorized');
      expect(receivedAt).toBeGreaterThanOrEqual(0);
      expect(refusedAt).toBeGreaterThan(receivedAt); // arrival recorded BEFORE the refusal

      const meta = metaFor('schedule.trigger_received') as Record<string, unknown>;
      expect(meta).toMatchObject({ path: '/internal/schedules/schedule-a/run', method: 'POST' });
      expect(meta.http_status).toBeUndefined();
      expect(JSON.stringify(meta).toLowerCase()).not.toContain('bearer');
      expect(JSON.stringify(meta).toLowerCase()).not.toContain('wrong-token');
      expect(JSON.stringify(meta)).not.toContain('hunter2-super-secret');
    } finally {
      close();
    }
  });
});

// Boot the real ScheduleTriggerServer on an ephemeral port.
async function boot(token: string | undefined, h: ReturnType<typeof handlers>, refetchToken?: string): Promise<{ base: string; close: () => void }> {
  const server = new ScheduleTriggerServer(token, h, refetchToken);
  server.start('127.0.0.1', 0);
  return new Promise((resolve) => {
    setTimeout(() => {
      const srv: http.Server = (server as unknown as { server: http.Server }).server;
      const address = srv.address() as { port: number };
      resolve({
        base: `http://127.0.0.1:${address.port}`,
        close: () => server.stop(),
      });
    }, 30);
  });
}
