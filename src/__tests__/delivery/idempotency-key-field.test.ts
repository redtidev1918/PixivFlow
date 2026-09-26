/**
 * Every submission must carry `idempotency_key`.
 *
 * The receiver dedupes retries by that key: without it, an ACK-loss retry (the
 * outbox re-running the same intent) arrives as a brand-new submission and the
 * work is published twice. Hand-written configs omit the field, so the provider
 * adds it — and these tests pin that it is added exactly once, never overriding
 * or duplicating what the config already declares.
 */
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpMultipartDelivery } from '../../delivery/HttpMultipartDelivery';
import { logger } from '../../logger';
import type { HttpMultipartDeliveryConfig } from '../../config';

const CONTEXT_KEY = 'pixivflow:bot1:illustration:123:slot-1:target-a';

async function sentMultipart(fetchMock: jest.Mock, callIndex = 0): Promise<string> {
  const [, options] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
  const chunks: Buffer[] = [];
  for await (const chunk of options.body as unknown as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('HttpMultipartDelivery idempotency_key field', () => {
  let directory: string;
  let filePath: string;
  const originalFetch = global.fetch;

  const response = (): Response =>
    new Response(
      JSON.stringify({ ok: true, data: { status: 'pending_review', review_id: 7 } }),
      { status: 201, headers: { 'content-type': 'application/json' } }
    );

  const request = () => ({
    files: [filePath],
    context: {
      title: 'T',
      pixivId: '123',
      type: 'illustration' as const,
      tag: 'source',
      topic: 'ボテ腹',
      workTags: ['ボテ腹'],
      idempotencyKey: CONTEXT_KEY,
    },
  });

  const providerWith = (config: Partial<HttpMultipartDeliveryConfig>): HttpMultipartDelivery =>
    new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submissions',
      maxAttempts: 1,
      retryDelayMs: 0,
      ...config,
    } as HttpMultipartDeliveryConfig);

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'pixivflow-idempotency-'));
    filePath = join(directory, 'cover.jpg');
    await fs.writeFile(filePath, 'image');
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await fs.rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('adds the field when the config forgot it, and says so once', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(response()));
    global.fetch = fetchMock as typeof fetch;
    const log = jest.spyOn(logger, 'info');

    const provider = providerWith({ fields: { tags: '{{workTags}}' } });
    await provider.deliver(request());

    const multipart = await sentMultipart(fetchMock);
    expect(multipart).toContain('name="tags"\r\n\r\nボテ腹');
    expect(multipart).toContain(`name="idempotency_key"\r\n\r\n${CONTEXT_KEY}`);

    const notes = log.mock.calls.filter(([message]) =>
      String(message).includes('idempotency_key not configured')
    );
    expect(notes).toHaveLength(1);
  });

  it('logs the auto-fill once per provider, not once per attempt', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(response()));
    global.fetch = fetchMock as typeof fetch;
    const log = jest.spyOn(logger, 'info');

    const provider = providerWith({ fields: { tags: '{{workTags}}' } });
    await provider.deliver(request());
    await provider.deliver(request());

    const notes = log.mock.calls.filter(([message]) =>
      String(message).includes('idempotency_key not configured')
    );
    expect(notes).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never overrides a declared field, and never sends it twice', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(response()));
    global.fetch = fetchMock as typeof fetch;

    const provider = providerWith({
      fields: { idempotency_key: 'fixed-{{pixivId}}', tags: '{{workTags}}' },
    });
    await provider.deliver(request());

    const multipart = await sentMultipart(fetchMock);
    expect(multipart).toContain('name="idempotency_key"\r\n\r\nfixed-123');
    expect(multipart).not.toContain(CONTEXT_KEY);
    expect(countOccurrences(multipart, 'name="idempotency_key"')).toBe(1);
  });

  it('treats the camelCase spelling as a declared field', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(response()));
    global.fetch = fetchMock as typeof fetch;

    const provider = providerWith({ fields: { idempotencyKey: '{{idempotencyKey}}' } });
    await provider.deliver(request());

    const multipart = await sentMultipart(fetchMock);
    expect(multipart).toContain(`name="idempotencyKey"\r\n\r\n${CONTEXT_KEY}`);
    expect(multipart).not.toContain('name="idempotency_key"');
  });

  it('can be switched off for a receiver that rejects unknown fields', async () => {
    const fetchMock = jest.fn().mockImplementation(() => Promise.resolve(response()));
    global.fetch = fetchMock as typeof fetch;

    const provider = providerWith({
      fields: { tags: '{{workTags}}' },
      autoIdempotencyKey: false,
    });
    await provider.deliver(request());

    const multipart = await sentMultipart(fetchMock);
    expect(multipart).not.toContain('idempotency_key');
  });
});
