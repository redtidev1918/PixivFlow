#!/usr/bin/env node
/**
 * Example gateway — a reference implementation of the Gateway Contract v1.
 *
 * This is the SMALLEST thing that satisfies `docs/GATEWAY_CONTRACT.md`, written
 * so a gateway author can see the contract work before writing a real adapter.
 * It deliberately knows nothing about any platform: it prints what it received,
 * which is enough to prove the protocol end to end.
 *
 *   PixivFlow ──POST /deliver──▶ this server (prints) ──✗ no platform
 *
 * It is NOT a QQ/OneBot adapter and it should not become one. Platform mapping
 * belongs in a separate adapter process, so that PixivFlow's contract never
 * grows a branch per platform. See `docs/GATEWAY.md` for the OneBot picture.
 *
 * Zero dependencies on purpose: an integrator can read it in one sitting.
 *
 *   node examples/gateway/server.mjs            # listen on :8790
 *   PORT=9000 node examples/gateway/server.mjs
 *   node examples/gateway/server.mjs --selftest # exercise itself, then exit
 *
 * Environment:
 *   PORT                     listen port (default 8790)
 *   HOST                     bind address (default 127.0.0.1)
 *   EXAMPLE_GATEWAY_SECRET   when set, requires a valid X-Webhook-Signature
 *   EXAMPLE_GATEWAY_TOKEN    when set, requires Authorization: Bearer <token>
 *   EXAMPLE_GATEWAY_STATUS   pairing status to report (default "waiting")
 *   EXAMPLE_GATEWAY_ACCOUNT  account name to report when connected
 *   EXAMPLE_GATEWAY_MEDIA_ROOT
 *                            when set, `message.media[].path` is resolved under
 *                            this directory (leading "/" stripped) so the demo
 *                            can report real file sizes when PixivFlow's paths
 *                            do not exist on this host (container, other machine)
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export const CONTRACT_VERSION = 1;

/**
 * A delivery must be idempotent across retries. A real gateway persists this
 * (sqlite, redis, a table); the example keeps it in memory for as long as the
 * process lives, which is enough to demonstrate the contract and NOT enough for
 * production — say so rather than pretend.
 */
const seen = new Map();

/** The demo QR image: a 1x1 PNG. Real gateways put their real QR here. */
const DEMO_QR_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

export function log(event, fields = {}) {
  const line = Object.entries(fields)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ');
  console.log(`[example-gateway] ${event}${line ? ' ' + line : ''}`);
}

/** Constant-time compare that never throws on length mismatch. */
function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verify `X-Webhook-Signature` over the RAW body.
 *
 * Re-serializing the parsed JSON would change the bytes and break the HMAC —
 * the single most common way a gateway gets this wrong. The 5-minute window
 * exists to bound replay, and is not a correctness requirement of the contract.
 */
export function verifySignature({ secret, header, timestampHeader, rawBody, now = Date.now() }) {
  if (!secret) return { ok: true };
  if (!header || !timestampHeader) return { ok: false, reason: 'missing signature headers' };
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'malformed timestamp' };
  if (Math.abs(now / 1000 - timestamp) > 300) return { ok: false, reason: 'stale timestamp' };
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  return safeEqual(expected, header)
    ? { ok: true }
    : { ok: false, reason: 'signature mismatch' };
}

function mediaRoot() {
  return process.env.EXAMPLE_GATEWAY_MEDIA_ROOT
    ? resolve(process.env.EXAMPLE_GATEWAY_MEDIA_ROOT)
    : null;
}

/**
 * Resolve one media entry, without ever trusting its path.
 *
 * `message.media[].path` is an absolute path on the PIXIVFLOW host. A gateway
 * on another machine cannot open it, so this resolves the path only when it is
 * inside the configured media root and refuses traversal — the example should
 * not teach a path-traversal bug.
 */
