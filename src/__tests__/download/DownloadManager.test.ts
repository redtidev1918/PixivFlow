/**
 * Tests for DownloadManager
 */

import { DownloadManager } from '../../download/DownloadManager';
import { PixivClient, PixivIllust, PixivNovel } from '../../pixiv/PixivClient';
import { Database } from '../../storage/Database';
import { FileService } from '../../download/FileService';
import { StandaloneConfig, TargetConfig } from '../../config';

// Mock dependencies
jest.mock('../../pixiv/PixivClient');
jest.mock('../../storage/Database');
jest.mock('../../download/FileService');
jest.mock('../../utils/language-detection', () => ({
  detectLanguage: jest.fn().mockResolvedValue({
    code: 'en',
    name: 'English',
    is_chinese: false,
  }),
}));

// Mock delay function to speed up tests
jest.mock('node:timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));

// Mock global setTimeout to prevent hanging in tests
// Use jest.useFakeTimers() to control timers in tests
beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

// Mock setTimeout to execute immediately in tests
jest.spyOn(global, 'setTimeout').mockImplementation((callback: Function, delay?: number) => {
  // Execute callback immediately in tests to avoid delays
  if (typeof callback === 'function') {
    Promise.resolve().then(() => callback());
  }
  return {} as NodeJS.Timeout;
});

// Mock fs module
jest.mock('node:fs', () => ({
  promises: {
    readdir: jest.fn().mockResolvedValue([]),
  },
}));

const createMockConfig = (): StandaloneConfig => ({
  pixiv: {
    clientId: 'mock_client_id',
    clientSecret: 'mock_client_secret',
    deviceToken: 'mock_device_token',
    refreshToken: 'mock_refresh_token',
    userAgent: 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)',
  },
  network: {
    retries: 3,
    timeoutMs: 30000,
  },
  download: {
    requestDelay: 3000,
  },
  storage: {
    downloadDirectory: '/test/downloads',
    illustrationDirectory: '/test/downloads/illustrations',
    novelDirectory: '/test/downloads/novels',
  },
  targets: [],
} as StandaloneConfig);

const createMockIllust = (id: number, date: string): PixivIllust => ({
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
  create_date: date,
  total_bookmarks: 100,
  total_view: 1000,
});

const createMockNovel = (id: number, date: string): PixivNovel => ({
  id,
  title: `Novel ${id}`,
  user: {
    id: '12345',
    name: 'Test User',
  },
  create_date: date,
  total_bookmarks: 50,
  total_view: 500,
});

