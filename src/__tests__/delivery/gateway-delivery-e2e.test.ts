/**
 * End-to-end gateway delivery over real HTTP (P3/P5 acceptance).
 *
 * Everything below runs for real: a `DeliveryService` fans an artifact out to a
 * route, the intent lands in a migrated SQLite database, an `OutboxWorker`
 * drains it, and the gateway is an actual HTTP server on a real port. Nothing is
 * stubbed, so this is the test that proves the contract documented in
 * `docs/GATEWAY.md` is what the running system actually sends and how it reacts
 * to each answer.
 *
 * The invariants it pins that unit tests cannot:
 *   - the wire request matches the documented shape and carries both the
 *     idempotency key and a real HMAC signature;
 *   - "HTTP 200" alone is never success — a terminal failure word stops the
 *     route, while a transport failure stays owed and is retried with the SAME
 *     idempotency key (which is what lets a gateway dedupe).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { DeliveryService } from '../../delivery/DeliveryService';
import { DeliveryDispatcher } from '../../delivery/DeliveryDispatcher';
import { OutboxWorker } from '../../delivery/OutboxWorker';
import type { DownloadedArtifact } from '../../delivery/types';

interface Received {
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

describe('gateway delivery end-to-end over real HTTP', () => {
  let dir: string;
  let artifactFile: string;
  let db: Database;
  let server: Server | null;
  let port: number;
  let received: Received[];
  let answer: (body: any) => { status: number; body: unknown };

  const artifact = (pixivId: string): DownloadedArtifact => ({
    pixivId,
    type: 'illustration',
    title: '作品标题',
    tags: ['オリジナル'],
    artifacts: [
      { id: 'original', workId: pixivId, variant: 'original', path: artifactFile },
    ],
  });

  const deliveryTarget = {
    name: 'daily-hot',
    storageMode: 'cache',
    delivery: { targets: ['my-gateway'], executionContext: { slotId: 'daily-hot' } },
  } as never;

  /** The live gateway URL, or a URL that is guaranteed to refuse connections. */
  function gatewayUrl(): string {
    if (server) return `http://127.0.0.1:${port}/deliver`;
    return `http://127.0.0.1:${refusedPort}/deliver`;
  }
  let refusedPort = 1;

  function dispatcher(): DeliveryDispatcher {
    return new DeliveryDispatcher({
      targets: { 'my-gateway': { type: 'webhook', url: gatewayUrl(), signingSecret: 'shhh' } },
    } as never);
  }

  function worker(): OutboxWorker {
    return new OutboxWorker(db, dispatcher(), {
      pollIntervalMs: 60_000,
      retryBaseMs: 5,
      retryMaxMs: 20,
      leaseMs: 5_000,
    });
  }

  async function startGateway(): Promise<void> {
    received = [];
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        received.push({ body, headers: req.headers });
        const result = answer(body);
        res.writeHead(result.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result.body));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    port = (server!.address() as AddressInfo).port;
  }

  async function stopGateway(): Promise<void> {
    if (!server) return;
    const closing = server;
    server = null;
    await new Promise<void>((resolve) => closing.close(() => resolve()));
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gateway-e2e-'));
    artifactFile = join(dir, '12345678_p0.jpg');
    writeFileSync(artifactFile, 'jpeg-bytes');
    db = new Database(join(dir, 'test.db'));
    db.migrate();

    // Grab a port nothing listens on, so a "gateway down" attempt is a genuine
    // transport failure rather than a mocked one.
    const probe = createServer(() => undefined);
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    refusedPort = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    answer = () => ({ status: 200, body: { status: 'accepted', id: 'gw-1' } });
    await startGateway();
  });

  afterAll(async () => {
    await stopGateway();
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    received = [];
    answer = () => ({ status: 200, body: { status: 'accepted', id: 'gw-1' } });
    // A successful delivery deletes the artifact (that is the point of the
    // cleanup step), so each case starts with the file its intent refers to.
    writeFileSync(artifactFile, 'jpeg-bytes');
  });

  it('delivers a durable intent and sends the documented signed request', async () => {
    const service = new DeliveryService(db);
    const result = service.enqueue(artifact('12345678'), deliveryTarget, {
      idempotencyKey: 'k-happy',
      slotId: 'daily-hot',
    });
    expect(result.created).toBe(true);
    expect(result.routes.map((route) => route.deliveryTarget)).toEqual(['my-gateway']);

    // The intent is durable BEFORE any transport happens.
    const before = db.deliveries.getById(result.routes[0].deliveryId);
    expect(before?.status).toBe('pending');

    const summary = await worker().drainOnce(5);
    expect(summary.done).toBeGreaterThanOrEqual(1);

    const delivered = db.deliveries.getById(result.routes[0].deliveryId);
    expect(delivered?.status).toBe('delivered');
    expect(delivered?.remoteId).toBe('gw-1');

    const request = received.at(-1)!;
    expect(request.body.schemaVersion).toBe(1);
    expect(request.body.idempotencyKey).toBe(result.idempotencyKey);
    expect(request.body.work.id).toBe('12345678');
    expect(request.body.work.type).toBe('illustration');
    expect(request.body.work.sourceUrl).toBe('https://www.pixiv.net/artworks/12345678');
    expect(request.body.message.parts.map((part: any) => part.kind)).toEqual(['text', 'image']);
    expect(request.body.message.parts[1].media).toMatchObject({ kind: 'image', path: artifactFile });
    expect(request.body.message.media[0]).toMatchObject({ kind: 'image', path: artifactFile });
    expect(request.body.delivery.slotId).toBe('daily-hot');
    expect(String(request.headers['x-idempotency-key'])).toBe(result.idempotencyKey);
    expect(String(request.headers['x-pixivflow-delivery'])).toBe('my-gateway');
    expect(String(request.headers['x-webhook-signature'])).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('never treats a 200 that reports a terminal failure as success', async () => {
    answer = () => ({ status: 200, body: { status: 'rejected', reason: 'group is archived' } });

    const service = new DeliveryService(db);
    const result = service.enqueue(artifact('20000001'), deliveryTarget, { idempotencyKey: 'k-terminal' });
    await worker().drainOnce(5);

    const row = db.deliveries.getById(result.routes[0].deliveryId);
    expect(row?.status).toBe('failed');
    expect(String(row?.lastError)).toContain('archived');

    // Terminal means terminal: the route is not owed again.
    const outbox = db.outbox.listForDeliveryIds([result.routes[0].deliveryId]).get(result.routes[0].deliveryId);
    expect(outbox?.status).toBe('done');
    expect(db.outbox.hasActionableDelivery(result.routes[0].deliveryId)).toBe(false);
  });

  it('keeps a transport failure owed and delivers it on the retry with the same key', async () => {
    await stopGateway();

    const service = new DeliveryService(db);
    const result = service.enqueue(artifact('30000001'), deliveryTarget, { idempotencyKey: 'k-retry' });
    await worker().drainOnce(5);

    // A refused connection is retryable: nothing is delivered and nothing is dead.
    const afterFailure = db.deliveries.getById(result.routes[0].deliveryId);
    expect(afterFailure?.status).toBe('pending');
    expect(db.outbox.hasActionableDelivery(result.routes[0].deliveryId)).toBe(true);

    // Bring the gateway back on the same port and let the SAME intent settle.
    await startGateway();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const retried = await worker().drainOnce(5);
    expect(retried.done).toBeGreaterThanOrEqual(1);

    const settled = db.deliveries.getById(result.routes[0].deliveryId);
    expect(settled?.status).toBe('delivered');
    expect(settled?.remoteId).toBe('gw-1');
    // Same key on the wire: a gateway can dedupe the retry instead of double-posting.
    expect(received.at(-1)!.body.idempotencyKey).toBe(result.idempotencyKey);
    expect(settled?.idempotencyKey).toBe(result.idempotencyKey);
    expect(db.outbox.getByKey('delivery', `outbox:${result.idempotencyKey}`)?.status).toBe('done');
  });
});
