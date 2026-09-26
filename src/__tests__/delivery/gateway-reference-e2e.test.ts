/**
 * Acceptance: PixivFlow's REAL delivery runtime drives the REAL example gateway.
 *
 * `gateway-delivery-e2e.test.ts` proves the runtime is correct, but its gateway
 * is an inline stub written to answer whatever that suite wants — it can never
 * disagree with PixivFlow. `gateway-contract.test.ts` proves the shipped example
 * gateway is correct, but it calls the endpoints with hand-written payloads, so
 * it never exercises DeliveryService, the durable intent, the outbox or the
 * ledger.
 *
 * The gap between them is exactly the claim this product makes: "an external
 * system can plug in as a gateway". Neither suite can prove it alone. This one
 * closes it by running the two halves TOGETHER over a real socket:
 *
 *   DeliveryService → outbox → OutboxWorker → DeliveryDispatcher → WebhookDelivery
 *        → HTTP → examples/gateway/server.mjs (a separate process)
 *
 * Nothing is stubbed here. If the shipped reference gateway and the shipped
 * delivery runtime ever drift apart, this is the suite that fails.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
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

const ROOT = join(__dirname, '..', '..', '..');
const EXAMPLE_SERVER = join(ROOT, 'examples', 'gateway', 'server.mjs');
const SECRET = 'reference-e2e-secret';

describe('the shipped example gateway accepts what the shipped runtime sends', () => {
  let dir: string;
  let artifactFile: string;
  let db: Database;
  let child: ChildProcessByStdio<null, Readable, Readable> | null;
  let base: string;
  /** A real HTTP server we can stop, so the gateway URL keeps its port. */
  let sink: Server | null;
  let sinkPort: number;

  const artifact = (pixivId: string): DownloadedArtifact => ({
    pixivId,
    type: 'illustration',
    title: '作品标题',
    tags: ['オリジナル'],
    artifacts: [{ id: 'original', workId: pixivId, variant: 'original', path: artifactFile }],
  });

  const route = (targets: string[]) =>
    ({
      name: 'daily-hot',
      storageMode: 'cache',
      delivery: { targets, executionContext: { slotId: 'daily-hot' } },
    }) as never;

  function dispatcher(): DeliveryDispatcher {
    return new DeliveryDispatcher({
      targets: {
        'my-gateway': { type: 'webhook', url: `${base}/deliver`, signingSecret: SECRET },
      },
    } as never);
  }

  /** A webhook route that always succeeds, so failure isolation has an honest witness. */
  function sinkDispatcher(): DeliveryDispatcher {
    return new DeliveryDispatcher({
      targets: {
        'my-gateway': { type: 'webhook', url: `${base}/deliver`, signingSecret: SECRET },
        sink: { type: 'webhook', url: `http://127.0.0.1:${sinkPort}/deliver` },
      },
    } as never);
  }

  function worker(which: DeliveryDispatcher = dispatcher()): OutboxWorker {
    return new OutboxWorker(db, which, {
      pollIntervalMs: 60_000,
      retryBaseMs: 5,
      retryMaxMs: 20,
      leaseMs: 5_000,
    });
  }

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
      const timer = setTimeout(() => fail(new Error(`example gateway did not start: ${buffer}`)), 10_000);
      timer.unref?.();
    });

  async function startGateway(): Promise<void> {
    child = spawn(process.execPath, [EXAMPLE_SERVER], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: '0',
        HOST: '127.0.0.1',
        EXAMPLE_GATEWAY_SECRET: SECRET,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = `http://127.0.0.1:${await waitForPort(child.stdout)}`;
  }

  async function stopGateway(): Promise<void> {
    const dying = child;
    child = null;
    if (!dying) return;
    const exited = new Promise<void>((resolve) => dying.once('exit', () => resolve()));
    dying.kill('SIGTERM');
    await exited;
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gateway-reference-e2e-'));
    artifactFile = join(dir, '12345678_p0.jpg');
    writeFileSync(artifactFile, 'jpeg-bytes');
    db = new Database(join(dir, 'test.db'));
    db.migrate();

    // A sink whose port is known before the gateway starts, so the gateway can
    // take its own ephemeral port without colliding with it.
    sink = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'accepted', id: 'sink-1' }));
      });
    });
    await new Promise<void>((resolve) => sink!.listen(0, '127.0.0.1', resolve));
    sinkPort = (sink!.address() as AddressInfo).port;

    await startGateway();
  });

  afterAll(async () => {
    await stopGateway();
    if (sink) await new Promise<void>((resolve) => sink!.close(() => resolve()));
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Each case owns its artifact file: a *confirmed* delivery runs the cleanup
   * step and deletes it, so sharing one path between cases would make the
   * later cases fail for a reason that has nothing to do with the contract.
   */
  const freshArtifact = (): void => writeFileSync(artifactFile, 'jpeg-bytes');

  it('settles a real delivery as delivered, with a gateway-issued remote id', async () => {
    freshArtifact();
    const service = new DeliveryService(db);
    const result = service.enqueue(artifact('41000001'), route(['my-gateway']), {
      slotId: 'accept-case',
    });

    // Durable intent BEFORE transport: that is the whole point of the outbox.
    expect(db.deliveries.getById(result.routes[0].deliveryId)?.status).toBe('pending');

    const summary = await worker().drainOnce(5);
    expect(summary.done).toBeGreaterThanOrEqual(1);

    const row = db.deliveries.getById(result.routes[0].deliveryId);
    expect(row?.status).toBe('delivered');
    // The reference gateway mints `example-<uuid>`; the ledger must carry it,
    // which is how an operator later finds the message on the platform.
    expect(String(row?.remoteId)).toMatch(/^example-[0-9a-f-]{36}$/);
    expect(row?.idempotencyKey).toBe(result.idempotencyKey);
    // The contract's dedupe identity is the runtime's own key: it names the
    // route, so the same work reaching two gateways can never share a key.
    expect(result.idempotencyKey).toBe('pixivflow:my-gateway:illustration:41000001:adhoc');
  });

  it('keeps a delivery owed while the gateway is down and converges on the retry with the same key', async () => {
    freshArtifact();
    const service = new DeliveryService(db);
    const result = service.enqueue(artifact('43000001'), route(['my-gateway']), { slotId: 'retry-case' });
    const key = result.idempotencyKey;

    // A gateway that is not running is a transport failure, not a verdict.
    await stopGateway();
    await worker().drainOnce(5);

    const owed = db.deliveries.getById(result.routes[0].deliveryId);
    expect(owed?.status).toBe('pending');
    expect(db.outbox.hasActionableDelivery(result.routes[0].deliveryId)).toBe(true);

    // The gateway comes back on a NEW port; `dispatcher()` reads `base` lazily,
    // so the retry reaches the restarted process rather than the dead socket.
    await startGateway();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const retried = await worker().drainOnce(5);
    expect(retried.done).toBeGreaterThanOrEqual(1);

    const settled = db.deliveries.getById(result.routes[0].deliveryId);
    expect(settled?.status).toBe('delivered');
    // THE idempotency claim, end to end: the retry reaches the same gateway
    // carrying the same key it used before, so a gateway that persisted the
    // first attempt can answer `duplicate_existing` instead of posting twice.
    expect(settled?.idempotencyKey).toBe(key);
    expect(db.outbox.getByKey('delivery', `outbox:${key}`)?.status).toBe('done');
  });

  it('isolates a broken route: its failure never stops a healthy gateway', async () => {
    freshArtifact();
    const service = new DeliveryService(db);
    const result = service.enqueue(
      artifact('44000001'),
      // `broken-route` is deliberately absent from the dispatcher config — a
      // deterministic local failure, exactly what a typo'd route produces.
      route(['broken-route', 'my-gateway']),
      { slotId: 'isolation-case' }
    );
    // Two routes, two intents, two outbox rows — and two DIFFERENT keys.
    const keys = result.routes.map((r) => r.idempotencyKey);
    expect(keys).toEqual([
      'pixivflow:broken-route:illustration:44000001:adhoc',
      'pixivflow:my-gateway:illustration:44000001:adhoc',
    ]);
    expect(new Set(keys).size).toBe(2);

    const summary = await worker(sinkDispatcher()).drainOnce(5);
    expect(summary.done + summary.dead).toBeGreaterThanOrEqual(2);

    const byTarget = new Map(result.routes.map((r) => [r.deliveryTarget, r.deliveryId]));
    const broken = db.deliveries.getById(byTarget.get('broken-route')!);
    const healthy = db.deliveries.getById(byTarget.get('my-gateway')!);

    // The broken route is terminal and audit-visible …
    expect(broken?.status).toBe('failed');
    expect(String(broken?.lastError)).toContain('broken-route');
    expect(db.outbox.hasActionableDelivery(byTarget.get('broken-route')!)).toBe(false);
    // … and the healthy route still delivered: one target's failure is not the job's.
    expect(healthy?.status).toBe('delivered');
    expect(String(healthy?.remoteId)).toMatch(/^example-/);
  });

  it('answers the operator/reference endpoints the way the contract documents', async () => {
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      status: 'connected',
      contractVersion: 1,
      gateway: 'pixivflow-example-gateway',
    });

    const pairing = await fetch(`${base}/pairing`);
    expect(pairing.status).toBe(200);
    // Pairing belongs to the external gateway; PixivFlow only renders the shape.
    await expect(pairing.json()).resolves.toMatchObject({ status: 'waiting' });
  });
});
