/**
 * The Gateway Contract is prose AND code, and this suite is what keeps them
 * from drifting apart.
 *
 * `docs/GATEWAY_CONTRACT.md` is what a gateway author reads; it is also what
 * they cannot run. `src/delivery/gatewayContract.ts` is what PixivFlow
 * executes; it is also what a gateway author never reads. If the two disagree,
 * an integrator implements the document and PixivFlow quietly rejects them — a
 * failure that surfaces as "deliveries are not arriving" days later, with no
 * stack trace pointing anywhere.
 *
 * So every vocabulary in the document is parsed out of it and compared against
 * the module: the endpoint table, the ack classification table, the pairing
 * status table, the error-code table. Adding a status word to the code without
 * documenting it fails HERE, at the moment it is added, instead of in
 * production at the moment it is needed.
 *
 * The last three tests run `examples/gateway/server.mjs` — the reference
 * implementation shipped with the docs — and assert it answers exactly the way
 * the document promises. A reference implementation that does not satisfy the
 * contract is worse than no reference at all.
 */
import { spawn, spawnSync, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GATEWAY_ACCEPTED_STATUSES,
  GATEWAY_ACK_TO_DELIVERY_KIND,
  GATEWAY_ACK_VOCABULARY,
  GATEWAY_CONTRACT_VERSION,
  GATEWAY_DUPLICATE_STATUSES,
  GATEWAY_ENDPOINTS,
  GATEWAY_PAIRING_IMAGE_FIELDS,
  GATEWAY_PAIRING_STATES,
  GATEWAY_PENDING_STATUSES,
  GATEWAY_TERMINAL_FAILURE_STATUSES,
  classifyGatewayAck,
  classifyGatewayPairing,
  resolveGatewayEndpoints,
} from '../../delivery/gatewayContract';
import { parseWebhookAck } from '../../delivery/WebhookDelivery';
import { ErrorCode } from '../../webui/utils/error-codes';

const ROOT = join(__dirname, '..', '..', '..');
const CONTRACT_DOC = readFileSync(join(ROOT, 'docs', 'GATEWAY_CONTRACT.md'), 'utf8');
const EXAMPLE_README = readFileSync(join(ROOT, 'examples', 'gateway', 'README.md'), 'utf8');
const EXAMPLE_SERVER = join(ROOT, 'examples', 'gateway', 'server.mjs');

/** Split a markdown document into `heading → section body` at one heading level. */
function sections(markdown: string, level: number): Map<string, string> {
  const marker = '#'.repeat(level);
  const result = new Map<string, string>();
  const pattern = new RegExp(`^${marker} (.+)$`, 'gm');
  const matches = [...markdown.matchAll(pattern)];
  matches.forEach((match, index) => {
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index! : markdown.length;
    result.set(match[1].trim(), markdown.slice(start, end));
  });
  return result;
}

/** Every markdown table in a section, as rows of trimmed cells. */
function tables(body: string): string[][][] {
  const result: string[][][] = [];
  let current: string[][] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());
      // Separator rows (`| --- | --- |`) carry no data.
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
      current.push(cells);
      continue;
    }
    if (current.length) {
      result.push(current);
      current = [];
    }
  }
  if (current.length) result.push(current);
  return result;
}

function bodyOf(markdown: string, heading: string): string {
  const found = sections(markdown, 2).get(heading);
  if (found === undefined) throw new Error(`heading not found in contract doc: "${heading}"`);
  return found;
}

function tableWithHeader(markdown: string, heading: string, headerToken: string): string[][] {
  const found = tables(bodyOf(markdown, heading)).find((table) =>
    table[0].some((cell) => cell.includes(headerToken))
  );
  if (!found) throw new Error(`no table with header "${headerToken}" under "${heading}"`);
  return found;
}

function firstTable(markdown: string, heading: string): string[][] {
  const found = tables(bodyOf(markdown, heading))[0];
  if (!found) throw new Error(`no table under heading "${heading}"`);
  return found;
}

