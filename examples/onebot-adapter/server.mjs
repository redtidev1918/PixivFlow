#!/usr/bin/env node
/**
 * Example OneBot v11 delivery connector — the thin process `docs/GATEWAY.md` §5.3
 * describes, shipped so the QQ path stops being a diagram.
 *
 *   PixivFlow ──POST /deliver (Gateway Contract v1)──▶ this adapter
 *                                                     │ POST /send_group_msg
 *                                                     ▼
 *                            NapCat / Lagrange / LLOneBot ──▶ QQ
 *
 * WHAT THIS IS NOT
 *   It does not implement the QQ protocol, OneBot itself, or any login/QR flow.
 *   The QQ session belongs to the OneBot implementation you already run (NapCat
 *   shows the QR code in its own panel; credentials never reach this process or
 *   PixivFlow). This adapter only translates:
 *
 *     contract message  ->  OneBot v11 message segments
 *     OneBot retcode    ->  contract ACK word
 *
 *   That is why it is an *example*: platform mapping lives on the gateway side,
 *   so PixivFlow's contract never grows a branch per platform.
 *
 *   node examples/onebot-adapter/server.mjs                  # listen on :8791
 *   ONEBOT_URL=http://127.0.0.1:3000 node …/server.mjs
 *   node examples/onebot-adapter/server.mjs --selftest       # fake OneBot, exit 0/1
 *
 * Environment (see examples/onebot-adapter/README.md for the full table):
 *   PORT                    listen port (default 8791)
 *   HOST                    bind address (default 127.0.0.1)
 *   ADAPTER_TOKEN           required `Authorization: Bearer <token>` from PixivFlow
 *   ADAPTER_SECRET          when set, verifies X-Webhook-Signature over the raw body
 *   ONEBOT_URL              OneBot HTTP API base, e.g. http://127.0.0.1:3000
 *   ONEBOT_TOKEN            bearer token for the OneBot API (NOT the adapter token)
 *   ONEBOT_TARGET           "group:123456" (default) or "private:123456"
 *   ONEBOT_TIMEOUT_MS       per OneBot call timeout (default 15000)
 *   ONEBOT_MIN_SEND_INTERVAL_MS
 *                           spacing between OneBot calls (default 500)
 *   ONEBOT_STATE_FILE       idempotency store (default ./.onebot-adapter-state.jsonl)
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { appendFileSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export const CONTRACT_VERSION = 1;
export const DEFAULT_STATE_FILE = '.onebot-adapter-state.jsonl';

/**
 * OneBot v11 answers HTTP 200 for almost everything; the verdict is `retcode`.
 * 100–105 are malformed-request codes (deterministic: retrying sends the same
 * bad bytes), 1400/1404 are NapCat's bad-request / not-found. Everything else
 * (including an unknown code) stays RETRYABLE, because a delivery that might
 * still land must not be turned into a dead letter by a guess.
 */
export const DETERMINISTIC_RETCODES = new Set([100, 102, 103, 104, 105, 1400, 1404]);

export function log(event, fields = {}) {
  const line = Object.entries(fields)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ');
  console.log(`[onebot-adapter] ${event}${line ? ' ' + line : ''}`);
}

/** Constant-time compare that never throws on a length mismatch. */
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verify `X-Webhook-Signature` over the RAW request bytes.
 *
 * Re-serializing the parsed JSON changes the bytes and breaks the HMAC — the
 * most common way a gateway gets this wrong (GATEWAY_CONTRACT §6).
 */
export function verifySignature({ secret, header, timestampHeader, rawBody, now = Date.now() }) {
  if (!secret) return { ok: true };
  if (!header || !timestampHeader) return { ok: false, reason: 'missing signature headers' };
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'malformed timestamp' };
  if (Math.abs(now / 1000 - timestamp) > 300) return { ok: false, reason: 'stale timestamp' };
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  return safeEqual(expected, header) ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

