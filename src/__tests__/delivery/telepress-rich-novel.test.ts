import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import type { DownloadedArtifact } from '../../delivery/types';
import {
  findRichNovelSources,
  publishRichNovelPreview,
  interpolateEnv,
} from '../../delivery/TelePressRichNovel';

describe('TelePress rich-novel preview', () => {
  let dir: string;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'pixivflow-telepress-'));
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await fs.rm(dir, { recursive: true, force: true });
  });

  function artifact(files: string[], cleanupFiles: string[] = []): DownloadedArtifact {
    return {
      pixivId: '123456',
      type: 'novel',
      title: '测试小说',
      files,
      ...(cleanupFiles.length ? { cleanupFiles } : {}),
    };
  }

  it('locates md + ordered images next to the txt artifact', async () => {
    const txt = join(dir, '1_测试.txt');
    const md = txt.replace(/\.txt$/i, '.md');
    const imagesDir = join(dir, 'images');
    await fs.writeFile(txt, 'body');
    await fs.writeFile(md, '![a](images/10.jpg)\n\n![b](images/2.jpg)');
    await fs.mkdir(imagesDir);
    await fs.writeFile(join(imagesDir, '10.jpg'), 'a');
    await fs.writeFile(join(imagesDir, '2.jpg'), 'b');
    await fs.writeFile(join(imagesDir, 'note.txt'), 'not an image');

    const found = findRichNovelSources(artifact([txt]));
    expect(found).toBeDefined();
    expect(found!.mdPath).toBe(md);
    expect(found!.imagePaths).toHaveLength(2);
    // Natural numeric order: 2 before 10.
    expect(found!.imagePaths.map((p) => basename(p))).toEqual(['2.jpg', '10.jpg']);
  });

  it('returns undefined for pure-text novels', async () => {
    const txt = join(dir, 'plain.txt');
    await fs.writeFile(txt, 'body');
    expect(findRichNovelSources(artifact([txt]))).toBeUndefined();
  });

  it('includes a manifest mapping local images to Pixiv sources', async () => {
    const txt = join(dir, 'n.txt');
    const md = txt.replace(/\.txt$/i, '.md');
    const imagesDir = join(dir, 'images');
    await fs.writeFile(txt, 'body');
    await fs.writeFile(md, '![a](images/a.jpg)');
    await fs.mkdir(imagesDir);
    await fs.writeFile(join(imagesDir, 'a.jpg'), 'img');

    const metaFile = join(dir, 'metadata', '123456_novel.json');
    await fs.mkdir(join(dir, 'metadata'), { recursive: true });
    await fs.writeFile(metaFile, JSON.stringify({
      type: 'novel',
      assets: [{
        marker: 'x', kind: 'pixivimage', sourceId: 's', status: 'downloaded',
        url: 'https://i.pximg.net/img-master/img/1_p0.jpg',
        localPath: join(imagesDir, 'a.jpg'),
      }],
    }));

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'success', url: 'https://telegra.ph/test-123',
        assets: [{ local: 'images/a.jpg', remote: 'https://media.example.com/pixiv/...', status: 'proxied' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const found = findRichNovelSources(artifact([txt], [metaFile]));
    expect(found!.manifest).toEqual([
      {
        local: 'images/a.jpg',
        source: 'https://i.pximg.net/img-master/img/1_p0.jpg',
        assetId: 'pixiv:123456:pixivimage:s',
        sourceUrl: 'https://i.pximg.net/img-master/img/1_p0.jpg',
      },
    ]);
    expect(found!.mediaAssets).toHaveLength(1);
    expect(found!.mediaAssets![0]).toMatchObject({
      id: 'pixiv:123456:pixivimage:s',
      source: 'pixiv',
      kind: 'image',
      sourceUrl: 'https://i.pximg.net/img-master/img/1_p0.jpg',
      artifactId: join(imagesDir, 'a.jpg'),
    });

    global.fetch = fetchMock as typeof fetch;

    const result = await publishRichNovelPreview(
      artifact([txt], [metaFile]),
      { url: 'https://telepress.example/publish/rich-novel' }
    );
    expect(result).toEqual({ url: 'https://telegra.ph/test-123', retryable: false });

    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toContain('Content-Disposition: form-data; name="manifest"');
    expect(body).toContain('https://i.pximg.net/img-master/img/1_p0.jpg');
    expect(body).toContain('"local":"images/a.jpg"');
  });

  it('posts md + images and returns the Telegraph url', async () => {
    const txt = join(dir, 'n.txt');
    const md = txt.replace(/\.txt$/i, '.md');
    const imagesDir = join(dir, 'images');
    await fs.writeFile(txt, 'body');
    await fs.writeFile(md, '![a](images/a.jpg)');
    await fs.mkdir(imagesDir);
    await fs.writeFile(join(imagesDir, 'a.jpg'), 'img');

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'success',
        url: 'https://telegra.ph/test-123',
        assets: [{ local: 'images/a.jpg', remote: 'https://files.catbox.moe/x.jpg', status: 'uploaded' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    global.fetch = fetchMock as typeof fetch;

    const result = await publishRichNovelPreview(
      artifact([txt]),
      { url: 'https://telepress.example/publish/rich-novel' }
    );
    expect(result).toEqual({ url: 'https://telegra.ph/test-123', retryable: false });

    const req = fetchMock.mock.calls[0];
    const body = String(req[1]?.body);
    expect(body).toContain('name="md"');
    expect(body).toContain('filename="images/a.jpg"');
  });

  it('is retryable on HTTP 5xx and non-retryable on local absence', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('boom', { status: 503 }));
    global.fetch = fetchMock as typeof fetch;
    const txt = join(dir, 'n.txt');
    const md = txt.replace(/\.txt$/i, '.md');
    const imagesDir = join(dir, 'images');
    await fs.writeFile(txt, 'body');
    await fs.writeFile(md, '![a](images/a.jpg)');
    await fs.mkdir(imagesDir);
    await fs.writeFile(join(imagesDir, 'a.jpg'), 'img');

    const result = await publishRichNovelPreview(
      artifact([txt]),
      { url: 'https://telepress.example/publish/rich-novel' }
    );
    expect(result.retryable).toBe(true);
    expect(result.url).toBe('');

    const plain = join(dir, 'plain.txt');
    await fs.writeFile(plain, 'body');
    const skipped = await publishRichNovelPreview(artifact([plain]), { url: 'https://x' });
    expect(skipped.retryable).toBe(false);
    expect(skipped.operatorHint).toBe('no_rich_novel_assets');
  });

  it('interpolates ${ENV} in urls and headers', () => {
    process.env.TELEPRESS_TEST_URL = 'https://telepress.example/x';
    process.env.TELEPRESS_TEST_KEY = 'k';
    try {
      expect(interpolateEnv('${TELEPRESS_TEST_URL}')).toBe('https://telepress.example/x');
      expect(interpolateEnv('${TELEPRESS_TEST_KEY}')).toBe('k');
    } finally {
      delete process.env.TELEPRESS_TEST_URL;
      delete process.env.TELEPRESS_TEST_KEY;
    }
  });
});