/** The backticked token in the first column of a table row. */
function tokenIn(cell: string): string {
  const match = cell.match(/`([^`]+)`/);
  return match ? match[1] : cell;
}

describe('gateway contract document matches the contract module', () => {
  it('documents every endpoint in the same table shape as GATEWAY_ENDPOINTS', () => {
    const rows = firstTable(CONTRACT_DOC, '1. 端点').slice(1);
    const documented = rows.map((row) => ({
      path: tokenIn(row[0]),
      method: row[1],
      required: row[2],
      configField: tokenIn(row[3]),
    }));
    const expected = Object.values(GATEWAY_ENDPOINTS).map((spec) => ({
      path: spec.path,
      method: spec.method,
      required: spec.required ? '是' : '否',
      configField: spec.configField,
    }));
    expect(documented).toEqual(expected);
  });

  it('classifies every status word exactly once, with the documented classification', () => {
    const rows = firstTable(CONTRACT_DOC, '5. 响应与 ACK 词汇表').slice(1);
    const documented = new Map<string, string[]>();
    for (const row of rows) {
      const word = tokenIn(row[0]);
      const classification = tokenIn(row[1]);
      documented.set(word, [...(documented.get(word) ?? []), classification]);
    }

    const fromModule = new Map<string, string>();
    for (const [classification, words] of Object.entries(GATEWAY_ACK_VOCABULARY)) {
      for (const word of words) fromModule.set(word, classification);
    }

    // Both directions: an undocumented word, and a documented word that no
    // longer exists, are each a contract break.
    expect([...documented.keys()].sort()).toEqual([...fromModule.keys()].sort());
    for (const [word, classifications] of documented) {
      expect(classifications).toEqual([fromModule.get(word)]);
    }
  });

  it('keeps the vocabulary lists disjoint, so a word can never mean two things', () => {
    const lists: Array<[string, readonly string[]]> = [
      ['accepted', GATEWAY_ACCEPTED_STATUSES],
      ['duplicate', GATEWAY_DUPLICATE_STATUSES],
      ['pending', GATEWAY_PENDING_STATUSES],
      ['remote_failed', GATEWAY_TERMINAL_FAILURE_STATUSES],
    ];
    for (const [name, words] of lists) {
      expect(new Set(words).size).toBe(words.length);
      expect(name).toBeTruthy();
    }
    const all = lists.flatMap(([, words]) => words);
    expect(new Set(all).size).toBe(all.length);
  });

  it('documents every pairing status', () => {
    const rows = tableWithHeader(CONTRACT_DOC, '7. `GET /pairing`', '`status` 值').slice(1);
    expect(rows.map((row) => tokenIn(row[0]))).toEqual([...GATEWAY_PAIRING_STATES]);
  });

  it('documents every pairing image field name the classifier accepts', () => {
    for (const field of GATEWAY_PAIRING_IMAGE_FIELDS) {
      expect(CONTRACT_DOC).toContain(`\`${field}\``);
    }
    expect(CONTRACT_DOC).toContain('data:image/*;base64,');
  });

  it('documents every gateway error code the WebUI can return', () => {
    const rows = firstTable(CONTRACT_DOC, '9. 错误码（PixivFlow 侧）').slice(1);
    const documented = rows.map((row) => tokenIn(row[0]));
    const gatewayCodes = Object.entries(ErrorCode)
      .map(([, value]) => value as string)
      .filter((code) => /GATEWAY|PAIRING|DELIVERY/.test(code));
    expect(documented.sort()).toEqual(gatewayCodes.sort());
    for (const code of documented) expect(CONTRACT_DOC).toContain(ErrorCode[code as keyof typeof ErrorCode]);
  });

  it('documents the schema version the payload actually carries', () => {
    expect(CONTRACT_DOC).toContain(`\`${GATEWAY_CONTRACT_VERSION}\``);
    expect(GATEWAY_CONTRACT_VERSION).toBe(1);
  });
});

