import { IllustService } from '../../pixiv/client/IllustService';
import { MediaDownloadService } from '../../pixiv/client/MediaDownloadService';
import { NovelService } from '../../pixiv/client/NovelService';
import type { PixivApiCore } from '../../pixiv/client/PixivApiCore';
import type { PixivIllust, PixivNovel } from '../../pixiv/types';

const createIllust = (overrides: Partial<PixivIllust> = {}): PixivIllust =>
  ({
    id: 1,
    title: 'Illustration',
    create_date: '2024-01-01T00:00:00+00:00',
    user: { id: 'artist', name: 'Artist' },
    page_count: 1,
    total_bookmarks: 0,
    total_view: 0,
    image_urls: {
      square_medium: 'sq',
      medium: 'med',
      large: 'large',
    },
    ...overrides,
  } as PixivIllust);

const createNovel = (overrides: Partial<PixivNovel> = {}): PixivNovel =>
  ({
    id: 1,
    title: 'Novel',
    create_date: '2024-01-01T00:00:00+00:00',
    user: { id: 'author', name: 'Author' },
    bookmark_count: 0,
    total_bookmarks: 0,
    total_view: 0,
    ...overrides,
  } as PixivNovel);

describe('Pixiv client services', () => {
  let requestMock: jest.Mock;
  let downloadBinaryMock: jest.Mock;
  let api: Pick<PixivApiCore, 'request' | 'downloadBinary'>;

  beforeEach(() => {
    requestMock = jest.fn();
    downloadBinaryMock = jest.fn();
    api = {
      request: requestMock,
      downloadBinary: downloadBinaryMock,
    } as unknown as PixivApiCore;
  });

  describe('IllustService', () => {
    it('fetches illustration by id', async () => {
      const illust = createIllust({ id: 1, user: { id: '1', name: 'User' } });
      requestMock.mockResolvedValueOnce({ illust });

      const service = new IllustService(api as PixivApiCore);
      const result = await service.getIllustration(1);

      expect(result).toEqual(illust);
      expect(requestMock).toHaveBeenCalledWith('/v1/illust/detail?illust_id=1', { method: 'GET' });
    });

    it('fetches illustration with tags, removing tag field from illust', async () => {
      const illust = {
        ...createIllust({
          id: 2,
          title: 'Tagged',
          create_date: '2024-02-02T00:00:00+00:00',
          user: { id: '2', name: 'User' },
        }),
        tags: [
          { name: 'tag1' },
          { name: 'tag2', translated_name: 'タグ2' },
        ],
      } as PixivIllust & { tags: Array<{ name: string; translated_name?: string }> };
      requestMock.mockResolvedValueOnce({ illust });

      const service = new IllustService(api as PixivApiCore);
      const result = await service.getIllustDetailWithTags(2);

      expect(result.tags).toEqual(illust.tags);
      expect(result.illust).not.toHaveProperty('tags');
    });

    it('paginates user illustrations up to limit', async () => {
      const firstBatch: PixivIllust[] = [
        createIllust({ id: 1, title: 'A', user: { id: 'u', name: 'User' } }),
        createIllust({ id: 2, title: 'B', user: { id: 'u', name: 'User' } }),
      ];
      const secondBatch: PixivIllust[] = [
        createIllust({ id: 3, title: 'C', user: { id: 'u', name: 'User' } }),
      ];
      requestMock
        .mockResolvedValueOnce({ illusts: firstBatch, next_url: '/next?page=2' })
        .mockResolvedValueOnce({ illusts: secondBatch, next_url: null });

      const service = new IllustService(api as PixivApiCore);
      const result = await service.getUserIllustrations('u', { limit: 3 });

      expect(result.map((x) => x.id)).toEqual([1, 2, 3]);
      expect(requestMock).toHaveBeenCalledTimes(2);
      expect(requestMock).toHaveBeenLastCalledWith('/next?page=2', { method: 'GET' });
    });

    it('stops ranking fetch when limit reached', async () => {
      requestMock
        .mockResolvedValueOnce({
          illusts: [createIllust({ id: 1 }), createIllust({ id: 2 })],
          next_url: '/next',
        })
        .mockResolvedValueOnce({
          illusts: [createIllust({ id: 3 })],
          next_url: null,
        });

      const service = new IllustService(api as PixivApiCore);
      const result = await service.getRankingIllustrations('day', undefined, 3);

      expect(result).toHaveLength(3);
      expect(result.map((x) => x.id)).toEqual([1, 2, 3]);
      expect(requestMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('NovelService', () => {
    it('fetches novel via v2 detail endpoint', async () => {
      const novel = createNovel({
        id: 10,
        title: 'Novel',
        user: { id: 'n', name: 'Author' },
      });
      requestMock.mockResolvedValueOnce({ novel });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getNovel(10);

      expect(result).toEqual(novel);
      expect(requestMock).toHaveBeenCalledWith('/v2/novel/detail?novel_id=10', { method: 'GET' });
    });

    it('fetches novel detail with tags via v2 endpoint', async () => {
      const novel = createNovel({
        id: 11,
        title: 'Tagged Novel',
        user: { id: 'n', name: 'Author' },
      });
      const response = {
        novel: {
          ...novel,
          tags: [
            { name: 'tag1' },
            { name: 'tag2', translated_name: 'タグ2' },
          ],
        },
      };
      requestMock.mockResolvedValueOnce(response);

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getNovelDetailWithTags(11);

      expect(result.novel).not.toHaveProperty('tags');
      expect(result.tags).toEqual([
        { name: 'tag1' },
        { name: 'tag2', translated_name: 'タグ2' },
      ]);
      expect(result.novel.id).toBe(11);
    });

    it('falls back to v1 when v2 endpoint returns 404 for getNovelDetailWithTags', async () => {
      const novel = createNovel({
        id: 12,
        title: 'Legacy Novel',
        user: { id: 'n', name: 'Author' },
      });
      requestMock
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockResolvedValueOnce({
          novel: {
            ...novel,
            tags: [{ name: 'tag1' }],
          },
        });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getNovelDetailWithTags(12);

      expect(result.novel.id).toBe(12);
      expect(result.tags).toEqual([{ name: 'tag1' }]);
      expect(requestMock).toHaveBeenNthCalledWith(1, '/v2/novel/detail?novel_id=12', {
        method: 'GET',
      });
      expect(requestMock).toHaveBeenNthCalledWith(2, '/v1/novel/detail?novel_id=12', {
        method: 'GET',
      });
    });

    it('handles non-404 errors in getNovelDetailWithTags without fallback', async () => {
      requestMock.mockRejectedValueOnce(new Error('500 Internal Server Error'));

      const service = new NovelService(api as PixivApiCore);
      await expect(service.getNovelDetailWithTags(13)).rejects.toThrow('500 Internal Server Error');
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to v1 detail when v2 is missing', async () => {
      requestMock
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockResolvedValueOnce({
          novel: createNovel({
            id: 20,
            title: 'Legacy',
            create_date: '2024-01-02T00:00:00+00:00',
            user: { id: 'n', name: 'Author' },
          }),
        });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getNovelDetail(20);

      expect(result.id).toBe(20);
      expect(requestMock).toHaveBeenNthCalledWith(1, '/v2/novel/detail?novel_id=20', {
        method: 'GET',
      });
      expect(requestMock).toHaveBeenNthCalledWith(2, '/v1/novel/detail?novel_id=20', {
        method: 'GET',
      });
    });

    it('handles non-404 errors in getNovelDetail without fallback', async () => {
      requestMock.mockRejectedValueOnce(new Error('500 Internal Server Error'));

      const service = new NovelService(api as PixivApiCore);
      await expect(service.getNovelDetail(21)).rejects.toThrow('500 Internal Server Error');
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('fetches novel text successfully', async () => {
      requestMock.mockResolvedValueOnce({
        novel_text: 'Novel content here',
      });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getNovelText(30);

      expect(result).toEqual({ novel_text: 'Novel content here' });
      expect(requestMock).toHaveBeenCalledWith('/v1/novel/text?novel_id=30', { method: 'GET' });
    });

    it('fetches novel text with user agent', async () => {
      requestMock.mockResolvedValueOnce({
        novel_text: 'Novel content',
      });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getNovelText(31, { userAgent: 'CustomUA' });

      expect(result).toEqual({ novel_text: 'Novel content' });
      expect(requestMock).toHaveBeenCalledWith('/v1/novel/text?novel_id=31', { method: 'GET' });
    });

    it('falls back to ajax endpoint when novel text API fails', async () => {
      requestMock
        .mockRejectedValueOnce(new Error('500 Internal Error'))
        .mockResolvedValueOnce({
          body: { content: 'novel content' },
        });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getNovelText(30, { userAgent: 'UA' });

      expect(result).toEqual({ novel_text: 'novel content' });
      expect(requestMock).toHaveBeenNthCalledWith(2, 'https://www.pixiv.net/ajax/novel/30', {
        method: 'GET',
        headers: {
          Referer: 'https://www.pixiv.net/',
          'User-Agent': 'UA',
        },
      });
    });

    it('throws error when ajax endpoint returns unexpected structure', async () => {
      requestMock
        .mockRejectedValueOnce(new Error('500 Internal Error'))
        .mockResolvedValueOnce({
          body: { unexpected: 'structure' },
        });

      const service = new NovelService(api as PixivApiCore);
      await expect(service.getNovelText(32)).rejects.toThrow();
    });

    it('throws error when ajax endpoint fails', async () => {
      requestMock
        .mockRejectedValueOnce(new Error('500 Internal Error'))
        .mockRejectedValueOnce(new Error('Ajax endpoint failed'));

      const service = new NovelService(api as PixivApiCore);
      await expect(service.getNovelText(33)).rejects.toThrow('Ajax endpoint failed');
    });

    it('fetches user novels with pagination', async () => {
      const firstBatch = [
        createNovel({ id: 1, user: { id: 'user1', name: 'Author' } }),
        createNovel({ id: 2, user: { id: 'user1', name: 'Author' } }),
      ];
      const secondBatch = [
        createNovel({ id: 3, user: { id: 'user1', name: 'Author' } }),
      ];
      requestMock
        .mockResolvedValueOnce({
          novels: firstBatch,
          next_url: '/v1/user/novels?user_id=user1&filter=for_ios&offset=2',
        })
        .mockResolvedValueOnce({
          novels: secondBatch,
          next_url: null,
        });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getUserNovels('user1', { limit: 3 });

      expect(result).toHaveLength(3);
      expect(result.map((n) => n.id)).toEqual([1, 2, 3]);
      expect(requestMock).toHaveBeenCalledTimes(2);
    });

    it('stops fetching when limit is reached', async () => {
      requestMock.mockResolvedValueOnce({
        novels: [
          createNovel({ id: 1, user: { id: 'user2', name: 'Author' } }),
          createNovel({ id: 2, user: { id: 'user2', name: 'Author' } }),
        ],
        next_url: '/next',
      });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getUserNovels('user2', { limit: 2 });

      expect(result).toHaveLength(2);
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('uses default limit of 30 when not specified', async () => {
      const novels = Array.from({ length: 30 }, (_, i) =>
        createNovel({ id: i + 1, user: { id: 'user3', name: 'Author' } })
      );
      requestMock.mockResolvedValueOnce({
        novels,
        next_url: null,
      });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getUserNovels('user3');

      expect(result).toHaveLength(30);
    });

    it('handles offset parameter', async () => {
      requestMock.mockResolvedValueOnce({
        novels: [createNovel({ id: 10, user: { id: 'user4', name: 'Author' } })],
        next_url: null,
      });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getUserNovels('user4', { offset: 9 });

      expect(result).toHaveLength(1);
      expect(requestMock).toHaveBeenCalledWith(
        expect.stringContaining('offset=9'),
        { method: 'GET' }
      );
    });

    it('stops when empty novels array is returned', async () => {
      requestMock.mockResolvedValueOnce({
        novels: [],
        next_url: '/next',
      });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getUserNovels('user5', { limit: 10 });

      expect(result).toHaveLength(0);
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('fetches ranking novels with pagination', async () => {
      requestMock
        .mockResolvedValueOnce({
          novels: [
            createNovel({ id: 1, user: { id: 'author1', name: 'Author1' } }),
            createNovel({ id: 2, user: { id: 'author2', name: 'Author2' } }),
          ],
          next_url: '/next',
        })
        .mockResolvedValueOnce({
          novels: [createNovel({ id: 3, user: { id: 'author3', name: 'Author3' } })],
          next_url: null,
        });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getRankingNovels('day', undefined, 3);

      expect(result).toHaveLength(3);
      expect(result.map((n) => n.id)).toEqual([1, 2, 3]);
    });

    it('fetches ranking novels with date parameter', async () => {
      requestMock.mockResolvedValueOnce({
        novels: [createNovel({ id: 1, user: { id: 'author1', name: 'Author1' } })],
        next_url: null,
      });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getRankingNovels('day', '2024-01-01', 10);

      expect(result).toHaveLength(1);
      expect(requestMock).toHaveBeenCalledWith(
        expect.stringContaining('date=2024-01-01'),
        { method: 'GET' }
      );
    });

    it('stops fetching when limit is reached in ranking', async () => {
      requestMock.mockResolvedValueOnce({
        novels: [
          createNovel({ id: 1, user: { id: 'author1', name: 'Author1' } }),
          createNovel({ id: 2, user: { id: 'author2', name: 'Author2' } }),
        ],
        next_url: '/next',
      });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getRankingNovels('day', undefined, 2);

      expect(result).toHaveLength(2);
    });

    it('fetches all ranking novels when limit is not specified', async () => {
      requestMock
        .mockResolvedValueOnce({
          novels: [createNovel({ id: 1, user: { id: 'author1', name: 'Author1' } })],
          next_url: '/next',
        })
        .mockResolvedValueOnce({
          novels: [createNovel({ id: 2, user: { id: 'author2', name: 'Author2' } })],
          next_url: null,
        });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getRankingNovels('week');

      expect(result).toHaveLength(2);
    });

    it('supports all ranking modes', async () => {
      const modes = [
        'day',
        'week',
        'month',
        'day_male',
        'day_female',
        'day_r18',
        'day_male_r18',
        'day_female_r18',
        'week_r18',
        'week_r18g',
      ] as const;

      for (const mode of modes) {
        requestMock.mockResolvedValueOnce({
          novels: [createNovel({ id: 1, user: { id: 'author1', name: 'Author1' } })],
          next_url: null,
        });

        const service = new NovelService(api as PixivApiCore);
        const result = await service.getRankingNovels(mode, undefined, 1);

        expect(result).toHaveLength(1);
        expect(requestMock).toHaveBeenCalledWith(
          expect.stringContaining(`mode=${mode}`),
          { method: 'GET' }
        );
      }
    });

    it('normalises series responses and continues pagination', async () => {
      requestMock
        .mockResolvedValueOnce({
          novel_series_detail: {
            series_content: [
              createNovel({
                id: 1,
                title: 'A',
                user: { id: 'n', name: 'Author' },
                create_date: '2024-01-01',
              }),
            ],
          },
          next_url: '/next',
        })
        .mockResolvedValueOnce({
          novels: [
            createNovel({
              id: 2,
              title: 'B',
              user: { id: 'n', name: 'Author' },
              create_date: '2024-01-02',
            }),
          ],
          next_url: null,
        });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getNovelSeries(99);

      expect(result.map((n) => n.id)).toEqual([1, 2]);
      expect(requestMock).toHaveBeenCalledTimes(2);
    });

    it('handles series_content format in getNovelSeries', async () => {
      requestMock.mockResolvedValueOnce({
        series_content: [
          createNovel({
            id: 1,
            title: 'Series Item',
            user: { id: 'n', name: 'Author' },
            create_date: '2024-01-01',
          }),
        ],
        next_url: null,
      });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getNovelSeries(100);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('handles novels array format in getNovelSeries', async () => {
      requestMock.mockResolvedValueOnce({
        novels: [
          createNovel({
            id: 1,
            title: 'Novel Item',
            user: { id: 'n', name: 'Author' },
            create_date: '2024-01-01',
          }),
        ],
        next_url: null,
      });

      const service = new NovelService(api as PixivApiCore);
      const result = await service.getNovelSeries(101);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('throws error for unexpected series response structure', async () => {
      requestMock.mockResolvedValueOnce({
        unexpected: 'structure',
      });

      const service = new NovelService(api as PixivApiCore);
      await expect(service.getNovelSeries(102)).rejects.toThrow(
        'Unexpected response structure from novel series API'
      );
    });
  });

  describe('MediaDownloadService', () => {
    it('downloads image with referer and optional user agent', async () => {
      const buffer = new ArrayBuffer(2);
      downloadBinaryMock.mockResolvedValueOnce(buffer);

      const service = new MediaDownloadService(api as PixivApiCore);
      const result = await service.downloadImage('https://i.pximg.net/img.jpg', 'UA');

      expect(result).toBe(buffer);
      expect(downloadBinaryMock).toHaveBeenCalledWith('https://i.pximg.net/img.jpg', {
        headers: {
          Referer: 'https://app-api.pixiv.net/',
          'User-Agent': 'UA',
        },
        method: 'GET',
      });
    });
  });
});


