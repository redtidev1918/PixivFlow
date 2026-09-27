/**
 * Acceptance: PixivFlow's REAL delivery runtime drives the shipped OneBot adapter,
 * which talks to a REAL (fake-API) OneBot implementation over HTTP.
 *
 * The adapter is only worth shipping if the QQ path stops being a diagram, so
 * this suite refuses to test it in isolation:
 *
 *   DeliveryService → outbox → OutboxWorker → DeliveryDispatcher → WebhookDelivery
 *        → HTTP → examples/onebot-adapter/server.mjs (separate process)
 *        → HTTP → a OneBot v11 HTTP API (in-test fake; no QQ, no login)
 *
 * What is NOT faked: the contract payload, the signature, the idempotency key,
 * the ledger, the retry decision, and every segment the adapter emits. What IS
 * faked is the thing this repo must never own — the QQ session itself.
 *
 * The ACK cases matter most: an OneBot reply that only says "accepted" must not
 * become a delivery, and a malformed request must not become an infinite retry.
 */
import { createHmac } from 'node:crypto';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from '../../storage/Database';
import { DeliveryService } from '../../delivery/DeliveryService';
import { DeliveryDispatcher } from '../../delivery/DeliveryDispatcher';
import { OutboxWorker } from '../../delivery/OutboxWorker';
import type { DownloadedArtifact } from '../../delivery/types';

const ROOT = join(__dirname, '..', '..', '..');
const ADAPTER = join(ROOT, 'examples', 'onebot-adapter', 'server.mjs');
const SECRET = 'onebot-adapter-e2e-secret';
const TOKEN = 'onebot-adapter-e2e-token';

/** How the fake OneBot answers `send_group_msg`. */
type Mode = 'ok' | 'async' | 'bad-request';

