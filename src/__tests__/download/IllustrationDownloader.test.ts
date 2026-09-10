import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IllustrationDownloader } from '../../download/IllustrationDownloader';
import { NetworkError } from '../../utils/errors';
import { convertUgoira } from '../../download/UgoiraConverter';

jest.mock('../../download/UgoiraConverter');

describe('IllustrationDownloader', () => {
  it('downloads an aligned lower-resolution delivery preview without replacing the original', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pixivflow-preview-'));
    const originalPath = join(directory, '123_work_1.png');
    const client = {
      getIllustDetailWithTags: jest.fn().mockResolvedValue({
        illust: {
          id: 123, title: 'work', page_count: 1,
          user: { id: '1', name: 'author' },
          image_urls: { large: 'https://example.test/large.jpg' },
          meta_single_page: { original_image_url: 'https://example.test/original.png' },
        },
        tags: [],
      }),
      downloadImage: jest.fn()
        .mockResolvedValueOnce(Buffer.from('original'))
        .mockResolvedValueOnce(Buffer.from('preview')),
    };
    const downloader = new IllustrationDownloader(
      client as any,
      { hasDownloaded: jest.fn().mockReturnValue(false), insertDownload: jest.fn() } as any,
      {
        sanitizeFileName: jest.fn((name) => name),
        saveImage: jest.fn(async (data) => {
          await writeFile(originalPath, Buffer.from(data));
          return originalPath;
        }),
        saveMetadata: jest.fn().mockResolvedValue(undefined),
      } as any,
      1,
      directory
    );
    try {
      const result = await downloader.downloadIllustration(
        { id: 123 } as any, 'tag', { includeDeliveryPreviews: true }
      );
      expect(client.downloadImage.mock.calls.map(([url]) => url)).toEqual([
        'https://example.test/original.png',
        'https://example.test/large.jpg',
      ]);
      expect(result?.files).toEqual([originalPath]);
      expect(result?.previewFiles).toEqual([`${originalPath}.preview.jpg`]);
      await expect(Promise.all([
        import('node:fs/promises').then((mod) => mod.readFile(originalPath, 'utf8')),
        import('node:fs/promises').then((mod) => mod.readFile(`${originalPath}.preview.jpg`, 'utf8')),
      ])).resolves.toEqual(['original', 'preview']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('converts retained ugoira frames before recording or delivering them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pixivflow-ugoira-'));
    const zip = join(directory, '123_work_ugoira.zip');
    const gif = zip.replace('.zip', '.gif');
    await writeFile(zip, 'retained zip');
    const insertDownload = jest.fn();
    const client = {
      getIllustDetailWithTags: jest.fn().mockResolvedValue({
        illust: { id: 123, title: 'work', type: 'ugoira' }, tags: [],
      }),
      ugoiraMetadata: jest.fn().mockResolvedValue({
        zip_urls: { medium: 'https://example.test/ugoira.zip' },
        frames: [{ file: '000000.jpg', delay: 100 }],
      }),
      downloadImage: jest.fn(),
    };
    const downloader = new IllustrationDownloader(client as any, {
      hasDownloaded: () => false, insertDownload,
    } as any, { sanitizeFileName: (name: string) => name } as any, 1, directory);
    const converter = jest.mocked(convertUgoira);
    try {
      converter.mockRejectedValueOnce(new Error('converter unavailable'));
      await expect(downloader.downloadIllustration({ id: 123 } as any, 'tag')).rejects.toThrow('converter unavailable');
      expect(insertDownload).not.toHaveBeenCalled();
      converter.mockResolvedValueOnce(gif);
      const result = await downloader.downloadIllustration({ id: 123 } as any, 'tag');
      expect(result?.files).toEqual([gif]);
      expect(result?.cleanupFiles).toEqual([zip, zip.replace('.zip', '_frames.json')]);
      expect(insertDownload).toHaveBeenCalledWith(expect.objectContaining({ filePath: gif }));
      expect(client.downloadImage).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves a page network error so the pipeline can retry and backfill', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pixivflow-illust-'));
    const networkError = new NetworkError('image unavailable');
    const client = {
      getIllustDetailWithTags: jest.fn().mockResolvedValue({
        illust: {
          id: 123,
          title: 'work',
          page_count: 1,
          user: { id: '1', name: 'author' },
          image_urls: { large: 'https://example.test/123.jpg' },
        },
        tags: [],
      }),
      downloadImage: jest.fn().mockRejectedValue(networkError),
    };
    const downloader = new IllustrationDownloader(
      client as any,
      { hasDownloaded: jest.fn().mockReturnValue(false), insertDownload: jest.fn() } as any,
      { sanitizeFileName: jest.fn((name) => name), saveImage: jest.fn() } as any,
      1,
      directory
    );

    await expect(downloader.downloadIllustration({ id: 123 } as any, '丸呑み')).rejects.toBe(networkError);
    await rm(directory, { recursive: true, force: true });
  });
});
