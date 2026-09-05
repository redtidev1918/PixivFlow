import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IllustrationDownloader } from '../../download/IllustrationDownloader';
import { NetworkError } from '../../utils/errors';

describe('IllustrationDownloader', () => {
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
