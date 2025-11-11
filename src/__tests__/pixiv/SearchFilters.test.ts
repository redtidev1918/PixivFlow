/**
 * Tests for SearchFilters
 */

import { SearchFilters } from '../../pixiv/client/search/SearchFilters';
import type { PixivIllust, PixivNovel } from '../../pixiv/types';
import type { TargetConfig } from '../../config';

const createIllust = (overrides: Partial<PixivIllust> = {}): PixivIllust =>
  ({
    id: 1,
    title: 'Illustration',
    create_date: '2024-01-15T00:00:00+00:00',
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
    create_date: '2024-01-15T00:00:00+00:00',
    user: { id: 'author', name: 'Author' },
    bookmark_count: 0,
    total_bookmarks: 0,
    total_view: 0,
    ...overrides,
  } as PixivNovel);

describe('SearchFilters', () => {
  describe('filterItemByDate', () => {
    it('should include item when no date range is specified', () => {
      const item = createIllust({ create_date: '2024-01-15T00:00:00+00:00' });
      const target: TargetConfig = { type: 'illustration', tag: 'test' };
      const result = SearchFilters.filterItemByDate(item, target, null, null, 'date_desc');

      expect(result.shouldInclude).toBe(true);
      expect(result.shouldStop).toBe(false);
    });

    it('should include item with invalid date when no date range is specified', () => {
      const item = createIllust({ create_date: 'invalid-date' });
      const target: TargetConfig = { type: 'illustration', tag: 'test' };
      const result = SearchFilters.filterItemByDate(item, target, null, null, 'date_desc');

      expect(result.shouldInclude).toBe(true);
      expect(result.shouldStop).toBe(false);
    });

    it('should exclude item with invalid date when date range is specified', () => {
      const item = createIllust({ create_date: 'invalid-date' });
      const target: TargetConfig = { type: 'illustration', tag: 'test' };
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterItemByDate(item, target, startDate, endDate, 'date_desc');

      expect(result.shouldInclude).toBe(false);
      expect(result.shouldStop).toBe(false);
    });

    it('should include item within date range in date_desc mode', () => {
      const item = createIllust({ create_date: '2024-01-15T00:00:00+00:00' });
      const target: TargetConfig = { type: 'illustration', tag: 'test' };
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterItemByDate(item, target, startDate, endDate, 'date_desc');

      expect(result.shouldInclude).toBe(true);
      expect(result.shouldStop).toBe(false);
    });

    it('should exclude item after endDate in date_desc mode', () => {
      const item = createIllust({ create_date: '2024-02-15T00:00:00+00:00' });
      const target: TargetConfig = { type: 'illustration', tag: 'test', endDate: '2024-01-31' };
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterItemByDate(item, target, startDate, endDate, 'date_desc');

      expect(result.shouldInclude).toBe(false);
      expect(result.shouldStop).toBe(false);
    });

    it('should stop when item is before startDate in date_desc mode', () => {
      const item = createIllust({ create_date: '2023-12-15T00:00:00+00:00' });
      const target: TargetConfig = { type: 'illustration', tag: 'test', startDate: '2024-01-01' };
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterItemByDate(item, target, startDate, endDate, 'date_desc');

      expect(result.shouldInclude).toBe(false);
      expect(result.shouldStop).toBe(true);
    });

    it('should exclude item before startDate in date_asc mode', () => {
      const item = createIllust({ create_date: '2023-12-15T00:00:00+00:00' });
      const target: TargetConfig = { type: 'illustration', tag: 'test', startDate: '2024-01-01' };
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterItemByDate(item, target, startDate, endDate, 'date_asc');

      expect(result.shouldInclude).toBe(false);
      expect(result.shouldStop).toBe(false);
    });

    it('should stop when item is after endDate in date_asc mode', () => {
      const item = createIllust({ create_date: '2024-02-15T00:00:00+00:00' });
      const target: TargetConfig = { type: 'illustration', tag: 'test', endDate: '2024-01-31' };
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterItemByDate(item, target, startDate, endDate, 'date_asc');

      expect(result.shouldInclude).toBe(false);
      expect(result.shouldStop).toBe(true);
    });

    it('should exclude item outside date range in popular_desc mode', () => {
      const item = createIllust({ create_date: '2024-02-15T00:00:00+00:00' });
      const target: TargetConfig = { type: 'illustration', tag: 'test' };
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterItemByDate(item, target, startDate, endDate, 'popular_desc');

      expect(result.shouldInclude).toBe(false);
      expect(result.shouldStop).toBe(false);
    });

    it('should include item within date range in popular_desc mode', () => {
      const item = createIllust({ create_date: '2024-01-15T00:00:00+00:00' });
      const target: TargetConfig = { type: 'illustration', tag: 'test' };
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterItemByDate(item, target, startDate, endDate, 'popular_desc');

      expect(result.shouldInclude).toBe(true);
      expect(result.shouldStop).toBe(false);
    });

    it('should work with novels', () => {
      const item = createNovel({ create_date: '2024-01-15T00:00:00+00:00' });
      const target: TargetConfig = { type: 'novel', tag: 'test' };
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterItemByDate(item, target, startDate, endDate, 'date_desc');

      expect(result.shouldInclude).toBe(true);
      expect(result.shouldStop).toBe(false);
    });

    it('should handle item with null create_date', () => {
      const item = createIllust({ create_date: undefined as any });
      const target: TargetConfig = { type: 'illustration', tag: 'test' };
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterItemByDate(item, target, startDate, endDate, 'date_desc');

      expect(result.shouldInclude).toBe(false);
      expect(result.shouldStop).toBe(false);
    });
  });

  describe('calculateFetchLimit', () => {
    it('should return undefined when target limit is not specified', () => {
      const target: TargetConfig = { type: 'illustration', tag: 'test' };
      const result = SearchFilters.calculateFetchLimit(target, 'date_desc', false);

      expect(result).toBeUndefined();
    });

    it('should calculate fetch limit for small limit in date_desc mode', () => {
      const target: TargetConfig = { type: 'illustration', tag: 'test', limit: 5 };
      const result = SearchFilters.calculateFetchLimit(target, 'date_desc', false);

      expect(result).toBeGreaterThanOrEqual(100);
    });

    it('should calculate fetch limit for small limit in popular_desc mode with date filter', () => {
      const target: TargetConfig = { type: 'illustration', tag: 'test', limit: 5 };
      const result = SearchFilters.calculateFetchLimit(target, 'popular_desc', true);

      expect(result).toBeGreaterThanOrEqual(100);
      expect(result).toBeGreaterThanOrEqual(50); // 5 * 10 = 50, but min is 100
    });

    it('should calculate fetch limit for large limit', () => {
      const target: TargetConfig = { type: 'illustration', tag: 'test', limit: 100 };
      const result = SearchFilters.calculateFetchLimit(target, 'date_desc', false);

      expect(result).toBeGreaterThanOrEqual(200);
    });

    it('should calculate fetch limit for large limit in popular_desc mode with date filter', () => {
      const target: TargetConfig = { type: 'illustration', tag: 'test', limit: 100 };
      const result = SearchFilters.calculateFetchLimit(target, 'popular_desc', true);

      expect(result).toBeGreaterThanOrEqual(200);
      expect(result).toBeGreaterThanOrEqual(300); // 100 * 3 = 300
    });
  });

  describe('parseDateRangeFromTarget', () => {
    it('should return null dates when no date range is specified', () => {
      const target: TargetConfig = { type: 'illustration', tag: 'test' };
      const result = SearchFilters.parseDateRangeFromTarget(target);

      expect(result).toEqual({ startDate: null, endDate: null });
    });

    it('should parse valid date range', () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };
      const result = SearchFilters.parseDateRangeFromTarget(target);

      expect(result).not.toBeNull();
      expect(result?.startDate).toBeInstanceOf(Date);
      expect(result?.endDate).toBeInstanceOf(Date);
    });

    it('should return null when startDate > endDate', () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test',
        startDate: '2024-01-31',
        endDate: '2024-01-01',
      };
      const result = SearchFilters.parseDateRangeFromTarget(target);

      expect(result).toBeNull();
    });

    it('should handle invalid startDate with valid endDate', () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test',
        startDate: 'invalid-date',
        endDate: '2024-01-31',
      };
      const result = SearchFilters.parseDateRangeFromTarget(target);

      // When startDate is invalid, it becomes null, but endDate is still valid
      expect(result).not.toBeNull();
      expect(result?.startDate).toBeNull();
      expect(result?.endDate).toBeInstanceOf(Date);
    });

    it('should handle valid startDate with invalid endDate', () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test',
        startDate: '2024-01-01',
        endDate: 'invalid-date',
      };
      const result = SearchFilters.parseDateRangeFromTarget(target);

      // When endDate is invalid, it becomes null, but startDate is still valid
      expect(result).not.toBeNull();
      expect(result?.startDate).toBeInstanceOf(Date);
      expect(result?.endDate).toBeNull();
    });

    it('should handle only startDate', () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test',
        startDate: '2024-01-01',
      };
      const result = SearchFilters.parseDateRangeFromTarget(target);

      expect(result).not.toBeNull();
      expect(result?.startDate).toBeInstanceOf(Date);
      expect(result?.endDate).toBeNull();
    });

    it('should handle only endDate', () => {
      const target: TargetConfig = {
        type: 'illustration',
        tag: 'test',
        endDate: '2024-01-31',
      };
      const result = SearchFilters.parseDateRangeFromTarget(target);

      expect(result).not.toBeNull();
      expect(result?.startDate).toBeNull();
      expect(result?.endDate).toBeInstanceOf(Date);
    });
  });

  describe('filterResultsByDateRange', () => {
    it('should return all results when no date range is specified', () => {
      const items = [
        createIllust({ create_date: '2024-01-15T00:00:00+00:00' }),
        createIllust({ create_date: '2024-02-15T00:00:00+00:00' }),
      ];
      const result = SearchFilters.filterResultsByDateRange(items, null, null);

      expect(result).toEqual(items);
    });

    it('should filter results by date range', () => {
      const items = [
        createIllust({ create_date: '2024-01-15T00:00:00+00:00' }),
        createIllust({ create_date: '2024-02-15T00:00:00+00:00' }),
        createIllust({ create_date: '2024-01-20T00:00:00+00:00' }),
      ];
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterResultsByDateRange(items, startDate, endDate);

      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual([items[0].id, items[2].id]);
    });

    it('should exclude items with invalid dates', () => {
      const items = [
        createIllust({ create_date: '2024-01-15T00:00:00+00:00' }),
        createIllust({ create_date: 'invalid-date' }),
      ];
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterResultsByDateRange(items, startDate, endDate);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(items[0].id);
    });

    it('should exclude items without create_date', () => {
      const items = [
        createIllust({ create_date: '2024-01-15T00:00:00+00:00' }),
        createIllust({ create_date: undefined as any }),
      ];
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterResultsByDateRange(items, startDate, endDate);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(items[0].id);
    });

    it('should work with novels', () => {
      const items = [
        createNovel({ create_date: '2024-01-15T00:00:00+00:00' }),
        createNovel({ create_date: '2024-02-15T00:00:00+00:00' }),
      ];
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterResultsByDateRange(items, startDate, endDate);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(items[0].id);
    });

    it('should handle only startDate', () => {
      const items = [
        createIllust({ create_date: '2024-01-15T00:00:00+00:00' }),
        createIllust({ create_date: '2023-12-15T00:00:00+00:00' }),
      ];
      const startDate = new Date('2024-01-01');
      const result = SearchFilters.filterResultsByDateRange(items, startDate, null);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(items[0].id);
    });

    it('should handle only endDate', () => {
      const items = [
        createIllust({ create_date: '2024-01-15T00:00:00+00:00' }),
        createIllust({ create_date: '2024-02-15T00:00:00+00:00' }),
      ];
      const endDate = new Date('2024-01-31');
      const result = SearchFilters.filterResultsByDateRange(items, null, endDate);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(items[0].id);
    });
  });
});

