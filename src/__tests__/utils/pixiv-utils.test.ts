/**
 * Unit tests for Pixiv utility functions
 */

import { calculatePopularityScore, parsePixivDate } from '../../utils/pixiv-utils';
import { PixivIllust, PixivNovel } from '../../pixiv/PixivClient';

describe('pixiv-utils', () => {
  describe('calculatePopularityScore', () => {
    it('should calculate score from bookmarks and views', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
        total_bookmarks: 100,
        total_view: 5000,
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(100 + (5000 / 1000)); // 100 + 5 = 105
    });

    it('should use bookmark_count if total_bookmarks is missing', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
        bookmark_count: 50,
        total_view: 2000,
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(50 + (2000 / 1000)); // 50 + 2 = 52
    });

    it('should use view_count if total_view is missing', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
        total_bookmarks: 100,
        view_count: 3000,
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(100 + (3000 / 1000)); // 100 + 3 = 103
    });

    it('should handle missing values gracefully', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(0);
    });

    it('should handle null values', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
        total_bookmarks: undefined,
        total_view: undefined,
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(0);
    });

    it('should handle undefined values', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
        total_bookmarks: undefined,
        total_view: undefined,
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(0);
    });

    it('should handle NaN values', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
        total_bookmarks: NaN as any,
        total_view: NaN as any,
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(0);
    });

    it('should handle negative values', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
        total_bookmarks: -10,
        total_view: -100,
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(0);
    });

    it('should work with novels', () => {
      const novel: PixivNovel = {
        id: 456,
        title: 'Test Novel',
        user: { id: '1', name: 'Test User' },
        create_date: '2024-01-01T00:00:00+09:00',
        total_bookmarks: 200,
        total_view: 10000,
      };

      const score = calculatePopularityScore(novel);
      expect(score).toBe(200 + (10000 / 1000)); // 200 + 10 = 210
    });

    it('should handle string numbers', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
        total_bookmarks: '100' as any,
        total_view: '5000' as any,
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(100 + (5000 / 1000)); // 100 + 5 = 105
    });

    it('should handle very large numbers', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
        total_bookmarks: 1000000,
        total_view: 50000000,
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(1000000 + (50000000 / 1000)); // 1000000 + 50000 = 1050000
    });

    it('should handle zero values', () => {
      const illust: PixivIllust = {
        id: 123,
        title: 'Test',
        page_count: 1,
        user: { id: '1', name: 'Test User' },
        image_urls: { square_medium: '', medium: '', large: '' },
        create_date: '2024-01-01T00:00:00+09:00',
        total_bookmarks: 0,
        total_view: 0,
      };

      const score = calculatePopularityScore(illust);
      expect(score).toBe(0);
    });
  });

  describe('parsePixivDate', () => {
    it('should parse valid ISO date string', () => {
      const dateString = '2024-01-01T00:00:00+09:00';
      const timestamp = parsePixivDate(dateString);
      expect(timestamp).toBeGreaterThan(0);
      // Check that the date is valid (could be 2023 or 2024 depending on timezone conversion)
      const year = new Date(timestamp).getFullYear();
      expect([2023, 2024]).toContain(year);
    });

    it('should parse valid ISO date string without timezone', () => {
      const dateString = '2024-01-01T00:00:00';
      const timestamp = parsePixivDate(dateString);
      expect(timestamp).toBeGreaterThan(0);
    });

    it('should return 0 for null', () => {
      const timestamp = parsePixivDate(null);
      expect(timestamp).toBe(0);
    });

    it('should return 0 for undefined', () => {
      const timestamp = parsePixivDate(undefined);
      expect(timestamp).toBe(0);
    });

    it('should return 0 for empty string', () => {
      const timestamp = parsePixivDate('');
      expect(timestamp).toBe(0);
    });

    it('should return 0 for invalid date string', () => {
      const timestamp = parsePixivDate('invalid-date');
      expect(timestamp).toBe(0);
    });

    it('should return 0 for non-string values', () => {
      // TypeScript should prevent this, but test runtime behavior
      const timestamp1 = parsePixivDate(123 as any);
      expect(timestamp1).toBe(0);
    });

    it('should handle various date formats', () => {
      const formats = [
        '2024-01-01T00:00:00+09:00',
        '2024-01-01T00:00:00Z',
        '2024-01-01',
      ];

      formats.forEach(format => {
        const timestamp = parsePixivDate(format);
        expect(timestamp).toBeGreaterThan(0);
      });
    });

    it('should handle dates in different timezones', () => {
      const dateString1 = '2024-01-01T00:00:00+09:00'; // JST
      const dateString2 = '2024-01-01T00:00:00Z'; // UTC
      
      const timestamp1 = parsePixivDate(dateString1);
      const timestamp2 = parsePixivDate(dateString2);
      
      expect(timestamp1).toBeGreaterThan(0);
      expect(timestamp2).toBeGreaterThan(0);
      // They should be different due to timezone offset
      expect(timestamp1).not.toBe(timestamp2);
    });
  });
});