/** `group:123456` / `private:123456` -> the send/upload action pair this adapter uses. */
export function parseTarget(raw) {
  const value = String(raw ?? '').trim();
  const match = value.match(/^(group|private):(-?\d+)$/);
  if (!match) return { ok: false, reason: `ONEBOT_TARGET must be "group:<id>" or "private:<id>" (got "${value}")` };
  const [, kind, id] = match;
  // OneBot v11 wants a NUMBER for group_id/user_id; keep the raw string too, so
  // logs and startup checks show exactly what the operator configured.
  const idValue = /^-?\d+$/.test(id) ? Number(id) : id;
  return kind === 'group'
    ? { ok: true, kind, id, idValue, sendAction: 'send_group_msg', uploadAction: 'upload_group_file', idField: 'group_id' }
    : { ok: true, kind, id, idValue, sendAction: 'send_private_msg', uploadAction: 'upload_private_file', idField: 'user_id' };
}

/**
 * One media entry -> the `file` value a OneBot segment / upload accepts.
 *
 * `base64://` works for every transport; `file://` (an absolute local path) only
 * works when the OneBot implementation can read PixivFlow's disk. That is the
 * `reference` transport's whole trade-off, so it stays visible instead of being
 * silently downgraded.
 */
export function mediaFileRef(media) {
  if (typeof media?.dataBase64 === 'string' && media.dataBase64) return `base64://${media.dataBase64}`;
  if (typeof media?.path === 'string' && media.path) return `file://${resolve(media.path)}`;
  return null;
}

/**
 * Contract `message.parts` -> OneBot message segments, in order.
 *
 * Text lives in `message.text` (the wire carries one `{kind:"text"}` marker, not
 * the text itself), so the first text part uses it and later ones are dropped.
 * `file` is NOT a message segment in OneBot — it becomes a second, explicit
 * `upload_*_file` step, which is why it is returned separately.
 */
export function buildMessage(parts, text) {
  const segments = [];
  const files = [];
  let textUsed = false;
  for (const part of Array.isArray(parts) ? parts : []) {
    if (part?.kind === 'text') {
      if (!textUsed && text) {
        segments.push({ type: 'text', data: { text } });
        textUsed = true;
      }
      continue;
    }
    const media = part?.media ?? {};
    if (part?.kind === 'file') {
      files.push({
        ref: mediaFileRef(media),
        name: media.assetId ? `${media.assetId}${extensionFor(media.mime)}` : basename(String(media.path ?? '')) || 'pixivflow-file',
      });
      continue;
    }
    const ref = mediaFileRef(media);
    if (!ref) {
      // Nothing to send for this part: say so rather than posting an empty
      // segment OneBot would reject as a malformed request.
      segments.push({ type: 'text', data: { text: `[跳过无法传输的 ${part?.kind ?? 'media'} 片段]` } });
      continue;
    }
    segments.push({ type: part.kind === 'video' ? 'video' : 'image', data: { file: ref } });
  }
  if (!textUsed && text) segments.unshift({ type: 'text', data: { text } });
  return { segments, files };
}

function extensionFor(mime) {
  if (typeof mime !== 'string') return '';
  if (mime.includes('zip')) return '.zip';
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('plain')) return '.txt';
  return '';
}

/** One idempotency record per successful delivery, appended to a JSONL file. */
export function createStore(file) {
  const seen = new Map();
  if (file) {
    try {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line);
          if (row?.key) seen.set(row.key, row);
        } catch {
          // A torn last line (killed mid-append) must not stop the adapter: the
          // contract explicitly allows retrying a key we have no proof about.
        }
      }
    } catch {
      // No store yet: first run.
    }
  }
  return {
    get: (key) => seen.get(key),
    put(key, record) {
      seen.set(key, record);
      if (!file) return;
      try {
        appendFileSync(file, `${JSON.stringify({ key, ...record })}\n`);
      } catch (error) {
        // Losing the durable copy is survivable for a demo and NOT for a real
        // gateway: shout rather than pretending the record was written.
        log('store.write_failed', { message: error?.message ?? String(error) });
      }
    },
  };
}

