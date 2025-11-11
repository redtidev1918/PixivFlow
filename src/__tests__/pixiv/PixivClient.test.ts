/**
 * Tests for PixivClient
 */

import { PixivClient } from '../../pixiv/PixivClient';
import { PixivAuth } from '../../pixiv/AuthClient';
import { StandaloneConfig, TargetConfig } from '../../config';
import { PixivIllust, PixivNovel } from '../../pixiv/PixivClient';
import { NetworkError } from '../../utils/errors';

// Mock fetch
global.fetch = jest.fn();

// Mock delay function to speed up tests
jest.mock('node:timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));

// Mock PixivAuth
jest.mock('../../pixiv/AuthClient', () => ({
  PixivAuth: jest.fn().mockImplementation(() => ({
    getAccessToken: jest.fn().mockResolvedValue('mock_access_token'),
  })),
}));

const createMockConfig = (): StandaloneConfig => ({
  pixiv: {
    userAgent: 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)',
  },
  network: {
    retries: 3,
    timeoutMs: 30000,
  },
  download: {
    requestDelay: 3000,
  },
} as StandaloneConfig);

const createMockAuth = (): PixivAuth => {
  return new PixivAuth(
    {
      clientId: 'mock_client_id',
      clientSecret: 'mock_client_secret',
      deviceToken: 'mock_device_token',
      refreshToken: 'mock_refresh_token',
      userAgent: 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)',
    },
    { retries: 3, timeoutMs: 30000 },
    {
      getToken: jest.fn(),
      setToken: jest.fn(),
      clearToken: jest.fn(),
    } as any,
    '/test/config.json'
  );
};

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

