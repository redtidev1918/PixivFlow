/**
 * Schedule trigger server auth + per-schedule dispatch tests (live ephemeral
 * express socket). The server is a thin adapter: authenticate, resolve the
 * canonical occurrence, delegate, serialize. It never knows business state.
 */
import http from 'node:http';

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
      status: 'success',
      cells: [{ targetId: 't', status: 'submitted', workId: '1' }],
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

  it('runs only the requested schedule with a valid token and returns its summary', async () => {
    const h = handlers();
    const { base, close } = await boot('secret-token', h);
    try {
      const res = await fetch(`${base}/internal/schedules/schedule-a/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: JSON.stringify({ label: '今日早班' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { schedule?: { scheduleId: string; slotId: string } };
      expect(body.schedule?.scheduleId).toBe('schedule-a');
      expect(body.schedule?.slotId).toBe(ctx.slotId);
      expect(h.run).toHaveBeenCalledTimes(1); // exactly one schedule, not all of them
      expect(h.run).toHaveBeenCalledWith('schedule-a', expect.objectContaining({ slotId: ctx.slotId }));
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

// Boot the real ScheduleTriggerServer on an ephemeral port.
async function boot(token: string | undefined, h: ReturnType<typeof handlers>): Promise<{ base: string; close: () => void }> {
  const server = new ScheduleTriggerServer(token, h);
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