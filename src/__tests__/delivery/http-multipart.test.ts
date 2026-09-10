import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpMultipartDelivery } from '../../delivery/HttpMultipartDelivery';
import { logger } from '../../logger';

describe('HttpMultipartDelivery', () => {
  let directory: string;
  const originalFetch = global.fetch;
  const originalToken = process.env.TEST_DELIVERY_TOKEN;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'pixivflow-http-delivery-'));
    process.env.TEST_DELIVERY_TOKEN = 'secret';
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TEST_DELIVERY_TOKEN;
    else process.env.TEST_DELIVERY_TOKEN = originalToken;
    await fs.rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('streams files with configurable headers, fields, templates and success rules', async () => {
    const filePath = join(directory, 'cover.jpg');
    await fs.writeFile(filePath, 'image');
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: true,
        data: { id: 1, status: 'pending_review', review_id: 42, reused: true },
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchMock as typeof fetch;
    const log = jest.spyOn(logger, 'info');

    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submissions',
      headers: { Authorization: 'Bearer ${TEST_DELIVERY_TOKEN}' },
      fileField: 'assets',
      fields: {
        title: '{{title}}',
        topic: '{{topic}}',
        work_tags: '{{workTags}}',
        tags: ['default'],
      },
      success: { statuses: [201], jsonPath: 'ok', equals: true },
      maxAttempts: 1,
      retryDelayMs: 0,
    });
    const result = await provider.deliver({
      files: [filePath],
      fields: { tags: ['announcement', 'update'], anonymous: false },
      context: {
        title: 'Work title',
        pixivId: '123',
        type: 'illustration',
        tag: 'source',
        topic: 'ボテ腹',
        workTags: ['ボテ腹', '腹部膨満'],
      },
    });

    expect(result).toMatchObject({
      status: 201,
      ack: { kind: 'idempotent_replay', remoteId: '42', remoteStatus: 'pending_review' },
      body: {
        ok: true,
        data: { id: 1, status: 'pending_review', review_id: 42, reused: true },
      },
    });
    expect(log).toHaveBeenCalledWith('HTTP multipart delivery response', expect.objectContaining({
      deliveryStatus: 'pending_review',
      reviewId: 42,
      reused: true,
    }));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/submissions');
    expect(options.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer secret' }));
    const chunks: Buffer[] = [];
    for await (const chunk of options.body as unknown as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    const multipart = Buffer.concat(chunks).toString('utf8');
    expect(multipart).toContain('name="assets"; filename="cover.jpg"');
    expect(multipart).toContain('name="title"\r\n\r\nWork title');
    expect(multipart).toContain('name="topic"\r\n\r\nボテ腹');
    expect(multipart).toContain('name="work_tags"\r\n\r\nボテ腹,腹部膨満');
    expect(multipart).toContain('name="tags"\r\n\r\nannouncement,update');
    expect(multipart).toContain('name="anonymous"\r\n\r\nfalse');
  });

  it('sends aligned previews in their own multipart field', async () => {
    const original = join(directory, 'original.png');
    const preview = join(directory, 'preview.jpg');
    await Promise.all([fs.writeFile(original, 'original'), fs.writeFile(preview, 'preview')]);
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchMock as typeof fetch;
    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart', url: 'https://example.test/submissions',
      fileField: 'files', previewFileField: 'previews',
    });

    await provider.deliver({
      files: [original], previewFiles: [preview],
      context: { title: 'T', pixivId: '1', type: 'illustration' },
    });

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const chunks: Buffer[] = [];
    for await (const chunk of options.body as unknown as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    const multipart = Buffer.concat(chunks).toString('utf8');
    expect(multipart).toContain('name="files"; filename="original.png"');
    expect(multipart).toContain('name="previews"; filename="preview.jpg"');
  });

  it('checks readiness independently of liveness', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response('live', { status: 200 }))
      .mockResolvedValueOnce(new Response('starting', { status: 503 }))
      .mockResolvedValueOnce(new Response('ready', { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart', url: 'https://example.test/submissions',
      readinessUrl: 'https://example.test/ready',
    });

    expect((await fetch('https://example.test/live')).status).toBe(200);
    expect(await provider.isReady()).toBe(false);
    expect(await provider.isReady()).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.test/ready');
  });

  it('sends authenticated JSON no-match notifications', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { status: 'notified' } }), { status: 201 })
    );
    global.fetch = fetchMock as typeof fetch;
    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submissions',
      notificationUrl: 'https://example.test/notifications',
      headers: { Authorization: 'Bearer ${TEST_DELIVERY_TOKEN}' },
      success: { statuses: [201], jsonPath: 'ok', equals: true },
      maxAttempts: 1,
    });

    await provider.notifyOnce({ text: 'no matching work', idempotencyKey: 'empty:2023-06-14' });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/notifications');
    expect(options.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
    }));
    expect(JSON.parse(String(options.body))).toEqual({
      text: 'no matching work',
      idempotency_key: 'empty:2023-06-14',
    });
  });

  it('does not log notification URL credentials or query secrets', async () => {
    // One attempt (retries live in the durable outbox, not the HTTP adapter).
    const fetchMock = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submissions',
      notificationUrl: 'https://notify:webhook-secret@example.test/notify/key?:text=body&token=query-secret',
    });

    await provider.notifyOnce({ text: 'no matching work', idempotencyKey: 'empty:2023-06-14' });

    const loggedUrls = info.mock.calls
      .flatMap((call) => call.slice(1))
      .map((entry) => (entry as { url?: string }).url)
      .filter((url): url is string => Boolean(url));
    expect(loggedUrls).not.toHaveLength(0);
    for (const url of loggedUrls) {
      expect(url).not.toContain('webhook-secret');
      expect(url).not.toContain('query-secret');
      expect(url).not.toContain(':text=body');
      expect(url).toContain('redacted@');
      expect(url).toContain('?…');
    }
  });

  it('renders link / topicTag / spoiler / x_restrict template variables', async () => {
    const filePath = join(directory, 'cover.jpg');
    await fs.writeFile(filePath, 'image');
    const fetchMock = jest.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    global.fetch = fetchMock as typeof fetch;

    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submissions',
      fileField: 'files',
      fields: {
        link: '{{link}}',
        topicTag: '{{topicTag}}',
        spoiler: '{{spoiler}}',
        x_restrict: '{{xRestrict}}',
        rating: '{{xRestrictLabel}}',
        rating_tag: '{{xRestrictTag}}',
      },
      success: { statuses: [201], jsonPath: 'ok', equals: true },
      maxAttempts: 1,
      retryDelayMs: 0,
    });

    // Exact R-18G level remains available even when channel policy disables masking.
    await provider.deliver({
      files: [filePath],
      context: {
        title: 'T', pixivId: '456', type: 'illustration',
        topic: 'ボテ腹', workTags: ['ボテ腹'], spoiler: false, xRestrict: 2,
      },
    });
    let [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    let chunks: Buffer[] = [];
    for await (const chunk of options.body as unknown as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    let multipart = Buffer.concat(chunks).toString('utf8');
    expect(multipart).toContain('name="link"\r\n\r\nhttps://www.pixiv.net/artworks/456');
    expect(multipart).toContain('name="topicTag"\r\n\r\nボテ腹');
    expect(multipart).toContain('name="spoiler"\r\n\r\nfalse');
    expect(multipart).toContain('name="x_restrict"\r\n\r\n2');
    expect(multipart).toContain('name="rating"\r\n\r\nR-18G');
    expect(multipart).toContain('name="rating_tag"\r\n\r\nR18G');

    // novel + non-R18 -> novel permalink + spoiler false; tag fallback for topicTag
    fetchMock.mockClear();
    await provider.deliver({
      files: [filePath],
      context: {
        title: 'N', pixivId: '789', type: 'novel',
        tag: 'fallback', spoiler: false,
      },
    });
    [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    chunks = [];
    for await (const chunk of options.body as unknown as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    multipart = Buffer.concat(chunks).toString('utf8');
    expect(multipart).toContain('name="link"\r\n\r\nhttps://www.pixiv.net/novel/show.php?id=789');
    expect(multipart).toContain('name="topicTag"\r\n\r\nfallback');
    expect(multipart).toContain('name="spoiler"\r\n\r\nfalse');
  });

  it('renders rankingDate / publishedDate / language template variables', async () => {
    const filePath = join(directory, 'novel.txt');
    await fs.writeFile(filePath, 'body');
    const fetchMock = jest.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    global.fetch = fetchMock as typeof fetch;

    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submissions',
      fileField: 'files',
      fields: {
        note: '📅 {{rankingDate}} 🕒 {{publishedDate}} 🌐 {{language}}',
      },
      success: { statuses: [201], jsonPath: 'ok', equals: true },
      maxAttempts: 1,
      retryDelayMs: 0,
    });

    await provider.deliver({
      files: [filePath],
      context: {
        title: 'N', pixivId: '789', type: 'novel',
        rankingDate: '2026-08-29',
        publishedAt: '2026-08-28T21:15:00+09:00',
        language: 'Chinese (Mandarin) (cmn)',
      },
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const chunks: Buffer[] = [];
    for await (const chunk of options.body as unknown as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    const multipart = Buffer.concat(chunks).toString('utf8');
    expect(multipart).toContain(
      'name="note"\r\n\r\n📅 2026-08-29 🕒 2026-08-28 🌐 Chinese (Mandarin) (cmn)'
    );
  });

  it('renders bookmark/view popularity counts (compact, empty when absent)', async () => {
    const filePath = join(directory, 'pop.txt');
    await fs.writeFile(filePath, 'body');
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchMock as typeof fetch;

    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/submissions',
      fileField: 'files',
      fields: {
        note: '⭐ {{bookmarkCount}} 👁 {{viewCount}}',
      },
      success: { statuses: [201], jsonPath: 'ok', equals: true },
      maxAttempts: 1,
      retryDelayMs: 0,
    });

    await provider.deliver({
      files: [filePath],
      context: {
        title: 'P', pixivId: '1', type: 'illustration',
        bookmarkCount: 12340, viewCount: 345678,
      },
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const chunks: Buffer[] = [];
    for await (const chunk of options.body as unknown as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    const multipart = Buffer.concat(chunks).toString('utf8');
    // 12340 -> 1.2w, 345678 -> 34.6w
    expect(multipart).toContain('name="note"\r\n\r\n⭐ 1.2w 👁 34.6w');
  });

  it('retries failed delivery attempts', async () => {
    const filePath = join(directory, 'work.txt');
    await fs.writeFile(filePath, 'text');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    global.fetch = fetchMock as typeof fetch;
    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://example.test/deliver',
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    await expect(
      provider.deliver({
        files: [filePath],
        context: { title: 'Work', pixivId: '1', type: 'novel' },
      })
    ).resolves.toMatchObject({ status: 503, ack: { kind: 'retryable_failure' } });
    // Exactly one HTTP attempt; the durable outbox owns the retry budget.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
