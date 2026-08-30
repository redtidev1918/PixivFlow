import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeliveryDispatcher } from '../../delivery/DeliveryDispatcher';
import { DeliveryOutbox } from '../../delivery/DeliveryOutbox';
import { HttpMultipartDelivery } from '../../delivery/HttpMultipartDelivery';

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
      new Response(JSON.stringify({ ok: true, data: { id: 1 } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    global.fetch = fetchMock as typeof fetch;

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

    expect(result).toEqual({ status: 201, body: { ok: true, data: { id: 1 } } });
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

  it('renders link / topicTag / spoiler template variables', async () => {
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
      },
      success: { statuses: [201], jsonPath: 'ok', equals: true },
      maxAttempts: 1,
      retryDelayMs: 0,
    });

    // illustration + R-18 -> artworks link + spoiler true
    await provider.deliver({
      files: [filePath],
      context: {
        title: 'T', pixivId: '456', type: 'illustration',
        topic: 'ボテ腹', workTags: ['ボテ腹'], spoiler: true,
      },
    });
    let [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    let chunks: Buffer[] = [];
    for await (const chunk of options.body as unknown as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    let multipart = Buffer.concat(chunks).toString('utf8');
    expect(multipart).toContain('name="link"\r\n\r\nhttps://www.pixiv.net/artworks/456');
    expect(multipart).toContain('name="topicTag"\r\n\r\nボテ腹');
    expect(multipart).toContain('name="spoiler"\r\n\r\ntrue');

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
    ).resolves.toMatchObject({ status: 204 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('DeliveryOutbox', () => {
  let directory: string;
  let outboxDirectory: string;
  let filePath: string;
  let metadataPath: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'pixivflow-delivery-outbox-'));
    outboxDirectory = join(directory, 'outbox');
    filePath = join(directory, 'work.jpg');
    metadataPath = join(directory, 'work.json');
    await fs.writeFile(filePath, 'image');
    await fs.writeFile(metadataPath, '{}');
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('deletes cache files only after successful delivery', async () => {
    const deliver = jest.fn().mockResolvedValue({ status: 201 });
    const dispatcher = {
      hasTarget: jest.fn().mockReturnValue(true),
      deliver,
    } as unknown as DeliveryDispatcher;
    const outbox = new DeliveryOutbox(
      outboxDirectory,
      dispatcher,
      true,
      { retryBaseDelayMs: 0, retryMaxDelayMs: 0 }
    );

    await outbox.deliver(
      {
        pixivId: '123',
        type: 'illustration',
        title: 'Work',
        files: [filePath],
        cleanupFiles: [metadataPath],
      },
      {
        type: 'illustration',
        tag: 'source',
        storageMode: 'cache',
        delivery: { target: 'share', fields: { category: ['one', 'two'] } },
      }
    );

    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(metadataPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readdir(outboxDirectory)).toEqual([]);
    expect(deliver).toHaveBeenCalledWith(
      'share',
      expect.objectContaining({
        files: [filePath],
        fields: { category: ['one', 'two'] },
        context: expect.objectContaining({ title: 'Work', tag: 'source' }),
      })
    );
  });

  it('uses the semantic topic as the delivery tag and retains concrete work tags', async () => {
    const deliver = jest.fn().mockResolvedValue({ status: 201 });
    const dispatcher = {
      hasTarget: jest.fn().mockReturnValue(true),
      deliver,
    } as unknown as DeliveryDispatcher;
    const outbox = new DeliveryOutbox(outboxDirectory, dispatcher, false);

    await outbox.deliver(
      {
        pixivId: 'topic-123',
        type: 'illustration',
        title: 'Topic work',
        tags: ['ボテ腹', '腹部膨満'],
        files: [filePath],
      },
      {
        id: 'bot1-topic-illust',
        type: 'illustration',
        mode: 'topic',
        topic: 'ボテ腹',
        storageMode: 'cache',
        delivery: { target: 'share' },
      }
    );

    expect(deliver).toHaveBeenCalledWith(
      'share',
      expect.objectContaining({
        context: expect.objectContaining({
          tag: 'ボテ腹',
          topic: 'ボテ腹',
          workTags: ['ボテ腹', '腹部膨満'],
        }),
      })
    );
  });

  it('retains failed files and retries the durable manifest later', async () => {
    const deliver = jest
      .fn()
      .mockRejectedValueOnce(new Error('service unavailable'))
      .mockResolvedValueOnce({ status: 200 });
    const dispatcher = {
      hasTarget: jest.fn().mockReturnValue(true),
      deliver,
    } as unknown as DeliveryDispatcher;
    const outbox = new DeliveryOutbox(
      outboxDirectory,
      dispatcher,
      true,
      { retryBaseDelayMs: 0, retryMaxDelayMs: 0 }
    );

    await expect(
      outbox.deliver(
        {
          pixivId: '456',
          type: 'illustration',
          title: 'Retry me',
          files: [filePath],
          cleanupFiles: [metadataPath],
        },
        { type: 'illustration', storageMode: 'cache', delivery: { target: 'share' } }
      )
    ).rejects.toMatchObject({ code: 'PENDING_DELIVERY' });
    await expect(fs.access(filePath)).resolves.toBeUndefined();
    expect((await fs.readdir(outboxDirectory)).filter((name) => name.endsWith('.json'))).toHaveLength(1);

    await expect(outbox.retryPending()).resolves.toEqual({
      succeeded: 1,
      failed: 0,
      deferred: 0,
    });
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(metadataPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readdir(outboxDirectory)).toEqual([]);
  });

  it('backs off durable retries to avoid repeated bandwidth usage', async () => {
    let now = Date.parse('2026-08-29T00:00:00.000Z');
    const deliver = jest
      .fn()
      .mockRejectedValueOnce(new Error('service unavailable'))
      .mockResolvedValueOnce({ status: 200 });
    const dispatcher = {
      hasTarget: jest.fn().mockReturnValue(true),
      deliver,
    } as unknown as DeliveryDispatcher;
    const outbox = new DeliveryOutbox(
      outboxDirectory,
      dispatcher,
      true,
      {
        retryBaseDelayMs: 60_000,
        retryMaxDelayMs: 3_600_000,
        now: () => now,
      }
    );

    await expect(
      outbox.deliver(
        {
          pixivId: 'backoff',
          type: 'illustration',
          title: 'Retry later',
          files: [filePath],
          cleanupFiles: [metadataPath],
        },
        { type: 'illustration', storageMode: 'cache', delivery: { target: 'share' } }
      )
    ).rejects.toMatchObject({ code: 'PENDING_DELIVERY' });

    await expect(outbox.retryPending()).resolves.toEqual({
      succeeded: 0,
      failed: 0,
      deferred: 1,
    });
    expect(deliver).toHaveBeenCalledTimes(1);

    now += 60_000;
    await expect(outbox.retryPending()).resolves.toEqual({
      succeeded: 1,
      failed: 0,
      deferred: 0,
    });
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it('does nothing for persistent targets', async () => {
    const dispatcher = {
      hasTarget: jest.fn(),
      deliver: jest.fn(),
    } as unknown as DeliveryDispatcher;
    const outbox = new DeliveryOutbox(outboxDirectory, dispatcher);

    await outbox.deliver(
      { pixivId: '789', type: 'illustration', title: 'Keep me', files: [filePath] },
      { type: 'illustration', storageMode: 'persistent' }
    );
    expect(dispatcher.deliver).not.toHaveBeenCalled();
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });
});
