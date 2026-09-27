import { NovelDownloader } from '../../download/NovelDownloader';
import { deliveryFilePaths } from '../../delivery/types';
import { TargetConfig } from '../../config';
import { IPixivClient } from '../../interfaces/IPixivClient';
import { IDatabase } from '../../interfaces/IDatabase';
import { IFileService } from '../../interfaces/IFileService';
import { PixivNovel } from '@redtidev/pixiv-client';
import type { NovelCoverPolicy } from '../../domain/media/NovelCoverPolicy';

jest.mock('../../utils/directory-info', () => ({
  displayDownloadPath: jest.fn(),
}));

jest.mock('../../utils/zip', () => ({
  createZipArchive: jest.fn(async (dest: string) => dest),
}));

import { createZipArchive } from '../../utils/zip';

const createZipArchiveMock = createZipArchive as jest.MockedFunction<typeof createZipArchive>;

describe('NovelDownloader', () => {
  const novel = {
    id: 123,
    title: 'Test novel',
    user: { id: '42', name: 'Author' },
    create_date: '2026-08-29T00:00:00+00:00',
    total_bookmarks: 10,
    total_view: 100,
    x_restrict: 1,
  } as PixivNovel;

  function createDownloader(text: string) {
    const client = {
      getNovelDetailWithTags: jest.fn().mockResolvedValue({
        novel,
        tags: [{ name: 'ボテ腹' }, { name: 'R-18' }],
      }),
      getNovelText: jest.fn().mockResolvedValue({ novel_text: text }),
    } as unknown as jest.Mocked<IPixivClient>;
    const database = {
      insertDownload: jest.fn(),
    } as unknown as jest.Mocked<IDatabase>;
    const fileService = {
      sanitizeFileName: jest.fn((name: string) => name),
      saveText: jest.fn().mockResolvedValue('/tmp/123_Test novel.txt'),
      saveMetadata: jest.fn().mockResolvedValue('/tmp/123_Test novel.txt.json'),
    } as unknown as jest.Mocked<IFileService>;
    return {
      downloader: new NovelDownloader(client, database, fileService),
      client,
      database,
      fileService,
    };
  }

  it('unwraps novel_text and writes the actual novel body', async () => {
    const { downloader, fileService, database } = createDownloader('Actual novel body');

    const artifact = await downloader.download(
      novel,
      'ボテ腹',
      { type: 'novel', detectLanguage: false } as TargetConfig
    );

    const written = fileService.saveText.mock.calls[0][0];
    expect(written).toContain('Actual novel body');
    expect(written).not.toContain('[object Object]');
    expect(database.insertDownload).toHaveBeenCalledTimes(1);
    expect(createZipArchiveMock).not.toHaveBeenCalled();
    expect(artifact).toMatchObject({
      pixivId: '123',
      type: 'novel',
      spoiler: true,
      tags: ['ボテ腹', 'R-18'],
      // Attribution travels with the artifact, not only the downloads table.
      author: 'Author',
    });
    expect(artifact!.mediaAssets).toEqual([]);
    expect(artifact!.artifacts).toEqual([
      { id: 'pixiv:123:text:123_Test novel.txt', workId: '123', variant: 'text', path: '/tmp/123_Test novel.txt' },
      { id: 'pixiv:123:metadata:123_Test novel.txt.json', workId: '123', variant: 'metadata', path: '/tmp/123_Test novel.txt.json' },
    ]);
  });

  it('does not persist or deliver an empty-body novel', async () => {
    const { downloader, fileService, database } = createDownloader('   ');

    const artifact = await downloader.download(
      novel,
      'ボテ腹',
      { type: 'novel', detectLanguage: false } as TargetConfig
    );

    expect(artifact).toBeUndefined();
    expect(fileService.saveText).not.toHaveBeenCalled();
    expect(database.insertDownload).not.toHaveBeenCalled();
  });

  it('strict language filtering skips text that is too short to classify', async () => {
    const { downloader, fileService, database } = createDownloader('短文');

    await expect(downloader.download(
      novel,
      'ボテ腹',
      {
        type: 'novel',
        languageFilter: 'chinese',
        strictLanguageFilter: true,
      } as TargetConfig
    )).rejects.toThrow('language filter inconclusive');

    expect(fileService.saveText).not.toHaveBeenCalled();
    expect(database.insertDownload).not.toHaveBeenCalled();
  });
});

