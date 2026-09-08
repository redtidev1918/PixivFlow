/**
 * Schedule trigger server auth and slot-resolution tests (no live socket).
 */
import http from 'node:http';

import { ScheduleTriggerServer } from '../../scheduler/ScheduleTriggerServer';

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

describe('trigger endpoint auth (live ephemeral express)', () => {
  it('rejects requests without a valid bearer token', async () => {
    const { base, close } = await boot('secret-token', {
      resolveSlot: () => ({ slotId: 'x', slotName: 'morning', slotDate: '2026-09-08' }),
      runScheduleSlot: jest.fn(),
      status: () => ({ schedules: ['s1'] }),
    });
    try {
      const noAuth = await fetch(`${base}/internal/schedules/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      expect(noAuth.status).toBe(401);

      const badAuth = await fetch(`${base}/internal/schedules/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
        body: '{}',
      });
      expect(badAuth.status).toBe(401);
    } finally {
      close();
    }
  });

  it('runs schedules with a valid token and returns summary', async () => {
    const run = jest.fn(async (id: string) => ({
      scheduleId: id, slotId: '2026-09-08:morning', status: 'success',
      cells: [{ targetId: 't', status: 'submitted', workId: '1' }],
    }));
    const { base, close } = await boot('secret-token', {
      resolveSlot: () => ({ slotId: '2026-09-08:morning', slotName: 'morning', slotDate: '2026-09-08' }),
      runScheduleSlot: run,
      status: () => ({ schedules: ['bot1', 'bot2'] }),
    });
    try {
      const res = await fetch(`${base}/internal/schedules/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
        body: JSON.stringify({ slot: 'morning' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { slot?: string };
      expect(body.slot).toBe('2026-09-08:morning');
      expect(run).toHaveBeenCalledTimes(2); // bot1 + bot2
    } finally {
      close();
    }
  });

  it('returns 503 when no token configured (fail closed)', async () => {
    const { base, close } = await boot(undefined, {
      resolveSlot: () => ({ slotId: 'x', slotName: 'morning', slotDate: '2026-09-08' }),
      runScheduleSlot: jest.fn(),
      status: () => ({ schedules: [] }),
    });
    try {
      const res = await fetch(`${base}/internal/schedules/run`, { method: 'POST', body: '{}' });
      expect(res.status).toBe(503);
    } finally {
      close();
    }
  });
});

// Boot the real ScheduleTriggerServer on an ephemeral port.
async function boot(token: string | undefined, handlers: any): Promise<{ base: string; close: () => void }> {
  const server = new ScheduleTriggerServer(token, handlers);
  server.start('127.0.0.1', 0);
  return new Promise((resolve) => {
    setTimeout(() => {
      const srv: http.Server = (server as any).server;
      const address = srv.address() as any;
      resolve({
        base: `http://127.0.0.1:${address.port}`,
        close: () => server.stop(),
      });
    }, 30);
  });
}