describe('classifyGatewayAck agrees with the ack parser that executes it', () => {
  // If these two ever disagree, gateway authors code against a rule PixivFlow
  // does not apply. The matrix is exhaustive over the interesting boundary:
  // status codes that change meaning, and words that override the status code.
  const bodies: Array<[string, unknown]> = [
    ['no body', undefined],
    ['empty object', {}],
    ['accepted word', { status: 'accepted' }],
    ['ok word', { status: 'ok' }],
    ['success word', { status: 'published' }],
    ['delivered word', { status: 'delivered' }],
    ['duplicate word', { status: 'duplicate_existing' }],
    ['already_exists word', { status: 'already_exists' }],
    ['pending word', { status: 'pending' }],
    ['processing word', { status: 'processing' }],
    ['failed word on a 200', { status: 'failed' }],
    ['rejected word', { status: 'rejected' }],
    ['unknown word on a 200', { status: 'banana' }],
    ['reason detail', { status: 'rejected', reason: 'chat does not exist' }],
    ['error detail', { status: 'failed', error: 'rate limited' }],
    ['message detail', { status: 'failed', message: 'no media' }],
    ['non-object body', 'ok'],
    ['array body', ['accepted']],
  ];
  const statuses = [200, 201, 204, 400, 401, 404, 409, 429, 500, 502, 503];

  it.each(statuses.flatMap((status) => bodies.map(([name, body]) => [status, name, body] as const)))(
    'HTTP %i with %s',
    (status, _name, body) => {
      const expected = classifyGatewayAck({ status, body });
      const actual = parseWebhookAck({ status, body });
      expect(actual.kind).toBe(GATEWAY_ACK_TO_DELIVERY_KIND[expected]);
    }
  );

  it('treats a business verdict as terminal even when the HTTP status is a success', () => {
    expect(classifyGatewayAck({ status: 200, body: { status: 'failed' } })).toBe('remote_failed');
    expect(parseWebhookAck({ status: 200, body: { status: 'failed' } }).kind).toBe('remote_failed');
  });

  it('refuses to read an unrecognised success word as a success', () => {
    expect(classifyGatewayAck({ status: 200, body: { status: 'probably-fine' } })).toBe(
      'retryable_failure'
    );
  });

  it('dead-letters a deterministic 4xx instead of burning the retry budget', () => {
    expect(classifyGatewayAck({ status: 400, body: { reason: 'bad payload' } })).toBe(
      'permanent_failure'
    );
  });
});

describe('classifyGatewayPairing', () => {
  it('reports status, image and account from a well-formed answer', () => {
    expect(
      classifyGatewayPairing({ status: 'waiting', qrCode: 'data:image/png;base64,AAAA' })
    ).toEqual({ status: 'waiting', hasImage: true, account: null });
    expect(classifyGatewayPairing({ status: 'connected', account: '123456' })).toEqual({
      status: 'connected',
      hasImage: false,
      account: '123456',
    });
  });

  it('falls back to unknown rather than guessing at an unlisted status', () => {
    expect(classifyGatewayPairing({ status: 'almost-there' }).status).toBe('unknown');
    expect(classifyGatewayPairing(null).status).toBe('unknown');
    expect(classifyGatewayPairing('html page').status).toBe('unknown');
  });

  it('refuses to call an HTML login page an image', () => {
    const html = '<!doctype html><html><body>login</body></html>';
    expect(classifyGatewayPairing(html).hasImage).toBe(false);
    expect(classifyGatewayPairing({ image: 'http://napcat.local/qr.png' }).hasImage).toBe(false);
    expect(classifyGatewayPairing({ contentType: 'text/html', base64: 'AAAA' }).hasImage).toBe(false);
    expect(classifyGatewayPairing({ contentType: 'image/png', base64: 'AAAA' }).hasImage).toBe(true);
  });
});