describe('the shipped OneBot adapter delivers what the shipped runtime sends', () => {
  let dir: string;
  let artifactFile: string;
  let stateFile: string;
  let db: Database;
  let adapter: ChildProcessByStdio<null, Readable, Readable> | null = null;
  let onebot: Server | null = null;
  let onebotPort = 0;
  let base: string;
  let mode: Mode = 'ok';
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];

  const artifact = (pixivId: string): DownloadedArtifact => ({
    pixivId,
    type: 'illustration',
    title: '适配器验收作品',
    tags: ['オリジナル'],
    artifacts: [{ id: 'original', workId: pixivId, variant: 'original', path: artifactFile }],
  });

  const route = (targets: string[]) =>
    ({
      name: 'daily-hot',
      storageMode: 'cache',
      delivery: { targets, executionContext: { slotId: 'onebot-adapter-e2e' } },
    }) as never;

  const dispatcher = (): DeliveryDispatcher =>
    new DeliveryDispatcher({
      targets: {
        'qq-main': { type: 'webhook', url: `${base}/deliver`, signingSecret: SECRET, token: TOKEN },
      },
    } as never);

  const worker = (): OutboxWorker =>
    new OutboxWorker(db, dispatcher(), {
      pollIntervalMs: 60_000,
      retryBaseMs: 5,
      retryMaxMs: 20,
      leaseMs: 5_000,
    });

  /** Each case owns its artifact file: a delivered one is cleaned up. */
  const freshArtifact = (): void => writeFileSync(artifactFile, 'jpeg-bytes');

  const waitForPort = (stream: NodeJS.ReadableStream): Promise<number> =>
    new Promise((done, fail) => {
      let buffer = '';
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const match = buffer.match(/url=http:\/\/[^:]+:(\d+)/);
        if (match) {
          stream.off('data', onData);
          done(Number(match[1]));
        }
      };
      stream.on('data', onData);
      const timer = setTimeout(() => fail(new Error(`onebot adapter did not start: ${buffer}`)), 10_000);
      timer.unref?.();
    });

  /**
   * The adapter's `ONEBOT_URL` is fixed at spawn, so the fake API must come back
   * on the SAME port after a simulated outage — hence a reserved port instead of
   * the ephemeral one `listen(0)` hands out.
   */
  async function reservePort(): Promise<number> {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    return port;
  }

  async function startOneBot(port: number): Promise<number> {
    onebot = createServer((req, res) => {
      const action = (req.url ?? '/').replace(/^\//, '');
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        let params: Record<string, unknown> = {};
        try {
          params = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          params = {};
        }
        calls.push({ action, params });
        const answer = (body: Record<string, unknown>) => {
          const payload = JSON.stringify({ status: 'ok', retcode: 0, data: null, ...body });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(payload);
        };
        if (action === 'get_status') return answer({ data: { online: true, good: true } });
        if (action === 'get_login_info') return answer({ data: { user_id: 10001, nickname: 'e2e' } });
        if (action.startsWith('send_') && mode === 'async') {
          // "I took the request, I am not done" — never a success.
          return answer({ status: 'async', retcode: 1, wording: 'async' });
        }
        if (action.startsWith('send_') && mode === 'bad-request') {
          return answer({ status: 'failed', retcode: 102, wording: 'bad param' });
        }
        if (action.startsWith('send_')) return answer({ data: { message_id: 42 } });
        if (action.startsWith('upload_')) return answer({ data: {} });
        return answer({ status: 'failed', retcode: 1404, wording: `unknown action ${action}` });
      });
    });
    await new Promise<void>((resolve) => onebot!.listen(port, '127.0.0.1', resolve));
    return (onebot!.address() as AddressInfo).port;
  }

  async function stopOneBot(): Promise<void> {
    const dying = onebot;
    onebot = null;
    if (!dying) return;
    await new Promise<void>((resolve) => dying.close(() => resolve()));
  }

  async function startAdapter(onebotPort: number): Promise<void> {
    adapter = spawn(process.execPath, [ADAPTER], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: '0',
        HOST: '127.0.0.1',
        ADAPTER_TOKEN: TOKEN,
        ADAPTER_SECRET: SECRET,
        ONEBOT_URL: `http://127.0.0.1:${onebotPort}`,
        ONEBOT_TARGET: 'group:987654',
        ONEBOT_MIN_SEND_INTERVAL_MS: '0',
        ONEBOT_STATE_FILE: stateFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = `http://127.0.0.1:${await waitForPort(adapter.stdout)}`;
  }

  async function stopAdapter(): Promise<void> {
    const dying = adapter;
    adapter = null;
    if (!dying) return;
    const exited = new Promise<void>((resolve) => dying.once('exit', () => resolve()));
    dying.kill('SIGTERM');
    await exited;
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'onebot-adapter-e2e-'));
    artifactFile = join(dir, '12345678_p0.jpg');
    stateFile = join(dir, 'adapter-state.jsonl');
    writeFileSync(artifactFile, 'jpeg-bytes');
    db = new Database(join(dir, 'test.db'));
    db.migrate();
    onebotPort = await reservePort();
    await startAdapter(await startOneBot(onebotPort));
  });

  afterAll(async () => {
    await stopAdapter();
    await stopOneBot();
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** A hand-written contract payload, signed exactly like PixivFlow signs one. */
  function postDeliver(body: unknown, { authorize = true } = {}) {
    const raw = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = `sha256=${createHmac('sha256', SECRET).update(`${timestamp}.${raw}`).digest('hex')}`;
    return fetch(`${base}/deliver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorize ? { Authorization: `Bearer ${TOKEN}` } : {}),
        'X-Webhook-Timestamp': timestamp,
        'X-Webhook-Signature': signature,
      },
      body: raw,
    });
  }

  const wirePayload = (key: string) => ({
    schemaVersion: 1,
    idempotencyKey: key,
    deliveryTarget: 'qq-main',
    work: { id: '7', type: 'illustration', title: '去重用例', sourceUrl: 'https://www.pixiv.net/artworks/7', spoiler: false, tags: [] },
    message: {
      text: '适配器去重正文',
      mediaTransport: 'base64',
      parts: [
        { kind: 'text' },
        { kind: 'image', media: { kind: 'image', dataBase64: 'AAAA', mime: 'image/jpeg' } },
      ],
      media: [],
      dropped: [],
    },
    delivery: { idempotencyKey: key },
  });

  it('settles a real delivery at the OneBot API and records the platform message id', async () => {
    mode = 'ok';
    calls.length = 0;
    freshArtifact();
    const service = new DeliveryService(db);
    const result = service.enqueue(artifact('51000001'), route(['qq-main']), { slotId: 'onebot-ok' });

    const summary = await worker().drainOnce(5);
    expect(summary.done).toBeGreaterThanOrEqual(1);

    const row = db.deliveries.getById(result.routes[0].deliveryId);
    expect(row?.status).toBe('delivered');
    // OneBot's `data.message_id` is the platform handle an operator needs.
    expect(String(row?.remoteId)).toBe('42');

    // The adapter is a TRANSLATOR: assert the segments OneBot actually received.
    const send = calls.find((c) => c.action === 'send_group_msg');
    expect(send?.params.group_id).toBe(987654);
    expect(send?.params.message).toEqual([
      { type: 'text', data: { text: expect.stringContaining('适配器验收作品') } },
      { type: 'image', data: { file: `file://${artifactFile}` } },
    ]);
  });

  it('answers duplicate_existing for a replayed key and remembers it durably', async () => {
    const key = 'pixivflow:qq-main:illustration:52000001:adhoc';
    const first = await postDeliver(wirePayload(key));
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ status: 'accepted' });

    const second = await postDeliver(wirePayload(key));
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ status: 'duplicate_existing' });

    // The contract only allows dedupe that survives a restart, so the key must
    // be on disk — not merely in the adapter's memory.
    expect(readFileSync(stateFile, 'utf8')).toContain(key);
  });

  it('keeps an async OneBot answer retryable instead of calling it delivered', async () => {
    mode = 'async';
    freshArtifact();
    const service = new DeliveryService(db);
    const result = service.enqueue(artifact('53000001'), route(['qq-main']), { slotId: 'onebot-async' });

    await worker().drainOnce(5);

    const row = db.deliveries.getById(result.routes[0].deliveryId);
    // "accepted but unknown" is pending, and pending must stay owed.
    expect(row?.status).toBe('pending');
    expect(db.outbox.hasActionableDelivery(result.routes[0].deliveryId)).toBe(true);
  });

  it('dead-letters a deterministic OneBot rejection instead of retrying it forever', async () => {
    mode = 'bad-request';
    freshArtifact();
    const service = new DeliveryService(db);
    const result = service.enqueue(artifact('54000001'), route(['qq-main']), { slotId: 'onebot-bad' });

    await worker().drainOnce(5);

    const row = db.deliveries.getById(result.routes[0].deliveryId);
    // retcode 102 is the same request producing the same rejection: terminal.
    expect(row?.status).toBe('failed');
    expect(db.outbox.hasActionableDelivery(result.routes[0].deliveryId)).toBe(false);
    expect(String(row?.lastError).length).toBeGreaterThan(0);
  });

  it('refuses an unsigned/unauthenticated delivery with a bare 401 and no status word', async () => {
    const response = await postDeliver(wirePayload('pixivflow:qq-main:illustration:55000001:adhoc'), {
      authorize: false,
    });
    expect(response.status).toBe(401);
    // A status word would outrank the code and could dead-letter a fixable token.
    await expect(response.json()).resolves.toEqual({ reason: expect.any(String) });
  });

  it('rejects an unsupported schemaVersion as permanent, with no status word', async () => {
    const response = await postDeliver({ ...wirePayload('pixivflow:schema:1'), schemaVersion: 2 });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ reason: expect.stringContaining('schemaVersion') });
  });

  it('reports pairing and health from the OneBot API, and degrades when it is gone', async () => {
    mode = 'ok';
    const pairing = await fetch(`${base}/pairing`);
    expect(pairing.status).toBe(200);
    // The QQ account is NapCat's, read out of OneBot — PixivFlow never logs in.
    await expect(pairing.json()).resolves.toMatchObject({ status: 'connected', account: '10001' });

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      status: 'connected',
      contractVersion: 1,
      gateway: 'pixivflow-onebot-adapter',
    });

    await stopOneBot();
    const deadHealth = await fetch(`${base}/health`);
    expect(deadHealth.status).toBe(503);
    await expect(deadHealth.json()).resolves.toMatchObject({ status: 'unreachable' });
    const deadPairing = await fetch(`${base}/pairing`);
    expect(deadPairing.status).toBe(503);
    await expect(deadPairing.json()).resolves.toMatchObject({ status: 'unreachable' });

    // Back up, so the suite leaves no half-dead process behind.
    expect(await startOneBot(onebotPort)).toBe(onebotPort);
    await expect((await fetch(`${base}/health`)).json()).resolves.toMatchObject({ status: 'connected' });
  });
});