describe('DownloadManager', () => {
  let manager: DownloadManager;
  let mockClient: jest.Mocked<PixivClient>;
  let mockDatabase: jest.Mocked<Database>;
  let mockFileService: jest.Mocked<FileService>;
  let config: StandaloneConfig;

  beforeEach(() => {
    config = createMockConfig();
    
    // Create mocks
    mockClient = {
      searchIllustrations: jest.fn(),
      searchNovels: jest.fn(),
      getIllustDetail: jest.fn(),
      getIllustDetailWithTags: jest.fn(),
      getNovelText: jest.fn(),
      getNovelDetailWithTags: jest.fn(),
      downloadImage: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    } as any;

    mockDatabase = {
      getDownloadedIds: jest.fn().mockReturnValue(new Set()),
      addDownloadRecord: jest.fn(),
      insertDownload: jest.fn(),
      isDownloaded: jest.fn().mockReturnValue(false),
      hasDownloaded: jest.fn().mockReturnValue(false),
      logExecution: jest.fn(),
    } as any;

    mockFileService = {
      initialise: jest.fn().mockResolvedValue(undefined),
      saveIllustration: jest.fn().mockResolvedValue('/test/path'),
      saveNovel: jest.fn().mockResolvedValue('/test/path'),
      saveText: jest.fn().mockResolvedValue('/test/path/novel.txt'),
      saveImage: jest.fn().mockResolvedValue('/test/path/image.jpg'),
      saveMetadata: jest.fn().mockResolvedValue(undefined),
      sanitizeFileName: jest.fn((name: string) => name),
    } as any;

    manager = new DownloadManager(config, mockClient, mockDatabase, mockFileService);
  });

  describe('constructor', () => {
    it('should create manager with dependencies', () => {
      expect(manager).toBeInstanceOf(DownloadManager);
    });
  });

  describe('initialise', () => {
    it('should initialise file service', async () => {
      await manager.initialise();
      expect(mockFileService.initialise).toHaveBeenCalled();
    });
  });

  describe('setProgressCallback', () => {
    it('should set progress callback', () => {
      const callback = jest.fn();
      manager.setProgressCallback(callback);
      // Callback is set, test by running a target
      expect(() => manager.setProgressCallback(callback)).not.toThrow();
    });
  });

  describe('runAllTargets', () => {
    it('should handle empty targets', async () => {
      config.targets = [];
      await expect(manager.runAllTargets()).resolves.not.toThrow();
    });

    it('should process illustration target', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
      };

      config.targets = [target];

      mockClient.searchIllustrations = jest.fn().mockResolvedValue([
        createMockIllust(1, '2024-01-01T00:00:00+00:00'),
      ]);

      const mockIllust = createMockIllust(1, '2024-01-01T00:00:00+00:00');
      mockClient.getIllustDetailWithTags = jest.fn().mockResolvedValue({
        illust: {
          ...mockIllust,
          meta_single_page: {},
          meta_pages: [],
        },
        tags: [],
      });

      await manager.runAllTargets();

      // The actual call may have a modified limit for optimization, so just check that it was called
      expect(mockClient.searchIllustrations).toHaveBeenCalled();
      // Check that the call includes the tag
      expect(mockClient.searchIllustrations).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: target.tag,
          type: target.type,
        })
      );
    });

    it('should process novel target', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test_tag',
        limit: 10,
      };

      config.targets = [target];

      const mockNovel = createMockNovel(1, '2024-01-01T00:00:00+00:00');
      mockClient.searchNovels = jest.fn().mockResolvedValue([mockNovel]);

      mockClient.getNovelDetailWithTags = jest.fn().mockResolvedValue({
        novel: mockNovel,
        tags: [],
      });

      mockClient.getNovelText = jest.fn().mockResolvedValue('Test novel text');

      await manager.runAllTargets();

      // The actual call may have a modified limit for optimization, so just check that it was called
      expect(mockClient.searchNovels).toHaveBeenCalled();
      // Check that the call includes the tag
      expect(mockClient.searchNovels).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: target.tag,
          type: target.type,
        })
      );
    });

    it('should continue on error and process remaining targets', async () => {
      const target1: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag_1',
        limit: 10,
      };

      const target2: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag_2',
        limit: 10,
      };

      config.targets = [target1, target2];

      // First target fails
      mockClient.searchIllustrations = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([
          createMockIllust(2, '2024-01-01T00:00:00+00:00'),
        ]);

      const mockIllust2 = createMockIllust(2, '2024-01-01T00:00:00+00:00');
      mockClient.getIllustDetailWithTags = jest.fn().mockResolvedValue({
        illust: {
          ...mockIllust2,
          meta_single_page: {},
          meta_pages: [],
        },
        tags: [],
      });

      await manager.runAllTargets();

      // Should have attempted both targets
      expect(mockClient.searchIllustrations).toHaveBeenCalledTimes(2);
    });

    it('should throw error when all targets fail', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
      };

      config.targets = [target];

      mockClient.searchIllustrations = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(manager.runAllTargets()).rejects.toThrow('All 1 target(s) failed');
    });
  });

  describe('filtering', () => {
    it('should filter by minBookmarks', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
        minBookmarks: 150,
      };

      config.targets = [target];

      const illusts = [
        createMockIllust(1, '2024-01-01T00:00:00+00:00'),
        createMockIllust(2, '2024-01-02T00:00:00+00:00'),
      ];

      // Set bookmarks
      illusts[0].total_bookmarks = 100; // Below threshold
      illusts[1].total_bookmarks = 200; // Above threshold

      mockClient.searchIllustrations = jest.fn().mockResolvedValue(illusts);

      mockClient.getIllustDetailWithTags = jest.fn().mockImplementation((id: number) => {
        const illust = illusts.find(i => i.id === id);
        return Promise.resolve({
          illust: {
            ...illust!,
            meta_single_page: {
              original_image_url: `https://example.com/original_${id}.jpg`,
            },
            meta_pages: [],
          },
          tags: [],
        });
      });

      await manager.runAllTargets();

      // Should only download illust with bookmarks >= 150
      expect(mockClient.getIllustDetailWithTags).toHaveBeenCalledWith(2);
      expect(mockClient.getIllustDetailWithTags).not.toHaveBeenCalledWith(1);
    });

    it('should filter by date range', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
        startDate: '2024-01-15',
        endDate: '2024-01-20',
      };

      config.targets = [target];

      const illusts = [
        createMockIllust(1, '2024-01-10T00:00:00+00:00'), // Before range
        createMockIllust(2, '2024-01-18T00:00:00+00:00'), // In range
        createMockIllust(3, '2024-01-25T00:00:00+00:00'), // After range
      ];

      mockClient.searchIllustrations = jest.fn().mockResolvedValue(illusts);

      mockClient.getIllustDetailWithTags = jest.fn().mockImplementation((id: number) => {
        const illust = illusts.find(i => i.id === id);
        return Promise.resolve({
          illust: {
            ...illust!,
            meta_single_page: {
              original_image_url: `https://example.com/original_${id}.jpg`,
            },
            meta_pages: [],
          },
          tags: [],
        });
      });

      await manager.runAllTargets();

      // Should only download illust within date range
      expect(mockClient.getIllustDetailWithTags).toHaveBeenCalledWith(2);
      expect(mockClient.getIllustDetailWithTags).not.toHaveBeenCalledWith(1);
      expect(mockClient.getIllustDetailWithTags).not.toHaveBeenCalledWith(3);
    });
  });

  describe('error handling', () => {
    it('should skip already downloaded items', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
      };

      config.targets = [target];

      const illusts = [
        createMockIllust(1, '2024-01-01T00:00:00+00:00'),
        createMockIllust(2, '2024-01-02T00:00:00+00:00'),
      ];

      mockClient.searchIllustrations = jest.fn().mockResolvedValue(illusts);

      // Mock database to return illust 1 as already downloaded
      mockDatabase.getDownloadedIds = jest.fn().mockReturnValue(new Set(['1']));

      // Mock getIllustDetail for illust 2 (not downloaded)
      mockClient.getIllustDetailWithTags = jest.fn().mockImplementation((id: number) => {
        const illust = illusts.find(i => i.id === id);
        return Promise.resolve({
          illust: {
            ...illust!,
            meta_single_page: {
              original_image_url: `https://example.com/original_${id}.jpg`,
            },
            meta_pages: [],
          },
          tags: [],
        });
      });

      await manager.runAllTargets();

      // Should not download already downloaded illust
      expect(mockClient.getIllustDetailWithTags).not.toHaveBeenCalledWith(1);
      // Should download illust 2
      expect(mockClient.getIllustDetailWithTags).toHaveBeenCalledWith(2);
    });

    it('should handle 404 errors gracefully', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
      };

      config.targets = [target];

      const illusts = [
        createMockIllust(1, '2024-01-01T00:00:00+00:00'),
        createMockIllust(2, '2024-01-02T00:00:00+00:00'), // Add another illust to ensure at least one succeeds
      ];

      mockClient.searchIllustrations = jest.fn().mockResolvedValue(illusts);

      // Mock 404 error for illust 1, success for illust 2
      const { NetworkError } = require('../../utils/errors');
      mockClient.getIllustDetailWithTags = jest.fn().mockImplementation((id: number) => {
        if (id === 1) {
          return Promise.reject(new NetworkError('404 Not Found', 'https://example.com', undefined));
        }
        const illust = illusts.find(i => i.id === id);
        return Promise.resolve({
          illust: {
            ...illust!,
            meta_single_page: {},
            meta_pages: [],
          },
          tags: [],
        });
      });

      await manager.runAllTargets();

      // Should continue without throwing
      expect(mockClient.getIllustDetailWithTags).toHaveBeenCalled();
      // Should have attempted both illusts
      expect(mockClient.getIllustDetailWithTags).toHaveBeenCalledWith(1);
      expect(mockClient.getIllustDetailWithTags).toHaveBeenCalledWith(2);
    });
  });
});