describe('NovelDownloader rich media', () => {
  beforeEach(() => {
    createZipArchiveMock.mockClear();
  });

  const novel = {
    id: 456,
    title: 'Rich novel',
    user: { id: '42', name: 'Author' },
    create_date: '2026-08-29T00:00:00+00:00',
  } as PixivNovel;

  it('downloads inline images and records assets in metadata', async () => {
    const text = 'intro [uploadedimage:11] outro';
    const client = {
      getNovelDetailWithTags: jest.fn().mockResolvedValue({ novel, tags: [] }),
      getNovelText: jest.fn().mockResolvedValue({
        novel_text: text,
        images: { '11': { urls: { original: 'https://i.pximg.net/img/original/u/11.jpg' } } },
      }),
      downloadImage: jest.fn().mockResolvedValue(new ArrayBuffer(4)),
    } as unknown as jest.Mocked<IPixivClient>;
    const database = { insertDownload: jest.fn() } as unknown as jest.Mocked<IDatabase>;
    const fileService = {
      sanitizeFileName: jest.fn((name: string) => name),
      saveText: jest.fn().mockResolvedValue('/tmp/novels/456_Rich novel.txt'),
      saveMetadata: jest.fn().mockResolvedValue('/tmp/456_Rich novel.txt.json'),
      saveBinary: jest.fn().mockResolvedValue('/tmp/novels/images/11.jpg'),
    } as unknown as jest.Mocked<IFileService>;
    const downloader = new NovelDownloader(client, database, fileService);

    const artifact = await downloader.download(novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig);

    expect(client.downloadImage).toHaveBeenCalledWith('https://i.pximg.net/img/original/u/11.jpg');
    expect(fileService.saveBinary).toHaveBeenCalledWith(
      expect.anything(),
      '11.jpg',
      '/tmp/novels/images'
    );
    const metadata = fileService.saveMetadata.mock.calls[0][1];
    const mdCall = fileService.saveText.mock.calls.find(([, name]) => String(name).endsWith('.md'));
    expect(mdCall![1]).toBe('456_Rich novel.md');
    expect(mdCall![0]).toContain('![](images/11.jpg)');
    expect(mdCall![0]).toContain('intro');

    // Phase 3: zip archive bundles txt + md + metadata + images and is shipped.
    expect(createZipArchiveMock).toHaveBeenCalledTimes(1);
    const [zipDest, zipEntries] = createZipArchiveMock.mock.calls[0];
    expect(zipDest).toBe('/tmp/novels/456_Rich novel.zip');
    const entryNames = zipEntries.map((e: { name: string }) => e.name);
    expect(entryNames).toEqual([
      '456_Rich novel.txt',
      '456_Rich novel.md',
      '456_Rich novel.txt.json',
      'images/11.jpg',
    ]);
    expect(deliveryFilePaths(artifact!)).toEqual([
      '/tmp/novels/456_Rich novel.txt',
      '/tmp/novels/456_Rich novel.zip',
    ]);

    expect(artifact!.mediaAssets).toHaveLength(1);
    expect(artifact!.mediaAssets![0]).toMatchObject({
      id: 'pixiv:456:uploadedimage:11',
      source: 'pixiv',
      kind: 'image',
      sourceUrl: 'https://i.pximg.net/img/original/u/11.jpg',
    });
    expect(artifact!.artifacts).toEqual([
      { id: 'pixiv:456:text:456_Rich novel.txt', workId: '456', variant: 'text', path: '/tmp/novels/456_Rich novel.txt' },
      { id: 'pixiv:456:markdown:456_Rich novel.txt', workId: '456', variant: 'markdown', path: '/tmp/novels/456_Rich novel.txt' },
      { id: 'pixiv:456:metadata:456_Rich novel.txt.json', workId: '456', variant: 'metadata', path: '/tmp/456_Rich novel.txt.json' },
      { id: 'pixiv:456:zip:456_Rich novel.zip', workId: '456', variant: 'zip', path: '/tmp/novels/456_Rich novel.zip' },
      { id: 'pixiv:456:original:11.jpg', workId: '456', variant: 'original', path: '/tmp/novels/images/11.jpg', sourceAssetId: 'pixiv:456:uploadedimage:11' },
    ]);

    expect(metadata.assets).toEqual([
      {
        marker: '[uploadedimage:11]',
        kind: 'uploadedimage',
        sourceId: '11',
        url: 'https://i.pximg.net/img/original/u/11.jpg',
        localPath: '/tmp/novels/images/11.jpg',
        status: 'downloaded',
      },
    ]);
    expect(artifact).toBeDefined();
  });

  it('on-demand policy keeps media references without materializing files', async () => {
    const text = 'intro [uploadedimage:11] outro';
    const client = {
      getNovelDetailWithTags: jest.fn().mockResolvedValue({ novel, tags: [] }),
      getNovelText: jest.fn().mockResolvedValue({
        novel_text: text,
        images: { '11': { urls: { original: 'https://i.pximg.net/11.jpg' } } },
      }),
      downloadImage: jest.fn().mockResolvedValue(new ArrayBuffer(4)),
    } as unknown as jest.Mocked<IPixivClient>;
    const database = { insertDownload: jest.fn() } as unknown as jest.Mocked<IDatabase>;
    const fileService = {
      sanitizeFileName: jest.fn((name: string) => name),
      saveText: jest.fn().mockResolvedValue('/tmp/novels/456_Rich novel.txt'),
      saveMetadata: jest.fn().mockResolvedValue('/tmp/456_Rich novel.txt.json'),
      saveBinary: jest.fn().mockResolvedValue('/tmp/novels/images/11.jpg'),
    } as unknown as jest.Mocked<IFileService>;
    const downloader = new NovelDownloader(client, database, fileService, undefined, undefined, { mode: 'on-demand' });

    const artifact = await downloader.download(novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig);

    expect(client.downloadImage).not.toHaveBeenCalled();
    expect(fileService.saveBinary).not.toHaveBeenCalled();
    expect(createZipArchiveMock).not.toHaveBeenCalled();
    expect(deliveryFilePaths(artifact!)).toEqual(['/tmp/novels/456_Rich novel.txt']);
    expect(artifact!.mediaAssets).toHaveLength(1);
    expect(artifact!.mediaAssets![0]).toMatchObject({
      id: 'pixiv:456:uploadedimage:11',
      sourceUrl: 'https://i.pximg.net/11.jpg',
    });
    // On-demand still emits a resolvable md sidecar (no local images).
    expect(fileService.saveText).toHaveBeenCalledTimes(2);
    expect(fileService.saveText.mock.calls[1][0]).toContain('![](images/11.jpg)');
    const metadata = fileService.saveMetadata.mock.calls[0][1] as { assets?: unknown[] };
    expect(metadata.assets).toEqual([
      {
        marker: '[uploadedimage:11]',
        kind: 'uploadedimage',
        sourceId: '11',
        url: 'https://i.pximg.net/11.jpg',
        localPath: undefined,
        status: 'pending',
        failureReason: undefined,
      },
    ]);
  });

  it('txt still succeeds when an inline image download fails (partial success)', async () => {
    const text = 'a [uploadedimage:22] b';
    const client = {
      getNovelDetailWithTags: jest.fn().mockResolvedValue({ novel, tags: [] }),
      getNovelText: jest.fn().mockResolvedValue({
        novel_text: text,
        images: { '22': { urls: { original: 'https://i.pximg.net/22.jpg' } } },
      }),
      downloadImage: jest.fn().mockRejectedValue(new Error('404')),
    } as unknown as jest.Mocked<IPixivClient>;
    const database = { insertDownload: jest.fn() } as unknown as jest.Mocked<IDatabase>;
    const fileService = {
      sanitizeFileName: jest.fn((name: string) => name),
      saveText: jest.fn().mockResolvedValue('/tmp/novels/456_Rich novel.txt'),
      saveMetadata: jest.fn().mockResolvedValue('/tmp/456_Rich novel.txt.json'),
      saveBinary: jest.fn(),
    } as unknown as jest.Mocked<IFileService>;
    const downloader = new NovelDownloader(client, database, fileService);

    const artifact = await downloader.download(novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig);

    expect(artifact).toBeDefined();
    expect(fileService.saveMetadata.mock.calls[0]![1].assets![0]).toMatchObject({
      status: 'failed',
      failureReason: '404',
    });
  });
});