async function describeMedia(item) {
  const base = { kind: item.kind ?? 'unknown' };
  if (typeof item.dataBase64 === 'string') {
    return { ...base, transport: 'base64', bytes: Buffer.byteLength(item.dataBase64, 'base64') };
  }
  if (typeof item.path !== 'string' || !item.path) {
    return { ...base, transport: 'none', note: 'no path and no dataBase64' };
  }
  const root = mediaRoot();
  if (!root) {
    return { ...base, transport: 'reference', path: item.path, note: 'not mounted on this host' };
  }
  const candidate = join(root, item.path.replace(/^[/\\]+/, ''));
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return { ...base, transport: 'reference', path: item.path, note: 'refused: outside media root' };
  }
  try {
    const info = await stat(candidate);
    return { ...base, transport: 'reference', path: item.path, bytes: info.size };
  } catch {
    return { ...base, transport: 'reference', path: item.path, note: 'not found under media root' };
  }
}

function readBody(req, limitBytes = 128 * 1024 * 1024) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error(`request body exceeds ${limitBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * `POST /deliver`.
 *
 * The whole contract in one handler: authenticate, validate, dedupe, do the
 * work, then answer with a status WORD. HTTP 200 alone is never the verdict.
 */
async function handleDeliver(req, res, options) {
  const rawBody = await readBody(req);
  const signature = verifySignature({
    secret: options.secret,
    header: req.headers['x-webhook-signature'],
    timestampHeader: req.headers['x-webhook-timestamp'],
    rawBody,
  });
  if (!signature.ok) {
    log('deliver.rejected', { reason: signature.reason });
    // No `status` word on purpose: a terminal-failure word outranks the HTTP
    // status (see GATEWAY_CONTRACT §5), so saying "rejected" here would turn a
    // retryable 401 into a dead letter.
    return sendJson(res, 401, { reason: signature.reason });
  }
  if (options.token) {
    const header = req.headers.authorization ?? '';
    if (!safeEqual(`Bearer ${options.token}`, header)) {
      log('deliver.rejected', { reason: 'bad bearer token' });
      return sendJson(res, 401, { reason: 'unauthorized' });
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return sendJson(res, 400, { reason: 'body is not JSON' });
  }

  // A gateway MUST refuse a contract version it was not written for. Guessing
  // at an unknown shape silently publishes the wrong thing.
  if (payload?.schemaVersion !== CONTRACT_VERSION) {
    // A version mismatch is a deployment error: retrying sends the same bytes
    // to the same code, so it must land in the dead-letter queue where an
    // operator will see it and upgrade the gateway.
    return sendJson(res, 400, {
      reason: `unsupported schemaVersion: ${payload?.schemaVersion ?? 'missing'}`,
    });
  }
  const key = payload.idempotencyKey;
  // A missing idempotency key is malformed for ANY contract version, so this
  // one is a permanent rejection.
  if (typeof key !== 'string' || !key) {
    return sendJson(res, 400, { reason: 'missing idempotencyKey' });
  }

  const prior = seen.get(key);
  if (prior?.status === 'accepted') {
    // The contract's dedupe path. Note it is a 200 with a duplicate WORD, not
    // an error: the delivery already succeeded, and resending was refused.
    log('deliver.duplicate', { key, id: prior.id });
    return sendJson(res, 200, { status: 'duplicate_existing', id: prior.id, reason: 'already delivered' });
  }

  const media = Array.isArray(payload?.message?.media) ? payload.message.media : [];
  const described = await Promise.all(media.map(describeMedia));
  const id = `example-${randomUUID()}`;
  log('deliver.accepted', {
    key,
    target: payload.deliveryTarget,
    work: payload?.work?.id,
    title: payload?.work?.title,
    transport: payload?.message?.mediaTransport,
  });
  for (const item of described) log('deliver.media', item);

  seen.set(key, { status: 'accepted', id });
  return sendJson(res, 200, { status: 'accepted', id });
}

/** `GET /pairing` — read-only, and nothing about it is stored by PixivFlow. */
function handlePairing(res, options) {
  const status = options.pairingStatus;
  if (status === 'connected') {
    return sendJson(res, 200, { status, account: options.account ?? 'example-account' });
  }
  if (status === 'unreachable') {
    return sendJson(res, 503, { status, reason: 'pairing backend is down' });
  }
  return sendJson(res, 200, {
    status,
    qrCode: options.qrCode ?? `data:image/png;base64,${DEMO_QR_PNG}`,
  });
}

/** `GET /health` — for operators. PixivFlow never gates a delivery on it. */
function handleHealth(res) {
  return sendJson(res, 200, {
    status: 'connected',
    contractVersion: CONTRACT_VERSION,
    gateway: 'pixivflow-example-gateway',
  });
}

export function createExampleGateway(options = {}) {
  const config = {
    secret: options.secret ?? process.env.EXAMPLE_GATEWAY_SECRET ?? null,
    token: options.token ?? process.env.EXAMPLE_GATEWAY_TOKEN ?? null,
    pairingStatus: options.pairingStatus ?? process.env.EXAMPLE_GATEWAY_STATUS ?? 'waiting',
    account: options.account ?? process.env.EXAMPLE_GATEWAY_ACCOUNT ?? null,
    qrCode: options.qrCode ?? null,
  };
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /health') return handleHealth(res);
    if (route === 'GET /pairing') return handlePairing(res, config);
    if (route === 'POST /deliver') {
      handleDeliver(req, res, config).catch((error) => {
        log('deliver.error', { message: error?.message ?? String(error) });
        // No `status` word: the HTTP 500 must stay retryable.
        if (!res.headersSent) sendJson(res, 500, { reason: 'internal error' });
      });
      return undefined;
    }
    return sendJson(res, 404, { status: 'invalid', reason: `no route for ${route}` });
  });
}

/** `npm run`-free smoke test: start, hit all three endpoints, print, exit. */
async function selftest() {
  const server = createExampleGateway({ pairingStatus: 'waiting' });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const get = async (path) => {
    const response = await fetch(base + path);
    return { status: response.status, body: await response.json() };
  };
  const health = await get('/health');
  const pairing = await get('/pairing');
  const payload = {
    schemaVersion: CONTRACT_VERSION,
    idempotencyKey: 'selftest:illustration:1:adhoc',
    deliveryTarget: 'example',
    work: { id: '1', type: 'illustration', title: 'selftest', sourceUrl: 'https://www.pixiv.net/artworks/1', spoiler: false, tags: [] },
    message: { text: 'selftest', mediaTransport: 'base64', parts: [], media: [{ kind: 'image', dataBase64: 'AAAA' }], dropped: [] },
    delivery: { idempotencyKey: 'selftest:illustration:1:adhoc' },
  };
  const post = async () => {
    const response = await fetch(`${base}/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': payload.idempotencyKey },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  };
  const first = await post();
  const second = await post();
  server.close();
  const report = { health, pairing, first, second };
  console.log(JSON.stringify(report, null, 2));
  const ok =
    health.body.contractVersion === CONTRACT_VERSION &&
    first.body.status === 'accepted' &&
    second.body.status === 'duplicate_existing';
  log(ok ? 'selftest.passed' : 'selftest.FAILED');
  process.exit(ok ? 0 : 1);
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`;
if (invokedDirectly) {
  if (process.argv.includes('--selftest')) {
    await selftest();
  } else {
    const port = Number(process.env.PORT ?? 8790);
    const host = process.env.HOST ?? '127.0.0.1';
    const server = createExampleGateway();
    server.listen(port, host, () => {
      // Report the port the OS actually bound, not the one that was requested:
      // `PORT=0` asks for any free port, and a log line echoing "0" would send
      // the reader (or a test) to an address nothing is listening on.
      const address = server.address();
      const bound = typeof address === 'object' && address ? address.port : port;
      log('listening', { url: `http://${host}:${bound}`, contractVersion: CONTRACT_VERSION });
      log('endpoints', { deliver: 'POST /deliver', pairing: 'GET /pairing', health: 'GET /health' });
    });
  }
}
