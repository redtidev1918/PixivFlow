import { NovelTargetHandler } from '../../../download/handlers/NovelTargetHandler';
import { TargetConfig } from '../../../config';
import { IPixivClient } from '../../../interfaces/IPixivClient';
import { IDatabase } from '../../../interfaces/IDatabase';
import { RankingService } from '../../../download/RankingService';
import { NovelDownloader } from '../../../download/NovelDownloader';
import { DownloadPipeline } from '../../../download/pipeline/DownloadPipeline';
import { PixivNovel } from '../../../pixiv/PixivClient';
import { NetworkError } from '../../../utils/errors';
import { logger } from '../../../logger';

// Mock dependencies
jest.mock('../../../logger');
jest.mock('../../../utils/pixiv-date-utils', () => ({
  getTodayDate: jest.fn().mockReturnValue('2023-06-15'),
  getYesterdayDate: jest.fn().mockReturnValue('2023-06-14'),
}));

describe('NovelTargetHandler', () => {
  let handler: NovelTargetHandler;
  let mockClient: jest.Mocked<IPixivClient>;
  let mockDatabase: jest.Mocked<IDatabase>;
  let mockRankingService: jest.Mocked<RankingService>;
  let mockNovelDownloader: jest.Mocked<NovelDownloader>;
  let mockPipeline: jest.Mocked<DownloadPipeline>;

  const createMockNovel = (id: number): PixivNovel => ({
    id,
    title: `Novel ${id}`,
    user: {
      id: '12345',
      name: 'Test User',
    },
    create_date: '2023-06-15',
    total_bookmarks: 100,
    total_view: 1000,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      searchNovels: jest.fn(),
      getNovelDetail: jest.fn(),
      getNovelSeries: jest.fn(),
    } as any;

    mockDatabase = {
      logExecution: jest.fn(),
      hasDownloaded: jest.fn(),
    } as any;

    mockRankingService = {
      getRankingNovelsWithFallback: jest.fn(),
    } as any;

    mockNovelDownloader = {
      download: jest.fn(),
    } as any;

    mockPipeline = {
      run: jest.fn(),
    } as any;

    handler = new NovelTargetHandler(
      mockClient,
      mockDatabase,
      mockRankingService,
      mockPipeline,
      mockNovelDownloader
    );
  });

  describe('handle', () => {
    it('should handle search mode target', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const novels = [createMockNovel(1), createMockNovel(2)];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 2,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchNovels).toHaveBeenCalled();
      expect(mockPipeline.run).toHaveBeenCalled();
      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'novel',
        'success',
        expect.stringContaining('2 items downloaded')
      );
    });

    it('should handle ranking mode target', async () => {
      const target: TargetConfig = {
        type: 'novel',
        mode: 'ranking',
        limit: 10,
      };
      const novels = [createMockNovel(1)];
      mockRankingService.getRankingNovelsWithFallback.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockRankingService.getRankingNovelsWithFallback).toHaveBeenCalled();
      expect(mockPipeline.run).toHaveBeenCalled();
    });

    it('should handle ranking mode with filterTag', async () => {
      const target: TargetConfig = {
        type: 'novel',
        mode: 'ranking',
        filterTag: 'test-tag',
        limit: 10,
      };
      const novels = [createMockNovel(1), createMockNovel(2)];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 2,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchNovels).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: 'test-tag',
          sort: 'popular_desc',
          limit: 50, // Math.max(10 * 2, 50) = 50
        })
      );
    });

    it('should handle errors and log them', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
      };
      const error = new Error('Test error');
      mockClient.searchNovels.mockRejectedValue(error);

      await expect(handler.handle(target)).rejects.toThrow('Test error');

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'novel',
        'failed',
        expect.any(String)
      );
    });

    it('should handle NetworkError with cause and url', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
      };
      const cause = new Error('Connection failed');
      const error = new NetworkError('Rate limited', 'https://api.pixiv.net', cause);
      mockClient.searchNovels.mockRejectedValue(error);

      await expect(handler.handle(target)).rejects.toThrow();

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'novel',
        'failed',
        expect.stringContaining('Rate limited')
      );
    });

    it('should use filterTag when tag is not provided', async () => {
      const target: TargetConfig = {
        type: 'novel',
        filterTag: 'filter-tag',
        mode: 'search',
        limit: 10,
      };
      const novels = [createMockNovel(1)];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'filter-tag',
        'novel',
        'success',
        expect.any(String)
      );
    });

    it('should use unknown when neither tag nor filterTag is provided', async () => {
      const target: TargetConfig = {
        type: 'novel',
        mode: 'search',
        limit: 10,
      };
      const novels = [createMockNovel(1)];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'unknown',
        'novel',
        'success',
        expect.any(String)
      );
    });
  });

  describe('handleSingleNovel', () => {
    it('should handle single novel download', async () => {
      const target: TargetConfig = {
        type: 'novel',
        novelId: 12345,
      };
      const novelDetail = {
        id: 12345,
        title: 'Test Novel',
        user: { id: '12345', name: 'Test User' },
        create_date: '2023-06-15',
      };
      mockDatabase.hasDownloaded.mockReturnValue(false);
      mockClient.getNovelDetail.mockResolvedValue(novelDetail);
      mockNovelDownloader.download.mockResolvedValue(undefined);

      await handler.handle(target);

      expect(mockDatabase.hasDownloaded).toHaveBeenCalledWith('12345', 'novel');
      expect(mockClient.getNovelDetail).toHaveBeenCalledWith(12345);
      expect(mockNovelDownloader.download).toHaveBeenCalled();
    });

    it('should skip if novel already downloaded', async () => {
      const target: TargetConfig = {
        type: 'novel',
        novelId: 12345,
      };
      mockDatabase.hasDownloaded.mockReturnValue(true);

      await handler.handle(target);

      expect(mockDatabase.hasDownloaded).toHaveBeenCalledWith('12345', 'novel');
      expect(mockClient.getNovelDetail).not.toHaveBeenCalled();
      expect(mockNovelDownloader.download).not.toHaveBeenCalled();
    });

    it('should throw error for invalid novelId', async () => {
      const target: TargetConfig = {
        type: 'novel',
        novelId: NaN as any,
      };

      // The handler checks Number.isFinite(novelId) in handleSingleNovel
      // NaN is not finite, so it should throw
      await expect(handler.handle(target)).rejects.toThrow();
    });

    it('should handle errors during single novel download', async () => {
      const target: TargetConfig = {
        type: 'novel',
        novelId: 12345,
      };
      const error = new Error('Download failed');
      mockDatabase.hasDownloaded.mockReturnValue(false);
      mockClient.getNovelDetail.mockRejectedValue(error);

      await expect(handler.handle(target)).rejects.toThrow('Download failed');
    });
  });

  describe('handleSeries', () => {
    it('should handle series download', async () => {
      const target: TargetConfig = {
        type: 'novel',
        seriesId: 67890,
        limit: 5,
      };
      const novels = [
        createMockNovel(1),
        createMockNovel(2),
        createMockNovel(3),
      ];
      mockClient.getNovelSeries.mockResolvedValue(novels);
      mockDatabase.hasDownloaded.mockReturnValue(false);
      mockNovelDownloader.download.mockResolvedValue(undefined);

      await handler.handle(target);

      expect(mockClient.getNovelSeries).toHaveBeenCalledWith(67890);
      expect(mockNovelDownloader.download).toHaveBeenCalledTimes(3);
    });

    it('should respect limit when downloading series', async () => {
      const target: TargetConfig = {
        type: 'novel',
        seriesId: 67890,
        limit: 2,
      };
      const novels = [
        createMockNovel(1),
        createMockNovel(2),
        createMockNovel(3),
      ];
      mockClient.getNovelSeries.mockResolvedValue(novels);
      mockDatabase.hasDownloaded.mockReturnValue(false);
      mockNovelDownloader.download.mockResolvedValue(undefined);

      await handler.handle(target);

      expect(mockNovelDownloader.download).toHaveBeenCalledTimes(2);
    });

    it('should skip already downloaded novels in series', async () => {
      const target: TargetConfig = {
        type: 'novel',
        seriesId: 67890,
      };
      const novels = [
        createMockNovel(1),
        createMockNovel(2),
      ];
      mockClient.getNovelSeries.mockResolvedValue(novels);
      mockDatabase.hasDownloaded
        .mockReturnValueOnce(true)  // First novel already downloaded
        .mockReturnValueOnce(false); // Second novel not downloaded
      mockNovelDownloader.download.mockResolvedValue(undefined);

      await handler.handle(target);

      expect(mockNovelDownloader.download).toHaveBeenCalledTimes(1);
    });

    it('should continue on error for individual novels in series', async () => {
      const target: TargetConfig = {
        type: 'novel',
        seriesId: 67890,
      };
      const novels = [
        createMockNovel(1),
        createMockNovel(2),
      ];
      mockClient.getNovelSeries.mockResolvedValue(novels);
      mockDatabase.hasDownloaded.mockReturnValue(false);
      mockNovelDownloader.download
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(undefined);

      await handler.handle(target);

      expect(mockNovelDownloader.download).toHaveBeenCalledTimes(2);
    });

    it('should throw error for invalid seriesId', async () => {
      const target: TargetConfig = {
        type: 'novel',
        seriesId: NaN as any,
      };

      // The handler checks Number.isFinite(seriesId) in handleSeries
      // NaN is not finite, so it should throw
      await expect(handler.handle(target)).rejects.toThrow();
    });

    it('should handle errors when fetching series', async () => {
      const target: TargetConfig = {
        type: 'novel',
        seriesId: 67890,
      };
      const error = new Error('Series fetch failed');
      mockClient.getNovelSeries.mockRejectedValue(error);

      await expect(handler.handle(target)).rejects.toThrow('Series fetch failed');
    });
  });

  describe('fetchRankingNovels', () => {
    it('should use ranking service when filterTag is not provided', async () => {
      const target: TargetConfig = {
        type: 'novel',
        mode: 'ranking',
        rankingMode: 'day',
        rankingDate: '2023-06-15',
        limit: 10,
      };
      const novels = [createMockNovel(1)];
      mockRankingService.getRankingNovelsWithFallback.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockRankingService.getRankingNovelsWithFallback).toHaveBeenCalledWith(
        'day',
        '2023-06-15',
        10
      );
    });

    it('should use search API when filterTag is provided', async () => {
      const target: TargetConfig = {
        type: 'novel',
        mode: 'ranking',
        filterTag: 'test-tag',
        limit: 10,
      };
      const novels = Array.from({ length: 20 }, (_, i) => createMockNovel(i + 1));
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 10,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchNovels).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: 'test-tag',
          sort: 'popular_desc',
          limit: 50, // Math.max(10 * 2, 50) = 50
        })
      );
    });

    it('should limit results when filterTag is provided and results exceed limit', async () => {
      const target: TargetConfig = {
        type: 'novel',
        mode: 'ranking',
        filterTag: 'test-tag',
        limit: 5,
      };
      const novels = Array.from({ length: 20 }, (_, i) => createMockNovel(i + 1));
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 5,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchNovels).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50, // Math.max(5 * 2, 50) = 50
        })
      );
    });

    it('should handle YESTERDAY ranking date', async () => {
      const target: TargetConfig = {
        type: 'novel',
        mode: 'ranking',
        rankingMode: 'day',
        rankingDate: 'YESTERDAY',
        limit: 10,
      };
      const novels = [createMockNovel(1)];
      mockRankingService.getRankingNovelsWithFallback.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockRankingService.getRankingNovelsWithFallback).toHaveBeenCalledWith(
        'day',
        '2023-06-14', // getYesterdayDate() result
        10
      );
    });
  });

  describe('fetchSearchNovels', () => {
    it('should fetch search results with correct limit calculation for popular_desc', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        sort: 'popular_desc',
        limit: 10,
      };
      const novels = Array.from({ length: 20 }, (_, i) => createMockNovel(i + 1));
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 10,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchNovels).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20, // targetLimit * 2 = 10 * 2
        })
      );
    });

    it('should fetch search results with correct limit for small popular_desc limit', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        sort: 'popular_desc',
        limit: 3,
      };
      const novels = Array.from({ length: 100 }, (_, i) => createMockNovel(i + 1));
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 3,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchNovels).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100, // Math.max(3 * 20, 100) = 100
        })
      );
    });

    it('should fetch search results with correct limit for non-popular sort', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        sort: 'date_desc',
        limit: 10,
      };
      const novels = Array.from({ length: 20 }, (_, i) => createMockNovel(i + 1));
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 10,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchNovels).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20, // targetLimit * 2 = 10 * 2
        })
      );
    });

    it('should sort by popularity when sort is popular_desc', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        sort: 'popular_desc',
        limit: 5,
      };
      const novels = [
        { ...createMockNovel(1), total_bookmarks: 50, total_view: 500 },
        { ...createMockNovel(2), total_bookmarks: 100, total_view: 1000 },
        { ...createMockNovel(3), total_bookmarks: 200, total_view: 2000 },
      ];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 3,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sorted 3 matching novels by popularity')
      );
    });
  });

  describe('handleDownloadResult', () => {
    it('should log success when downloads are completed', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const novels = [createMockNovel(1), createMockNovel(2)];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 2,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'novel',
        'success',
        '2 items downloaded'
      );
    });

    it('should handle zero downloads when all were already downloaded', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const novels = [createMockNovel(1)];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 0,
        skipped: 0,
        alreadyDownloaded: 1,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'novel',
        'success',
        'All 1 items were already downloaded'
      );
    });

    it('should handle zero downloads when all were filtered out', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const novels = [createMockNovel(1)];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 0,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 1,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'novel',
        'success',
        expect.stringContaining('All 1 items were filtered out')
      );
    });

    it('should throw error when zero downloads and items were skipped', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const novels = [createMockNovel(1)];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 0,
        skipped: 1,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await expect(handler.handle(target)).rejects.toThrow();
    });

    it('should warn when downloaded count is less than 50% of limit', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const novels = Array.from({ length: 10 }, (_, i) => createMockNovel(i + 1));
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 3,
        skipped: 5,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Only downloaded 3 out of 10 requested novel(s)')
      );
    });

    it('should log skipped and already downloaded counts', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const novels = [createMockNovel(1), createMockNovel(2)];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 1,
        alreadyDownloaded: 1,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipped 1 novel(s) (already downloaded)')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipped 1 novel(s) (deleted, private, or inaccessible)')
      );
    });
  });

  describe('sortByPopularityAndLog', () => {
    it('should sort novels by popularity and log top N', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        sort: 'popular_desc',
        limit: 2,
      };
      const novels = [
        { ...createMockNovel(1), total_bookmarks: 50, total_view: 500 },
        { ...createMockNovel(2), total_bookmarks: 100, total_view: 1000 },
        { ...createMockNovel(3), total_bookmarks: 200, total_view: 2000 },
      ];
      mockClient.searchNovels.mockResolvedValue(novels);
      mockPipeline.run.mockResolvedValue({
        downloaded: 2,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      // Check that sorting was called (the novels array should be sorted)
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sorted 3 matching novels by popularity')
      );
      // Check for rank logs - they should be called with novel info
      const rankLogs = (logger.info as jest.Mock).mock.calls.filter(call =>
        call[0]?.includes('Rank')
      );
      expect(rankLogs.length).toBeGreaterThan(0);
    });

    it('should handle empty novels array', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test-tag',
        mode: 'search',
        sort: 'popular_desc',
        limit: 5,
      };
      mockClient.searchNovels.mockResolvedValue([]);
      mockPipeline.run.mockResolvedValue({
        downloaded: 0,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      // When no novels found and limit > 0, it should throw an error
      await expect(handler.handle(target)).rejects.toThrow();
    });
  });
});