describe('NovelDownloader cover semantics (§novel-cover)', () => {
  const novel = {
    id: 789,
    title: 'Covered novel',
    user: { id: '42', name: 'Author' },
    create_date: '2026-09-01T00:00:00+00:00',
  } as PixivNovel;

  /** Minimal JPEG (APP0 + SOF0) carrying the frame dimensions. */
  function jpeg(width: number, height: number): Uint8Array {
    return new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      0x00, 0x01, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08,
      (height >> 8) & 0xff, height & 0xff,
      (width >> 8) & 0xff, width & 0xff,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xff, 0xd9,
    ]);
  }

  function build(
    textResponse: Record<string, unknown>,
    cover: ArrayBuffer | Uint8Array | Error = jpeg(800, 1200),
    policy?: NovelCoverPolicy
  ) {
    const downloadImage =
      cover instanceof Error
        ? jest.fn().mockRejectedValue(cover)
        : jest.fn().mockResolvedValue(cover);
    const client = {
      getNovelDetailWithTags: jest.fn().mockResolvedValue({ novel, tags: [] }),
      getNovelText: jest.fn().mockResolvedValue(textResponse),
      downloadImage,
    } as unknown as jest.Mocked<IPixivClient>;
    const database = { insertDownload: jest.fn() } as unknown as jest.Mocked<IDatabase>;
    const fileService = {
      sanitizeFileName: jest.fn((name: string) => name),
      saveText: jest.fn().mockResolvedValue('/tmp/novels/789_Covered novel.txt'),
      saveMetadata: jest.fn().mockResolvedValue('/tmp/789_Covered novel.txt.json'),
    } as unknown as jest.Mocked<IFileService>;
    return {
      downloader: new NovelDownloader(
        client,
        database,
        fileService,
        undefined,
        undefined,
        undefined,
        policy
      ),
      fileService,
    };
  }

  it('emits a novelcover media asset ahead of inline art and records cover_url', async () => {
    const text = 'body [uploadedimage:11]';
    const { downloader, fileService } = build({
      novel_text: text,
      coverUrl: 'https://i.pximg.net/c/240x480_70_a2/novel-cover-master/img/cover.jpg',
      images: { '11': { urls: { original: 'https://i.pximg.net/img/original/u/11.jpg' } } },
    });
    const artifact = await downloader.download(
      novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig
    );

    expect(artifact!.mediaAssets![0]).toMatchObject({
      id: 'pixiv:789:novelcover',
      kind: 'image',
      sourceUrl: 'https://i.pximg.net/novel-cover-master/img/cover.jpg',
    });
    // Cover rides the same wire contract; inline art keeps its own identity.
    expect(artifact!.mediaAssets!.some((a) => a.id === 'pixiv:789:uploadedimage:11')).toBe(true);
    expect(artifact!.mediaAssets!.filter((a) => a.id === 'pixiv:789:novelcover')).toHaveLength(1);

    const metadata = artifact!.artifacts!.find((a) => a.variant === 'metadata');
    expect(metadata).toBeDefined();
    // The metadata json records the normalized cover (never the placeholder).
    const savedMetadata = fileService.saveMetadata.mock.calls[0][1];
    expect(savedMetadata.cover_url).toBe(
      'https://i.pximg.net/novel-cover-master/img/cover.jpg'
    );
  });

  it('normalizes the default placeholder cover to null (no cover asset)', async () => {
    const text = 'body';
    const { downloader, fileService } = build({
      novel_text: text,
      coverUrl: 'https://i.pximg.net/c/240x480_70_a2/novel-cover-master-default/img/def.png',
    });
    const artifact = await downloader.download(
      novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig
    );
    expect(fileService.saveMetadata.mock.calls[0][1].cover_url).toBeNull();

    expect(artifact!.mediaAssets ?? []).toHaveLength(0);
  });

  it('omits any cover asset when the response has no coverUrl', async () => {
    const { downloader, fileService } = build({ novel_text: 'plain body' });
    const artifact = await downloader.download(
      novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig
    );
    expect(fileService.saveMetadata.mock.calls[0][1].cover_url).toBeNull();
    expect(artifact!.mediaAssets ?? []).toHaveLength(0);
  });

  it('drops Pixiv design covers (its 640x900 canvas) without touching inline art', async () => {
    const { downloader, fileService } = build(
      {
        novel_text: 'body [uploadedimage:11]',
        coverUrl:
          'https://i.pximg.net/novel-cover-master/img/2026/09/26/15/36/33/sci16561761_design_master1200.jpg',
        images: { '11': { urls: { original: 'https://i.pximg.net/img/original/u/11.jpg' } } },
      },
      jpeg(640, 900)
    );
    const artifact = await downloader.download(
      novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig
    );

    // Pixiv renders its designs on the same CDN path as real covers, so the
    // only discriminator is the canvas: that cover must never reach TelePost.
    expect(fileService.saveMetadata.mock.calls[0][1].cover_url).toBeNull();
    expect(artifact!.mediaAssets!.some((a) => a.id === 'pixiv:789:novelcover')).toBe(false);
    expect(artifact!.mediaAssets!.some((a) => a.id === 'pixiv:789:uploadedimage:11')).toBe(true);
  });

  it('keeps an author cover on any other canvas', async () => {
    const { downloader, fileService } = build(
      {
        novel_text: 'body',
        coverUrl: 'https://i.pximg.net/novel-cover-master/img/author_cover_master1200.jpg',
      },
      jpeg(800, 1200)
    );
    const artifact = await downloader.download(
      novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig
    );
    expect(fileService.saveMetadata.mock.calls[0][1].cover_url).toBe(
      'https://i.pximg.net/novel-cover-master/img/author_cover_master1200.jpg'
    );
    expect(artifact!.mediaAssets![0]).toMatchObject({ id: 'pixiv:789:novelcover' });
  });

  it('fails open and keeps the cover when the probe cannot be fetched', async () => {
    const coverUrl = 'https://i.pximg.net/novel-cover-master/img/unreachable_master1200.jpg';
    const { downloader, fileService } = build(
      { novel_text: 'body', coverUrl },
      new Error('429 Too Many Requests')
    );
    const artifact = await downloader.download(
      novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig
    );
    // A failed probe must never cost a real cover.
    expect(fileService.saveMetadata.mock.calls[0][1].cover_url).toBe(coverUrl);
    expect(artifact!.mediaAssets!.some((a) => a.id === 'pixiv:789:novelcover')).toBe(true);
  });

  it('skips an unclassifiable cover in safe mode (default policy)', async () => {
    const { downloader, fileService } = build(
      {
        novel_text: 'body',
        coverUrl: 'https://i.pximg.net/novel-cover-master/img/weird_master1200.bin',
      },
      new Uint8Array(4)
    );
    const artifact = await downloader.download(
      novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig
    );
    // Unknown content type: never ship it, and let the log carry coverType.
    expect(fileService.saveMetadata.mock.calls[0][1].cover_url).toBeNull();
    expect(artifact!.mediaAssets!.some((a) => a.id === 'pixiv:789:novelcover')).toBe(false);
  });

  it('keeps an unclassifiable cover when the policy opts into availability', async () => {
    const policy: NovelCoverPolicy = { unknownCover: 'keep' };
    const coverUrl = 'https://i.pximg.net/novel-cover-master/img/weird_master1200.bin';
    const { downloader, fileService } = build(
      { novel_text: 'body', coverUrl },
      new Uint8Array(4),
      policy
    );
    const artifact = await downloader.download(
      novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig
    );
    expect(fileService.saveMetadata.mock.calls[0][1].cover_url).toBe(coverUrl);
    expect(artifact!.mediaAssets![0]).toMatchObject({ id: 'pixiv:789:novelcover' });
  });

  it('never delivers a generated design even when unknown covers are kept', async () => {
    const policy: NovelCoverPolicy = { unknownCover: 'keep' };
    const { downloader, fileService } = build(
      {
        novel_text: 'body',
        coverUrl: 'https://i.pximg.net/novel-cover-master/img/sci16561761_design_master1200.jpg',
      },
      jpeg(640, 900),
      policy
    );
    const artifact = await downloader.download(
      novel, 'bg', { type: 'novel', detectLanguage: false } as TargetConfig
    );
    expect(fileService.saveMetadata.mock.calls[0][1].cover_url).toBeNull();
    expect(artifact!.mediaAssets!.some((a) => a.id === 'pixiv:789:novelcover')).toBe(false);
  });
});