describe('PixivClient', () => {
  let client: PixivClient;
  let auth: PixivAuth;
  let config: StandaloneConfig;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    config = createMockConfig();
    auth = createMockAuth();
    client = new PixivClient(auth, config);
    fetchMock = global.fetch as jest.Mock;
    fetchMock.mockClear();
  });

  describe('constructor', () => {
    it('should create client with auth and config', () => {
      expect(client).toBeInstanceOf(PixivClient);
    });

    it('should setup proxy agent when proxy is enabled', () => {
      const proxyConfig: StandaloneConfig = {
        ...createMockConfig(),
        network: {
          ...createMockConfig().network!,
          proxy: {
            enabled: true,
            host: 'proxy.example.com',
            port: 8080,
            protocol: 'http',
          },
        },
      };

      const proxyClient = new PixivClient(auth, proxyConfig);
      expect(proxyClient).toBeInstanceOf(PixivClient);
    });
  });

  describe('searchIllustrations', () => {
    it('should throw error when tag is missing', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        limit: 10,
      } as TargetConfig;

      await expect(client.searchIllustrations(target)).rejects.toThrow(
        'tag is required for illustration search'
      );
    });

    it('should search illustrations with tag', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
      } as TargetConfig;

      const mockResponse = {
        illusts: [
          createMockIllust(1, '2024-01-01T00:00:00+00:00'),
          createMockIllust(2, '2024-01-02T00:00:00+00:00'),
        ],
        next_url: null,
      };

      // Clear any previous mocks
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
        headers: new Headers(),
      } as Response);

      const results = await client.searchIllustrations(target);

      expect(results).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
      } as TargetConfig;

      // Clear any previous mocks
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: { message: 'Server error' } }),
        text: async () => JSON.stringify({ error: { message: 'Server error' } }),
        headers: new Headers(),
      } as Response);

      await expect(client.searchIllustrations(target)).rejects.toThrow();
    });

    it('should handle rate limit errors', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
      } as TargetConfig;

      // Clear any previous mocks
      fetchMock.mockClear();
      // Config has retries: 3, so maxAttempts = 3 + 1 = 4
      const maxAttempts = 4;
      // Mock all retry attempts to return 429
      for (let i = 0; i < maxAttempts; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({
            'retry-after': '60',
          }),
          text: async () => JSON.stringify({ error: { message: 'Rate limited' } }),
          json: async () => ({ error: { message: 'Rate limited' } }),
        } as Response);
      }

      // Should retry and eventually throw NetworkError
      await expect(client.searchIllustrations(target)).rejects.toThrow();
      // Should have attempted maxAttempts times (config.retries: 3 + 1 initial = 4)
      expect(fetchMock).toHaveBeenCalledTimes(maxAttempts);
    }, 30000); // Increase timeout to 30 seconds
  });

  describe('searchNovels', () => {
    it('should throw error when tag is missing', async () => {
      const target: TargetConfig = {
        type: 'novel',
        limit: 10,
      } as TargetConfig;

      await expect(client.searchNovels(target)).rejects.toThrow(
        'tag is required for novel search'
      );
    });

    it('should search novels with tag', async () => {
      const target: TargetConfig = {
        type: 'novel',
        tag: 'test_tag',
        limit: 10,
      } as TargetConfig;

      const mockResponse = {
        novels: [
          createMockNovel(1, '2024-01-01T00:00:00+00:00'),
          createMockNovel(2, '2024-01-02T00:00:00+00:00'),
        ],
        next_url: null,
      };

      // Clear any previous mocks
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
        headers: new Headers(),
      } as Response);

      const results = await client.searchNovels(target);

      expect(results).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getIllustDetail', () => {
    it('should get illustration detail', async () => {
      const illustId = 12345;
      const mockIllust = createMockIllust(illustId, '2024-01-01T00:00:00+00:00');
      const mockResponse = {
        illust: mockIllust,
      };

      // Clear any previous mocks
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
        headers: new Headers(),
      } as Response);

      const illust = await client.getIllustDetail(illustId);

      expect(illust).toBeDefined();
      expect(illust.id).toBe(illustId);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should handle 404 errors for illustrations', async () => {
      const illustId = 99999;

      // Clear any previous mocks
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: { message: 'Not found' } }),
        text: async () => JSON.stringify({ error: { message: 'Not found' } }),
        headers: new Headers(),
      } as Response);

      await expect(client.getIllustDetail(illustId)).rejects.toThrow();
    });
  });

  describe('getNovelText', () => {
    it('should get novel text', async () => {
      const novelId = 12345;
      const mockResponse = {
        novel_text: 'This is a test novel text.',
      };

      // Clear any previous mocks
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
        headers: new Headers(),
      } as Response);

      const response = await client.getNovelText(novelId);

      expect(response).toEqual(mockResponse);
      expect(response.novel_text).toBe('This is a test novel text.');
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should handle 404 errors for novels', async () => {
      const novelId = 99999;

      // Clear any previous mocks
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: { message: 'Not found' } }),
        text: async () => JSON.stringify({ error: { message: 'Not found' } }),
        headers: new Headers(),
      } as Response);

      await expect(client.getNovelText(novelId)).rejects.toThrow();
    });
  });

  describe('date filtering', () => {
    it('should filter results by date range', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      } as TargetConfig;

      const mockResponse = {
        illusts: [
          createMockIllust(1, '2024-01-15T00:00:00+00:00'), // Within range
          createMockIllust(2, '2024-02-15T00:00:00+00:00'), // Outside range
          createMockIllust(3, '2024-01-20T00:00:00+00:00'), // Within range
        ],
        next_url: null,
      };

      // Clear any previous mocks
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
        headers: new Headers(),
      } as Response);

      const results = await client.searchIllustrations(target);

      // Should only include items within date range
      expect(results.length).toBeLessThanOrEqual(2);
      results.forEach((illust) => {
        const date = new Date(illust.create_date);
        expect(date.getTime()).toBeGreaterThanOrEqual(
          new Date('2024-01-01').getTime()
        );
        expect(date.getTime()).toBeLessThanOrEqual(
          new Date('2024-01-31').getTime()
        );
      });
    });
  });

  describe('sorting', () => {
    it('should sort results by date descending by default', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
      } as TargetConfig;

      const mockResponse = {
        illusts: [
          createMockIllust(1, '2024-01-01T00:00:00+00:00'),
          createMockIllust(2, '2024-01-03T00:00:00+00:00'),
          createMockIllust(3, '2024-01-02T00:00:00+00:00'),
        ],
        next_url: null,
      };

      // Clear any previous mocks
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
        headers: new Headers(),
      } as Response);

      const results = await client.searchIllustrations(target);

      // Should be sorted by date descending (newest first)
      expect(results[0].id).toBe(2); // 2024-01-03
      expect(results[1].id).toBe(3); // 2024-01-02
      expect(results[2].id).toBe(1); // 2024-01-01
    });

    it('should sort results by popularity when specified', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
        sort: 'popular_desc',
      } as TargetConfig;

      const mockResponse = {
        illusts: [
          createMockIllust(1, '2024-01-01T00:00:00+00:00'),
          createMockIllust(2, '2024-01-02T00:00:00+00:00'),
          createMockIllust(3, '2024-01-03T00:00:00+00:00'),
        ],
        next_url: null,
      };

      // Modify popularity scores
      mockResponse.illusts[0].total_bookmarks = 300;
      mockResponse.illusts[1].total_bookmarks = 100;
      mockResponse.illusts[2].total_bookmarks = 200;

      // Clear any previous mocks
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
        headers: new Headers(),
      } as Response);

      const results = await client.searchIllustrations(target);

      // Should be sorted by popularity descending
      expect(results[0].id).toBe(1); // Highest popularity (300)
      expect(results[1].id).toBe(3); // Medium popularity (200)
      expect(results[2].id).toBe(2); // Lowest popularity (100)
    });
  });

  describe('error handling', () => {
    it('should retry on network errors', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
      } as TargetConfig;

      // Clear any previous mocks
      fetchMock.mockClear();
      // First call fails, second succeeds
      fetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ illusts: [], next_url: null }),
          text: async () => JSON.stringify({ illusts: [], next_url: null }),
          headers: new Headers(),
        } as Response);

      const results = await client.searchIllustrations(target);

      expect(results).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test_tag',
        limit: 10,
      } as TargetConfig;

      // Clear any previous mocks
      fetchMock.mockClear();
      // Config has retries: 3, so maxAttempts = 3 + 1 = 4
      const maxAttempts = 4;
      // All calls fail
      for (let i = 0; i < maxAttempts; i++) {
        fetchMock.mockRejectedValueOnce(new Error('Network error'));
      }

      await expect(client.searchIllustrations(target)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(maxAttempts); // Max retries (config.retries: 3 + 1 initial = 4)
    });
  });

  describe('getUser', () => {
    it('should get user profile', async () => {
      const mockUser = {
        id: '12345',
        name: 'Test User',
        account: 'testuser',
        profile_image_urls: {
          px_16x16: 'https://example.com/16x16.jpg',
          px_50x50: 'https://example.com/50x50.jpg',
          px_170x170: 'https://example.com/170x170.jpg',
        },
      };

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user_profile: { user: mockUser } }),
        text: async () => JSON.stringify({ user_profile: { user: mockUser } }),
        headers: new Headers(),
      } as Response);

      const user = await client.getUser();

      expect(user).toEqual(mockUser);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should handle errors when getting user', async () => {
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: { message: 'Server error' } }),
        text: async () => JSON.stringify({ error: { message: 'Server error' } }),
        headers: new Headers(),
      } as Response);

      await expect(client.getUser()).rejects.toThrow();
    });
  });

  describe('getIllustration', () => {
    it('should get illustration by id', async () => {
      const illustId = 12345;
      const mockIllust = createMockIllust(illustId, '2024-01-01T00:00:00+00:00');

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ illust: mockIllust }),
        text: async () => JSON.stringify({ illust: mockIllust }),
        headers: new Headers(),
      } as Response);

      const illust = await client.getIllustration(illustId);

      expect(illust).toEqual(mockIllust);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getNovel', () => {
    it('should get novel by id', async () => {
      const novelId = 12345;
      const mockNovel = createMockNovel(novelId, '2024-01-01T00:00:00+00:00');

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ novel: mockNovel }),
        text: async () => JSON.stringify({ novel: mockNovel }),
        headers: new Headers(),
      } as Response);

      const novel = await client.getNovel(novelId);

      expect(novel).toEqual(mockNovel);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getUserIllustrations', () => {
    it('should get user illustrations', async () => {
      const userId = '12345';
      const mockIllusts = [
        createMockIllust(1, '2024-01-01T00:00:00+00:00'),
        createMockIllust(2, '2024-01-02T00:00:00+00:00'),
      ];

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ illusts: mockIllusts, next_url: null }),
        text: async () => JSON.stringify({ illusts: mockIllusts, next_url: null }),
        headers: new Headers(),
      } as Response);

      const illusts = await client.getUserIllustrations(userId);

      expect(illusts).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should get user illustrations with options', async () => {
      const userId = '12345';
      const mockIllusts = [createMockIllust(1, '2024-01-01T00:00:00+00:00')];

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ illusts: mockIllusts, next_url: null }),
        text: async () => JSON.stringify({ illusts: mockIllusts, next_url: null }),
        headers: new Headers(),
      } as Response);

      const illusts = await client.getUserIllustrations(userId, { limit: 10, offset: 0 });

      expect(illusts).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getUserNovels', () => {
    it('should get user novels', async () => {
      const userId = '12345';
      const mockNovels = [
        createMockNovel(1, '2024-01-01T00:00:00+00:00'),
        createMockNovel(2, '2024-01-02T00:00:00+00:00'),
      ];

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ novels: mockNovels, next_url: null }),
        text: async () => JSON.stringify({ novels: mockNovels, next_url: null }),
        headers: new Headers(),
      } as Response);

      const novels = await client.getUserNovels(userId);

      expect(novels).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should get user novels with options', async () => {
      const userId = '12345';
      const mockNovels = [createMockNovel(1, '2024-01-01T00:00:00+00:00')];

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ novels: mockNovels, next_url: null }),
        text: async () => JSON.stringify({ novels: mockNovels, next_url: null }),
        headers: new Headers(),
      } as Response);

      const novels = await client.getUserNovels(userId, { limit: 10, offset: 0 });

      expect(novels).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getRankingIllustrations', () => {
    it('should get ranking illustrations with default mode', async () => {
      const mockIllusts = [
        createMockIllust(1, '2024-01-01T00:00:00+00:00'),
        createMockIllust(2, '2024-01-02T00:00:00+00:00'),
      ];

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ illusts: mockIllusts, next_url: null }),
        text: async () => JSON.stringify({ illusts: mockIllusts, next_url: null }),
        headers: new Headers(),
      } as Response);

      const illusts = await client.getRankingIllustrations();

      expect(illusts).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should get ranking illustrations with custom mode and date', async () => {
      const mockIllusts = [createMockIllust(1, '2024-01-01T00:00:00+00:00')];

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ illusts: mockIllusts, next_url: null }),
        text: async () => JSON.stringify({ illusts: mockIllusts, next_url: null }),
        headers: new Headers(),
      } as Response);

      const illusts = await client.getRankingIllustrations('week', '2024-01-01', 10);

      expect(illusts).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getRankingNovels', () => {
    it('should get ranking novels with default mode', async () => {
      const mockNovels = [
        createMockNovel(1, '2024-01-01T00:00:00+00:00'),
        createMockNovel(2, '2024-01-02T00:00:00+00:00'),
      ];

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ novels: mockNovels, next_url: null }),
        text: async () => JSON.stringify({ novels: mockNovels, next_url: null }),
        headers: new Headers(),
      } as Response);

      const novels = await client.getRankingNovels();

      expect(novels).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should get ranking novels with custom mode and date', async () => {
      const mockNovels = [createMockNovel(1, '2024-01-01T00:00:00+00:00')];

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ novels: mockNovels, next_url: null }),
        text: async () => JSON.stringify({ novels: mockNovels, next_url: null }),
        headers: new Headers(),
      } as Response);

      const novels = await client.getRankingNovels('week', '2024-01-01', 10);

      expect(novels).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getIllustDetailWithTags', () => {
    it('should get illustration detail with tags', async () => {
      const illustId = 12345;
      const mockIllust = createMockIllust(illustId, '2024-01-01T00:00:00+00:00');
      const mockTags = [
        { name: 'tag1' },
        { name: 'tag2', translated_name: 'タグ2' },
      ];
      const mockResponse = {
        illust: {
          ...mockIllust,
          tags: mockTags,
        },
      };

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
        headers: new Headers(),
      } as Response);

      const result = await client.getIllustDetailWithTags(illustId);

      expect(result.illust).toBeDefined();
      expect(result.tags).toEqual(mockTags);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getNovelDetailWithTags', () => {
    it('should get novel detail with tags', async () => {
      const novelId = 12345;
      const mockNovel = createMockNovel(novelId, '2024-01-01T00:00:00+00:00');
      const mockTags = [
        { name: 'tag1' },
        { name: 'tag2', translated_name: 'タグ2' },
      ];
      const mockResponse = {
        novel: {
          ...mockNovel,
          tags: mockTags,
        },
      };

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
        headers: new Headers(),
      } as Response);

      const result = await client.getNovelDetailWithTags(novelId);

      expect(result.novel).toBeDefined();
      expect(result.tags).toEqual(mockTags);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getNovelDetail', () => {
    it('should get novel detail', async () => {
      const novelId = 12345;
      const mockNovel = createMockNovel(novelId, '2024-01-01T00:00:00+00:00');

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ novel: mockNovel }),
        text: async () => JSON.stringify({ novel: mockNovel }),
        headers: new Headers(),
      } as Response);

      const novel = await client.getNovelDetail(novelId);

      expect(novel).toEqual(mockNovel);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('getNovelSeries', () => {
    it('should get novel series', async () => {
      const seriesId = 12345;
      const mockNovels = [
        createMockNovel(1, '2024-01-01T00:00:00+00:00'),
        createMockNovel(2, '2024-01-02T00:00:00+00:00'),
      ];

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ novel_series_detail: { series_content: mockNovels } }),
        text: async () => JSON.stringify({ novel_series_detail: { series_content: mockNovels } }),
        headers: new Headers(),
      } as Response);

      const novels = await client.getNovelSeries(seriesId);

      expect(novels).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('downloadImage', () => {
    it('should download image', async () => {
      const imageUrl = 'https://example.com/image.jpg';
      const mockArrayBuffer = new ArrayBuffer(1024);

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockArrayBuffer,
        headers: new Headers(),
      } as Response);

      const result = await client.downloadImage(imageUrl);

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should handle download errors', async () => {
      const imageUrl = 'https://example.com/image.jpg';

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      } as Response);

      await expect(client.downloadImage(imageUrl)).rejects.toThrow();
    });
  });
});