/** The smallest OneBot v11 HTTP client this adapter needs. */
export function createOneBotClient(options) {
  let lastCallAt = 0;
  async function waitForSlot() {
    const gap = options.minSendIntervalMs - (Date.now() - lastCallAt);
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    lastCallAt = Date.now();
  }
  return {
    async call(action, params = {}) {
      await waitForSlot();
      const headers = { 'Content-Type': 'application/json' };
      if (options.onebotToken) headers.Authorization = `Bearer ${options.onebotToken}`;
      try {
        const response = await fetch(`${options.onebotUrl.replace(/\/+$/, '')}/${action}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        const text = await response.text();
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { raw: text.slice(0, 200) };
        }
        return { httpStatus: response.status, body };
      } catch (error) {
        return { httpStatus: 0, error: error?.message ?? String(error) };
      }
    },
  };
}

/**
 * OneBot answer -> `{http, body}` for PixivFlow.
 *
 * The rule from GATEWAY_CONTRACT §5 is "word first, code second": when there is
 * a terminal word it is the verdict, and when this adapter has nothing honest to
 * say it answers with a bare HTTP code and NO status word, which is what keeps
 * "your token is wrong" retryable instead of dead-lettering it.
 */
export function mapSendResult({ httpStatus, body, error }, action) {
  if (error) return { http: 502, body: { reason: `onebot ${action} unreachable: ${error}` } };
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404) {
    return { http: httpStatus, body: { reason: `onebot ${action} answered HTTP ${httpStatus}` } };
  }
  if (httpStatus === 429) return { http: 429, body: { reason: 'onebot rate limited the request' } };
  if (httpStatus >= 500 || httpStatus === 0) {
    return { http: 502, body: { reason: `onebot ${action} answered HTTP ${httpStatus}` } };
  }
  if (!body || typeof body !== 'object') {
    return { http: 502, body: { reason: `onebot ${action} answered a non-JSON body` } };
  }
  const wording = typeof body.wording === 'string' ? body.wording : undefined;
  const messageId = body?.data?.message_id;
  if (body.status === 'async' || body.retcode === 1) {
    // "Accepted, result unknown" — never report success for this.
    return { http: 200, body: { status: 'pending', reason: wording ?? 'onebot accepted the request asynchronously' } };
  }
  if (body.retcode === 0) {
    return { http: 200, body: { status: 'accepted', id: messageId !== undefined ? String(messageId) : undefined } };
  }
  if (DETERMINISTIC_RETCODES.has(body.retcode)) {
    return { http: 200, body: { status: 'failed', reason: wording ?? `onebot retcode ${body.retcode}` } };
  }
  return { http: 502, body: { reason: `onebot retcode ${body.retcode ?? 'missing'}` } };
}

function readBody(req, limitBytes = 256 * 1024 * 1024) {
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
    req.on('end', () => resolvePromise(Buffer.concat(chunks)));
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
 * `POST /deliver` — the whole contract in one handler: authenticate, validate,
 * dedupe, translate, send, then answer with a status WORD (never "HTTP 200").
 */
async function handleDeliver(req, res, options, store, client) {
  const rawBody = await readBody(req);
  const signature = verifySignature({
    secret: options.secret,
    header: req.headers['x-webhook-signature'],
    timestampHeader: req.headers['x-webhook-timestamp'],
    rawBody: rawBody.toString('utf8'),
  });
  if (!signature.ok) {
    log('deliver.rejected', { reason: signature.reason });
    // No status word on purpose: a terminal word outranks the HTTP code, and
    // this 401 is retryable once the secret is fixed.
    return sendJson(res, 401, { reason: signature.reason });
  }
  if (options.token) {
    if (!safeEqual(`Bearer ${options.token}`, req.headers.authorization ?? '')) {
      log('deliver.rejected', { reason: 'bad bearer token' });
      return sendJson(res, 401, { reason: 'unauthorized' });
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return sendJson(res, 400, { reason: 'body is not JSON' });
  }
  if (payload?.schemaVersion !== CONTRACT_VERSION) {
    // A version mismatch is a deployment error: retrying sends the same bytes to
    // the same code, so it must reach the dead-letter queue where an operator
    // will see it.
    return sendJson(res, 400, { reason: `unsupported schemaVersion: ${payload?.schemaVersion ?? 'missing'}` });
  }
  const key = payload.idempotencyKey;
  if (typeof key !== 'string' || !key) return sendJson(res, 400, { reason: 'missing idempotencyKey' });

  const prior = store.get(key);
  if (prior?.status === 'accepted') {
    log('deliver.duplicate', { key, id: prior.id });
    return sendJson(res, 200, { status: 'duplicate_existing', id: prior.id, reason: 'already delivered' });
  }

  const { segments, files } = buildMessage(payload?.message?.parts, payload?.message?.text);
  const target = options.target;
  log('deliver.sending', {
    key,
    work: payload?.work?.id,
    type: payload?.work?.type,
    target: `${target.kind}:${target.id}`,
    segments: segments.length,
    files: files.length,
  });

  let outcome = { http: 200, body: { status: 'accepted' } };
  if (segments.length > 0) {
    const answer = await client.call(target.sendAction, { [target.idField]: target.idValue, message: segments });
    outcome = mapSendResult(answer, target.sendAction);
    if (outcome.http !== 200 || (outcome.body.status !== 'accepted' && outcome.body.status !== 'pending')) {
      log('deliver.failed', { key, http: outcome.http, reason: outcome.body.reason });
      return sendJson(res, outcome.http, outcome.body);
    }
  }

  // File attachments are a second step by design (`upload_group_file`), then a
  // notice so the group sees what landed. A failed upload is reported, not
  // swallowed: the delivery is then honestly incomplete.
  const uploaded = [];
  for (const file of files) {
    if (!file.ref) continue;
    const answer = await client.call(target.uploadAction, {
      [target.idField]: target.idValue,
      file: file.ref,
      name: file.name,
    });
    const mapped = mapSendResult(answer, target.uploadAction);
    if (mapped.http !== 200 || mapped.body.status !== 'accepted') {
      log('deliver.upload_failed', { key, name: file.name, http: mapped.http, reason: mapped.body.reason });
      return sendJson(res, mapped.http, mapped.body);
    }
    uploaded.push(file.name);
  }
  if (uploaded.length > 0) {
    const notice = uploaded.map((name) => `📎 附件：${name}`).join('\n');
    const answer = await client.call(target.sendAction, {
      [target.idField]: target.idValue,
      message: [{ type: 'text', data: { text: notice } }],
    });
    const mapped = mapSendResult(answer, target.sendAction);
    if (mapped.http !== 200 || mapped.body.status === 'failed') {
      log('deliver.notice_failed', { key, http: mapped.http, reason: mapped.body.reason });
      return sendJson(res, mapped.http, mapped.body);
    }
  }

  store.put(key, { status: outcome.body.status === 'pending' ? 'pending' : 'accepted', id: outcome.body.id ?? null, at: Date.now() });
  log('deliver.accepted', { key, id: outcome.body.id ?? null, files: uploaded.length });
  return sendJson(res, 200, outcome.body);
}

/** `GET /pairing` — read-only. PixivFlow never logs in; NapCat owns the session. */
async function handlePairing(res, client) {
  const answer = await client.call('get_login_info');
  if (answer.error || answer.httpStatus === 0 || answer.httpStatus >= 500) {
    return sendJson(res, 503, { status: 'unreachable', reason: answer.error ?? `onebot HTTP ${answer.httpStatus}` });
  }
  if (answer.body?.retcode !== 0) {
    // Reachable but not logged in: that IS "waiting", with NapCat's own wording.
    return sendJson(res, 200, {
      status: 'waiting',
      reason: answer.body?.wording ?? `onebot retcode ${answer.body?.retcode ?? 'missing'}`,
    });
  }
  const account = answer.body?.data?.user_id;
  return sendJson(res, 200, {
    status: 'connected',
    account: account !== undefined ? String(account) : undefined,
    nickname: answer.body?.data?.nickname,
  });
}

/** `GET /health` — for operators (`pixivflow gateway status`), never a delivery gate. */
async function handleHealth(res, client) {
  const answer = await client.call('get_status');
  const data = answer.body?.data ?? {};
  const connected = answer.body?.retcode === 0 && data.online !== false && data.good === true;
  return sendJson(res, connected ? 200 : 503, {
    status: connected ? 'connected' : 'unreachable',
    contractVersion: CONTRACT_VERSION,
    gateway: 'pixivflow-onebot-adapter',
    onebot: { online: data.online !== false, good: data.good === true, retcode: answer.body?.retcode ?? null },
  });
}

export function createAdapter(options = {}) {
  const config = {
    token: options.token ?? null,
    secret: options.secret ?? null,
    target: options.target,
    onebotUrl: options.onebotUrl ?? 'http://127.0.0.1:3000',
    onebotToken: options.onebotToken ?? null,
    timeoutMs: options.timeoutMs ?? 15_000,
    minSendIntervalMs: options.minSendIntervalMs ?? 500,
    stateFile: options.stateFile === undefined ? null : options.stateFile,
  };
  const store = createStore(config.stateFile);
  const client = options.client ?? createOneBotClient(config);
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /health') return void handleHealth(res, client);
    if (route === 'GET /pairing') return void handlePairing(res, client);
    if (route === 'POST /deliver') {
      handleDeliver(req, res, config, store, client).catch((error) => {
        log('deliver.error', { message: error?.message ?? String(error) });
        // A bare 500 with no status word stays retryable.
        if (!res.headersSent) sendJson(res, 500, { reason: 'internal error' });
      });
      return undefined;
    }
    return sendJson(res, 404, { status: 'invalid', reason: `no route for ${route}` });
  });
}

/** Resolve env into adapter options; refuses to start half-configured. */
export function optionsFromEnv(env = process.env) {
  const target = parseTarget(env.ONEBOT_TARGET ?? 'group:0');
  const problems = [];
  if (!target.ok) problems.push(target.reason);
  if (target.ok && target.id === '0') problems.push('ONEBOT_TARGET is unset (still the placeholder group:0)');
  if (!env.ONEBOT_URL) problems.push('ONEBOT_URL is unset (e.g. http://127.0.0.1:3000)');
  if (!env.ADAPTER_TOKEN) log('warning', { reason: 'ADAPTER_TOKEN is unset: /deliver is unauthenticated' });
  return {
    problems,
    options: {
      token: env.ADAPTER_TOKEN ?? null,
      secret: env.ADAPTER_SECRET ?? null,
      target: target.ok ? target : null,
      onebotUrl: env.ONEBOT_URL ?? 'http://127.0.0.1:3000',
      onebotToken: env.ONEBOT_TOKEN ?? null,
      timeoutMs: Number(env.ONEBOT_TIMEOUT_MS ?? 15_000),
      minSendIntervalMs: Number(env.ONEBOT_MIN_SEND_INTERVAL_MS ?? 500),
      stateFile: env.ONEBOT_STATE_FILE ?? DEFAULT_STATE_FILE,
    },
  };
}

/** A pretend OneBot implementation: enough for `--selftest`, no QQ involved. */
export function createFakeOneBot({ loginInfo = { user_id: 10001, nickname: 'selftest' } } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    const action = (req.url ?? '/').replace(/^\//, '');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let params = {};
      try {
        params = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        params = {};
      }
      calls.push({ action, params });
      const respond = (body) =>
        sendJson(res, 200, { status: 'ok', retcode: 0, data: null, ...body });
      if (action === 'get_status') return respond({ data: { online: true, good: true } });
      if (action === 'get_login_info') return respond({ data: loginInfo });
      if (action.startsWith('send_')) return respond({ data: { message_id: 42 } });
      if (action.startsWith('upload_')) return respond({ data: {} });
      return sendJson(res, 200, { status: 'failed', retcode: 1404, wording: `unknown action ${action}` });
    });
  });
  return { server, calls };
}

/** Start, exercise all three endpoints against a fake OneBot, print, exit 0/1. */
async function selftest() {
  const fake = createFakeOneBot();
  await new Promise((r) => fake.server.listen(0, '127.0.0.1', r));
  const onebotUrl = `http://127.0.0.1:${fake.server.address().port}`;
  const adapter = createAdapter({
    token: 'selftest-token',
    target: parseTarget('group:987654'),
    onebotUrl,
    stateFile: null,
  });
  await new Promise((r) => adapter.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${adapter.address().port}`;

  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer selftest-token' };
  const payload = {
    schemaVersion: CONTRACT_VERSION,
    idempotencyKey: 'selftest:illustration:1:adhoc',
    deliveryTarget: 'qq-main',
    work: { id: '1', type: 'illustration', title: 'selftest', sourceUrl: 'https://www.pixiv.net/artworks/1', spoiler: false, tags: [] },
    message: {
      text: 'selftest 正文',
      mediaTransport: 'base64',
      parts: [
        { kind: 'text' },
        { kind: 'image', media: { kind: 'image', dataBase64: 'AAAA', mime: 'image/jpeg' } },
        { kind: 'file', media: { kind: 'file', path: '/tmp/selftest.zip', mime: 'application/zip' } },
      ],
      media: [],
      dropped: [],
    },
    delivery: { idempotencyKey: 'selftest:illustration:1:adhoc' },
  };
  const post = async (body = payload) => {
    const response = await fetch(`${base}/deliver`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const first = await post();
  const second = await post();
  const unauth = await fetch(`${base}/deliver`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const pairing = await (await fetch(`${base}/pairing`)).json();
  const health = await (await fetch(`${base}/health`)).json();

  adapter.close();
  fake.server.close();
  const sent = fake.calls.find((c) => c.action === 'send_group_msg');
  const report = {
    first,
    second,
    unauth: unauth.status,
    pairing,
    health,
    onebotCalls: fake.calls.map((c) => c.action),
    segments: sent?.params?.message,
  };
  console.log(JSON.stringify(report, null, 2));
  const ok =
    first.status === 200 &&
    Array.isArray(first.body.id) === false &&
    second.body.status === 'duplicate_existing' &&
    unauth.status === 401 &&
    pairing.status === 'connected' &&
    health.status === 'connected' &&
    sent?.params?.message?.[0]?.type === 'text' &&
    sent?.params?.message?.[1]?.data?.file === 'base64://AAAA' &&
    fake.calls.some((c) => c.action === 'upload_group_file');
  log(ok ? 'selftest.passed' : 'selftest.FAILED');
  process.exit(ok ? 0 : 1);
}

/** Cheap liveness for the adapter process itself (used by tests + operators). */
export function adapterVersion() {
  return { contractVersion: CONTRACT_VERSION, adapter: 'onebot-v11', build: randomUUID().slice(0, 8) };
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`;
if (invokedDirectly) {
  if (process.argv.includes('--selftest')) {
    await selftest();
  } else {
    const { problems, options } = optionsFromEnv();
    if (problems.length > 0) {
      // Refuse to start half-configured: a silently wrong target publishes to
      // the wrong group, which is worse than not starting.
      for (const problem of problems) log('config.problem', { problem });
      process.exit(2);
    }
    const port = Number(process.env.PORT ?? 8791);
    const host = process.env.HOST ?? '127.0.0.1';
    const server = createAdapter(options);
    server.listen(port, host, () => {
      const address = server.address();
      const bound = typeof address === 'object' && address ? address.port : port;
      log('listening', { url: `http://${host}:${bound}`, contractVersion: CONTRACT_VERSION, target: `${options.target.kind}:${options.target.id}` });
      log('endpoints', { deliver: 'POST /deliver', pairing: 'GET /pairing', health: 'GET /health' });
    });
  }
}
