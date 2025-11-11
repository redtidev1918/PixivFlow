import { IllustrationTargetHandler } from '../../../download/handlers/IllustrationTargetHandler';
import { TargetConfig } from '../../../config';
import { IPixivClient } from '../../../interfaces/IPixivClient';
import { IDatabase } from '../../../interfaces/IDatabase';
import { RankingService } from '../../../download/RankingService';
import { IllustrationDownloader } from '../../../download/IllustrationDownloader';
import { DownloadPipeline } from '../../../download/pipeline/DownloadPipeline';
import { PixivIllust } from '../../../pixiv/PixivClient';
import { NetworkError } from '../../../utils/errors';
import { logger } from '../../../logger';

// Mock dependencies
jest.mock('../../../logger');
jest.mock('../../../utils/pixiv-date-utils', () => ({
  getTodayDate: jest.fn().mockReturnValue('2023-06-15'),
  getYesterdayDate: jest.fn().mockReturnValue('2023-06-14'),
}));

describe('IllustrationTargetHandler', () => {
  let handler: IllustrationTargetHandler;
  let mockClient: jest.Mocked<IPixivClient>;
  let mockDatabase: jest.Mocked<IDatabase>;
  let mockRankingService: jest.Mocked<RankingService>;
  let mockIllustrationDownloader: jest.Mocked<IllustrationDownloader>;
  let mockPipeline: jest.Mocked<DownloadPipeline>;

  const createMockIllust = (id: number): PixivIllust => ({
    id,
    title: `Illust ${id}`,
    page_count: 1,
    user: {
      id: '12345',
      name: 'Test User',
    },
    image_urls: {
      square_medium: `https://example.com/${id}_square.jpg`,
      medium: `https://example.com/${id}_medium.jpg`,
      large: `https://example.com/${id}_large.jpg`,
    },
    create_date: '2023-06-15',
    total_bookmarks: 100,
    total_view: 1000,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      searchIllustrations: jest.fn(),
    } as any;

    mockDatabase = {
      logExecution: jest.fn(),
    } as any;

    mockRankingService = {
      getRankingIllustrationsWithFallback: jest.fn(),
    } as any;

    mockIllustrationDownloader = {
      downloadIllustration: jest.fn(),
    } as any;

    mockPipeline = {
      run: jest.fn(),
    } as any;

    handler = new IllustrationTargetHandler(
      mockClient,
      mockDatabase,
      mockRankingService,
      mockIllustrationDownloader,
      mockPipeline
    );
  });

  describe('handle', () => {
    it('should handle search mode target', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const illusts = [createMockIllust(1), createMockIllust(2)];
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 2,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchIllustrations).toHaveBeenCalled();
      expect(mockPipeline.run).toHaveBeenCalled();
      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'illustration',
        'success',
        expect.stringContaining('2 items downloaded')
      );
    });

    it('should handle ranking mode target', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        mode: 'ranking',
        limit: 10,
      };
      const illusts = [createMockIllust(1)];
      mockRankingService.getRankingIllustrationsWithFallback.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockRankingService.getRankingIllustrationsWithFallback).toHaveBeenCalled();
      expect(mockPipeline.run).toHaveBeenCalled();
    });

    it('should handle ranking mode with filterTag', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        mode: 'ranking',
        filterTag: 'test-tag',
        limit: 10,
      };
      const illusts = [createMockIllust(1), createMockIllust(2)];
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 2,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchIllustrations).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: 'test-tag',
          sort: 'popular_desc',
        })
      );
    });

    it('should handle errors and log them', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
      };
      const error = new Error('Test error');
      mockClient.searchIllustrations.mockRejectedValue(error);

      await expect(handler.handle(target)).rejects.toThrow('Test error');

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'illustration',
        'failed',
        expect.any(String)
      );
    });

    it('should handle NetworkError with cause and url', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
      };
      const cause = new Error('Connection failed');
      const error = new NetworkError('Rate limited', 'https://api.pixiv.net', cause);
      mockClient.searchIllustrations.mockRejectedValue(error);

      await expect(handler.handle(target)).rejects.toThrow();

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'illustration',
        'failed',
        expect.stringContaining('Rate limited')
      );
    });

    it('should use filterTag when tag is not provided', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        filterTag: 'filter-tag',
        mode: 'search',
        limit: 10,
      };
      const illusts = [createMockIllust(1)];
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'filter-tag',
        'illustration',
        'success',
        expect.any(String)
      );
    });

    it('should use unknown when neither tag nor filterTag is provided', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        mode: 'search',
        limit: 10,
      };
      const illusts = [createMockIllust(1)];
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'unknown',
        'illustration',
        'success',
        expect.any(String)
      );
    });
  });

  describe('fetchRankingIllustrations', () => {
    it('should use ranking service when filterTag is not provided', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        mode: 'ranking',
        rankingMode: 'day',
        rankingDate: '2023-06-15',
        limit: 10,
      };
      const illusts = [createMockIllust(1)];
      mockRankingService.getRankingIllustrationsWithFallback.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockRankingService.getRankingIllustrationsWithFallback).toHaveBeenCalledWith(
        'day',
        '2023-06-15',
        10
      );
    });

    it('should use search API when filterTag is provided', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        mode: 'ranking',
        filterTag: 'test-tag',
        limit: 10,
      };
      const illusts = Array.from({ length: 20 }, (_, i) => createMockIllust(i + 1));
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 10,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchIllustrations).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: 'test-tag',
          sort: 'popular_desc',
          limit: 50, // Math.max(10 * 2, 50) = 50
        })
      );
    });

    it('should limit results when filterTag is provided and results exceed limit', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        mode: 'ranking',
        filterTag: 'test-tag',
        limit: 5,
      };
      const illusts = Array.from({ length: 20 }, (_, i) => createMockIllust(i + 1));
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 5,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchIllustrations).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50, // Math.max(5 * 2, 50) = 50
        })
      );
    });

    it('should handle YESTERDAY ranking date', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        mode: 'ranking',
        rankingMode: 'day',
        rankingDate: 'YESTERDAY',
        limit: 10,
      };
      const illusts = [createMockIllust(1)];
      mockRankingService.getRankingIllustrationsWithFallback.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockRankingService.getRankingIllustrationsWithFallback).toHaveBeenCalledWith(
        'day',
        '2023-06-14', // getYesterdayDate() result
        10
      );
    });
  });

  describe('fetchSearchIllustrations', () => {
    it('should fetch search results with correct limit calculation for popular_desc', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        sort: 'popular_desc',
        limit: 10,
      };
      const illusts = Array.from({ length: 20 }, (_, i) => createMockIllust(i + 1));
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 10,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchIllustrations).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20, // targetLimit * 2 = 10 * 2
        })
      );
    });

    it('should fetch search results with correct limit for small popular_desc limit', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        sort: 'popular_desc',
        limit: 3,
      };
      const illusts = Array.from({ length: 100 }, (_, i) => createMockIllust(i + 1));
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 3,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchIllustrations).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100, // Math.max(3 * 20, 100) = 100
        })
      );
    });

    it('should fetch search results with correct limit for non-popular sort', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        sort: 'date_desc',
        limit: 10,
      };
      const illusts = Array.from({ length: 20 }, (_, i) => createMockIllust(i + 1));
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 10,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockClient.searchIllustrations).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20, // targetLimit * 2 = 10 * 2
        })
      );
    });

    it('should sort by popularity when sort is popular_desc', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        sort: 'popular_desc',
        limit: 5,
      };
      const illusts = [
        { ...createMockIllust(1), total_bookmarks: 50, total_view: 500 },
        { ...createMockIllust(2), total_bookmarks: 100, total_view: 1000 },
        { ...createMockIllust(3), total_bookmarks: 200, total_view: 2000 },
      ];
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 3,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sorted 3 matching illustrations by popularity')
      );
    });
  });

  describe('handleDownloadResult', () => {
    it('should log success when downloads are completed', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const illusts = [createMockIllust(1), createMockIllust(2)];
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 2,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'illustration',
        'success',
        '2 items downloaded'
      );
    });

    it('should handle zero downloads when all were already downloaded', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const illusts = [createMockIllust(1)];
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 0,
        skipped: 0,
        alreadyDownloaded: 1,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'illustration',
        'success',
        'All 1 items were already downloaded'
      );
    });

    it('should handle zero downloads when all were filtered out', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const illusts = [createMockIllust(1)];
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 0,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 1,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'illustration',
        'success',
        expect.stringContaining('All 1 items were filtered out')
      );
    });

    it('should handle zero downloads when no items found', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      mockClient.searchIllustrations.mockResolvedValue([]);
      mockPipeline.run.mockResolvedValue({
        downloaded: 0,
        skipped: 0,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(mockDatabase.logExecution).toHaveBeenCalledWith(
        'test-tag',
        'illustration',
        'success',
        'No matching illustrations found'
      );
    });

    it('should throw error when zero downloads and items were skipped', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const illusts = [createMockIllust(1)];
      mockClient.searchIllustrations.mockResolvedValue(illusts);
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
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const illusts = Array.from({ length: 10 }, (_, i) => createMockIllust(i + 1));
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 3,
        skipped: 5,
        alreadyDownloaded: 0,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Only downloaded 3 out of 10 requested illustration(s)')
      );
    });

    it('should log skipped and already downloaded counts', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test-tag',
        mode: 'search',
        limit: 10,
      };
      const illusts = [createMockIllust(1), createMockIllust(2)];
      mockClient.searchIllustrations.mockResolvedValue(illusts);
      mockPipeline.run.mockResolvedValue({
        downloaded: 1,
        skipped: 1,
        alreadyDownloaded: 1,
        filteredOut: 0,
      });

      await handler.handle(target);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipped 1 illustration(s) (already downloaded)')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipped 1 illustration(s) (deleted, private, or inaccessible)')
      );
    });
  });
});

