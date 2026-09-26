// Runtime Contract endpoints: /status and /version (+ /api aliases).
// Verifies the additive, non-sensitive capacity agreed in the ecosystem
// Runtime Contract. Builds a minimal express app with only setupRoutes so the
// auth layer (applied separately in server.ts) does not interfere.
import express, { Express } from 'express';
import type { Server } from 'node:http';
import { setupRoutes } from '../../webui/server/server-routes';

describe('Runtime Contract endpoints', () => {
  let app: Express;
  let server: Server;
  let base: string;

  const start = () =>
    new Promise<Server>((resolve, reject) => {
      app = express();
      setupRoutes(app);
      server = app.listen(0, '127.0.0.1', () => resolve(server));
      server.on('error', reject);
    });

  beforeEach(async () => {
    await start();
    const addr = server.address();
    if (addr === null || typeof addr === 'string') {
      throw new Error('expected a bound TCP address');
    }
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    // Close any lingering keep-alive sockets so close() resolves promptly.
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const json = async (path: string) => {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it('GET /api/status returns non-sensitive runtime facts', async () => {
    const { status, body } = await json('/api/status');
    expect(status).toBe(200);
    expect(body.schemaVersion).toBe(1);
    expect(body.state).toBe('ok');
    expect(typeof body.pid).toBe('number');
    expect(typeof body.uptimeSec).toBe('number');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(new Date(String(body.startedAt)).getTime()).not.toBeNaN();
  });

  it('GET /status aliases /api/status', async () => {
    const { status, body } = await json('/status');
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).schemaVersion).toBe(1);
    expect((body as Record<string, unknown>).state).toBe('ok');
  });

  it('GET /api/version returns name and authoritative version', async () => {
    const { status, body } = await json('/api/version');
    expect(status).toBe(200);
    expect(body.schemaVersion).toBe(1);
    expect(body.name).toBe('pixivflow');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('GET /version aliases /api/version', async () => {
    const { status, body } = await json('/version');
    expect(status).toBe(200);
    expect(String((body as Record<string, unknown>).version)).toMatch(/^\d+\.\d+\.\d+/);
  });
});