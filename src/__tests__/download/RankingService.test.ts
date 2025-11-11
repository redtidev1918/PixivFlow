/**
 * Tests for RankingService
 */

import { RankingService } from '../../download/RankingService';
import type { IPixivClient } from '../../interfaces/IPixivClient';
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

describe('RankingService', () => {
  let mockClient: jest.Mocked<IPixivClient>;
  let rankingService: RankingService;

  beforeEach(() => {
    mockClient = {
      getRankingIllustrations: jest.fn(),
      getRankingNovels: jest.fn(),
    } as any;

    rankingService = new RankingService(mockClient);
  });

  describe('getRankingIllustrationsWithFallback', () => {
    it('should call getRankingIllustrations directly for non-week modes', async () => {
      const illusts = [createIllust({ id: 1 }), createIllust({ id: 2 })];
      mockClient.getRankingIllustrations.mockResolvedValueOnce(illusts);

      const result = await rankingService.getRankingIllustrationsWithFallback('day', '2024-01-01', 10);

      expect(result).toEqual(illusts);
      expect(mockClient.getRankingIllustrations).toHaveBeenCalledTimes(1);
      expect(mockClient.getRankingIllustrations).toHaveBeenCalledWith('day', '2024-01-01', 10);
    });

    it('should return ranking illustrations for week mode when successful', async () => {
      const illusts = [createIllust({ id: 1 }), createIllust({ id: 2 })];
      mockClient.getRankingIllustrations.mockResolvedValueOnce(illusts);

      const result = await rankingService.getRankingIllustrationsWithFallback('week', '2024-01-01', 10);

      expect(result).toEqual(illusts);
      expect(mockClient.getRankingIllustrations).toHaveBeenCalledTimes(1);
      expect(mockClient.getRankingIllustrations).toHaveBeenCalledWith('week', '2024-01-01', 10);
    });

    it('should fallback to this week Monday when week ranking fails', async () => {
      const error = new Error('Week ranking failed');
      const fallbackIllusts = [createIllust({ id: 3 })];
      mockClient.getRankingIllustrations
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(fallbackIllusts);

      const result = await rankingService.getRankingIllustrationsWithFallback('week', '2024-01-01', 10);

      expect(result).toEqual(fallbackIllusts);
      expect(mockClient.getRankingIllustrations).toHaveBeenCalledTimes(2);
      expect(mockClient.getRankingIllustrations).toHaveBeenNthCalledWith(1, 'week', '2024-01-01', 10);
      // Second call should use this week's Monday (we can't predict the exact date, but it should be called)
      expect(mockClient.getRankingIllustrations).toHaveBeenNthCalledWith(2, 'week', expect.any(String), 10);
    });

    it('should fallback to day ranking with last week Monday when both week attempts fail', async () => {
      const error1 = new Error('Week ranking failed');
      const error2 = new Error('This week Monday failed');
      const fallbackIllusts = [createIllust({ id: 4 })];
      mockClient.getRankingIllustrations
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2)
        .mockResolvedValueOnce(fallbackIllusts);

      const result = await rankingService.getRankingIllustrationsWithFallback('week', '2024-01-01', 10);

      expect(result).toEqual(fallbackIllusts);
      expect(mockClient.getRankingIllustrations).toHaveBeenCalledTimes(3);
      expect(mockClient.getRankingIllustrations).toHaveBeenNthCalledWith(1, 'week', '2024-01-01', 10);
      expect(mockClient.getRankingIllustrations).toHaveBeenNthCalledWith(2, 'week', expect.any(String), 10);
      expect(mockClient.getRankingIllustrations).toHaveBeenNthCalledWith(3, 'day', expect.any(String), 10);
    });

    it('should support all non-week ranking modes', async () => {
      const modes = [
        'day',
        'month',
        'day_male',
        'day_female',
        'week_original',
        'week_rookie',
        'day_r18',
        'day_male_r18',
        'day_female_r18',
        'week_r18',
        'week_r18g',
      ] as const;

      for (const mode of modes) {
        const illusts = [createIllust({ id: 1 })];
        mockClient.getRankingIllustrations.mockResolvedValueOnce(illusts);

        const result = await rankingService.getRankingIllustrationsWithFallback(mode, undefined, 10);

        expect(result).toEqual(illusts);
        expect(mockClient.getRankingIllustrations).toHaveBeenCalledWith(mode, undefined, 10);
      }
    });

    it('should handle undefined date parameter', async () => {
      const illusts = [createIllust({ id: 1 })];
      mockClient.getRankingIllustrations.mockResolvedValueOnce(illusts);

      const result = await rankingService.getRankingIllustrationsWithFallback('day', undefined, 10);

      expect(result).toEqual(illusts);
      expect(mockClient.getRankingIllustrations).toHaveBeenCalledWith('day', undefined, 10);
    });

    it('should handle undefined limit parameter', async () => {
      const illusts = [createIllust({ id: 1 })];
      mockClient.getRankingIllustrations.mockResolvedValueOnce(illusts);

      const result = await rankingService.getRankingIllustrationsWithFallback('day', '2024-01-01', undefined);

      expect(result).toEqual(illusts);
      expect(mockClient.getRankingIllustrations).toHaveBeenCalledWith('day', '2024-01-01', undefined);
    });
  });

  describe('getRankingNovelsWithFallback', () => {
    it('should call getRankingNovels directly for non-week modes', async () => {
      const novels = [createNovel({ id: 1 }), createNovel({ id: 2 })];
      mockClient.getRankingNovels.mockResolvedValueOnce(novels);

      const result = await rankingService.getRankingNovelsWithFallback('day', '2024-01-01', 10);

      expect(result).toEqual(novels);
      expect(mockClient.getRankingNovels).toHaveBeenCalledTimes(1);
      expect(mockClient.getRankingNovels).toHaveBeenCalledWith('day', '2024-01-01', 10);
    });

    it('should return ranking novels for week mode when successful', async () => {
      const novels = [createNovel({ id: 1 }), createNovel({ id: 2 })];
      mockClient.getRankingNovels.mockResolvedValueOnce(novels);

      const result = await rankingService.getRankingNovelsWithFallback('week', '2024-01-01', 10);

      expect(result).toEqual(novels);
      expect(mockClient.getRankingNovels).toHaveBeenCalledTimes(1);
      expect(mockClient.getRankingNovels).toHaveBeenCalledWith('week', '2024-01-01', 10);
    });

    it('should fallback to this week Monday when week ranking fails', async () => {
      const error = new Error('Week ranking failed');
      const fallbackNovels = [createNovel({ id: 3 })];
      mockClient.getRankingNovels
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(fallbackNovels);

      const result = await rankingService.getRankingNovelsWithFallback('week', '2024-01-01', 10);

      expect(result).toEqual(fallbackNovels);
      expect(mockClient.getRankingNovels).toHaveBeenCalledTimes(2);
      expect(mockClient.getRankingNovels).toHaveBeenNthCalledWith(1, 'week', '2024-01-01', 10);
      expect(mockClient.getRankingNovels).toHaveBeenNthCalledWith(2, 'week', expect.any(String), 10);
    });

    it('should fallback to day ranking with last week Monday when both week attempts fail', async () => {
      const error1 = new Error('Week ranking failed');
      const error2 = new Error('This week Monday failed');
      const fallbackNovels = [createNovel({ id: 4 })];
      mockClient.getRankingNovels
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2)
        .mockResolvedValueOnce(fallbackNovels);

      const result = await rankingService.getRankingNovelsWithFallback('week', '2024-01-01', 10);

      expect(result).toEqual(fallbackNovels);
      expect(mockClient.getRankingNovels).toHaveBeenCalledTimes(3);
      expect(mockClient.getRankingNovels).toHaveBeenNthCalledWith(1, 'week', '2024-01-01', 10);
      expect(mockClient.getRankingNovels).toHaveBeenNthCalledWith(2, 'week', expect.any(String), 10);
      expect(mockClient.getRankingNovels).toHaveBeenNthCalledWith(3, 'day', expect.any(String), 10);
    });

    it('should support all non-week ranking modes', async () => {
      const modes = [
        'day',
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
        const novels = [createNovel({ id: 1 })];
        mockClient.getRankingNovels.mockResolvedValueOnce(novels);

        const result = await rankingService.getRankingNovelsWithFallback(mode, undefined, 10);

        expect(result).toEqual(novels);
        expect(mockClient.getRankingNovels).toHaveBeenCalledWith(mode, undefined, 10);
      }
    });

    it('should handle undefined date parameter', async () => {
      const novels = [createNovel({ id: 1 })];
      mockClient.getRankingNovels.mockResolvedValueOnce(novels);

      const result = await rankingService.getRankingNovelsWithFallback('day', undefined, 10);

      expect(result).toEqual(novels);
      expect(mockClient.getRankingNovels).toHaveBeenCalledWith('day', undefined, 10);
    });

    it('should handle undefined limit parameter', async () => {
      const novels = [createNovel({ id: 1 })];
      mockClient.getRankingNovels.mockResolvedValueOnce(novels);

      const result = await rankingService.getRankingNovelsWithFallback('day', '2024-01-01', undefined);

      expect(result).toEqual(novels);
      expect(mockClient.getRankingNovels).toHaveBeenCalledWith('day', '2024-01-01', undefined);
    });
  });
});