describe('resolveGatewayEndpoints', () => {
  const identity = (value: string) => value;

  it('expands configured templates', () => {
    expect(
      resolveGatewayEndpoints(
        { url: 'http://gw:8790/deliver', pairingUrl: 'http://gw:8790/pairing' },
        identity
      )
    ).toEqual({ deliveryUrl: 'http://gw:8790/deliver', pairingUrl: 'http://gw:8790/pairing' });
  });

  it('reports null for a missing endpoint instead of an unusable template', () => {
    expect(resolveGatewayEndpoints({ url: undefined, pairingUrl: '  ' }, identity)).toEqual({
      deliveryUrl: null,
      pairingUrl: null,
    });
  });

  it('never treats an unexpanded ${ENV_VAR} placeholder as a URL', () => {
    // Posting to the literal string "${PIXIVFLOW_GATEWAY_URL}" fails at the
    // socket layer with a confusing error; null fails at the config layer with
    // an actionable one.
    expect(resolveGatewayEndpoints({ url: '${GATEWAY_URL}' }, identity).deliveryUrl).toBeNull();
    expect(
      resolveGatewayEndpoints({ url: 'http://gw/${PATH}' }, identity).deliveryUrl
    ).toBe('http://gw/${PATH}');
  });
});

describe('examples/gateway satisfies the contract it documents', () => {
  /**
   * The example is ESM, and this suite runs under ts-jest's CommonJS mode, so
   * it is exercised the way an integrator actually uses it: as a process, over
   * HTTP. That is also the stricter test — it proves the shipped file runs at
   * all, which importing a helper would not.
   */
  let child: ChildProcessByStdio<null, Readable, Readable>;
  let base: string;

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

  beforeAll(async () => {
    child = spawn(process.execPath, [EXAMPLE_SERVER], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: '0',
        HOST: '127.0.0.1',
        EXAMPLE_GATEWAY_SECRET: 'shared-secret',
        EXAMPLE_GATEWAY_STATUS: 'waiting',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = `http://127.0.0.1:${await waitForPort(child.stdout)}`;
  });

  afterAll(() => {
    child?.kill('SIGTERM');
  });

  const payloadFor = (key: string): Record<string, unknown> => ({
    schemaVersion: GATEWAY_CONTRACT_VERSION,
    idempotencyKey: key,
    deliveryTarget: 'example',
    work: {
      id: '12345678',
      type: 'illustration',
      title: 'example work',
      sourceUrl: 'https://www.pixiv.net/artworks/12345678',
      spoiler: false,
      tags: ['tag'],
    },
    message: {
      text: 'example text',
      mediaTransport: 'base64',
      parts: [{ kind: 'text' }],
      media: [{ kind: 'image', dataBase64: 'AAAA', mime: 'image/jpeg' }],
      dropped: [],
    },
    delivery: { idempotencyKey: key },
  });

  /** Sign a body the way the contract says, over the RAW bytes. */
  const signed = (body: string, secret = 'shared-secret', at = Math.floor(Date.now() / 1000)) => ({
    'X-Webhook-Timestamp': String(at),
    'X-Webhook-Signature': `sha256=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`,
  });

  const post = async (
    body: string,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    const response = await fetch(`${base}/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  it('runs a real process that answers GET /health with the documented body', async () => {
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'connected',
      contractVersion: GATEWAY_CONTRACT_VERSION,
      gateway: 'pixivflow-example-gateway',
    });
  });

  it('answers GET /pairing in a shape the classifier renders as an image', async () => {
    const response = await fetch(`${base}/pairing`);
    expect(response.status).toBe(200);
    expect(classifyGatewayPairing(await response.json())).toEqual({
      status: 'waiting',
      hasImage: true,
      account: null,
    });
  });

  it('accepts a correctly signed delivery and reports a remote id', async () => {
    const body = JSON.stringify(payloadFor('contract-test:1'));
    const result = await post(body, signed(body));
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('accepted');
    expect(classifyGatewayAck(result)).toBe('accepted');
    expect(parseWebhookAck(result).kind).toBe('accepted');
    expect(String(result.body.id)).toMatch(/^example-/);
  });

  it('rejects a body whose signature does not match', async () => {
    const body = JSON.stringify(payloadFor('contract-test:2'));
    const result = await post(body, {
      'X-Webhook-Timestamp': String(Math.floor(Date.now() / 1000)),
      'X-Webhook-Signature': 'sha256=deadbeef',
    });
    expect(result.status).toBe(401);
    expect(parseWebhookAck(result).kind).toBe('permanent_failure');
  });

  it('rejects a signature that is valid but stale', async () => {
    const body = JSON.stringify(payloadFor('contract-test:stale'));
    const result = await post(body, signed(body, 'shared-secret', Math.floor(Date.now() / 1000) - 3600));
    expect(result.status).toBe(401);
    expect(result.body.reason).toBe('stale timestamp');
  });

  it('verifies over raw bytes: a reserialized body fails the HMAC', async () => {
    // Same JSON, different whitespace — a gateway that re-serializes before
    // hashing computes a different digest. This proves the example does not.
    const rawBody = '{"schemaVersion":1,  "idempotencyKey":"contract-test:reser"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const reserialized = JSON.stringify(JSON.parse(rawBody));
    const signature = `sha256=${createHmac('sha256', 'shared-secret')
      .update(`${timestamp}.${reserialized}`)
      .digest('hex')}`;
    const result = await post(rawBody, {
      'X-Webhook-Timestamp': String(timestamp),
      'X-Webhook-Signature': signature,
    });
    expect(result.status).toBe(401);
    expect(result.body.reason).toBe('signature mismatch');
  });

  it('answers a replayed idempotency key with a duplicate, and does not resend', async () => {
    const body = JSON.stringify(payloadFor('contract-test:replay'));
    const headers = signed(body);
    const first = await post(body, headers);
    const second = await post(body, headers);
    expect(first.body.status).toBe('accepted');
    expect(second.body.status).toBe('duplicate_existing');
    expect(second.body.id).toBe(first.body.id);
    expect(parseWebhookAck(second).kind).toBe('duplicate_existing');
  });

  it('refuses a schema version it was not written for, permanently', async () => {
    const body = JSON.stringify({ ...payloadFor('contract-test:3'), schemaVersion: 99 });
    const result = await post(body, signed(body));
    expect(result.status).toBe(400);
    // No status word, so the HTTP code decides: a version mismatch must not
    // retry forever against the same old code.
    expect(result.body.status).toBeUndefined();
    expect(String(result.body.reason)).toContain('unsupported schemaVersion');
    expect(parseWebhookAck(result).kind).toBe('permanent_failure');
  });

  it('leaves the HTTP status to decide when it has no verdict word', async () => {
    // The trap this guards: a gateway that answers 401 with
    // {"status":"rejected"} turns a retryable auth failure into a dead letter
    // that never retries after the operator fixes the token.
    const unauthorized = await post(JSON.stringify(payloadFor('contract-test:auth')), {
      'X-Webhook-Timestamp': String(Math.floor(Date.now() / 1000)),
      'X-Webhook-Signature': 'sha256=deadbeef',
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.status).toBeUndefined();
    expect(classifyGatewayAck(unauthorized)).toBe('permanent_failure');
    // And the documented consequence, asserted rather than assumed:
    expect(classifyGatewayAck({ status: 401, body: { status: 'rejected' } })).toBe('remote_failed');
  });

  it('passes its own selftest entry point', () => {
    const run = spawnSync(process.execPath, [EXAMPLE_SERVER, '--selftest'], { cwd: ROOT, encoding: 'utf8' });
    expect(run.stdout).toContain('selftest.passed');
    expect(run.status).toBe(0);
  });
});

describe('the example gateway README stays true to the contract', () => {
  it('documents the three documented endpoints', () => {
    for (const spec of Object.values(GATEWAY_ENDPOINTS)) {
      expect(EXAMPLE_README).toContain(`${spec.method} ${spec.path}`);
    }
  });

  it('states that a reachability probe is not a delivery verdict', () => {
    expect(EXAMPLE_README).toContain('绝不等于投递成功');
  });
});
