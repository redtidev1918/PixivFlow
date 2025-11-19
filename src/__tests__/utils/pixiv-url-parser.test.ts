/**
 * Tests for Pixiv URL parser
 */

import { parsePixivUrl, parsedUrlToTargetConfig } from '../../utils/pixiv-url-parser';

describe('parsePixivUrl', () => {
  describe('Illustration URLs', () => {
    it('should parse standard artworks URL', () => {
      const result = parsePixivUrl('https://www.pixiv.net/artworks/123456');
      expect(result).toEqual({
        type: 'illustration',
        id: 123456,
      });
    });

    it('should parse artworks URL with language code', () => {
      const result = parsePixivUrl('https://www.pixiv.net/en/artworks/123456');
      expect(result).toEqual({
        type: 'illustration',
        id: 123456,
      });
    });

    it('should parse artworks URL with zh-cn language code', () => {
      const result = parsePixivUrl('https://www.pixiv.net/zh-cn/artworks/987654');
      expect(result).toEqual({
        type: 'illustration',
        id: 987654,
      });
    });

    it('should parse short format illustration URL', () => {
      const result = parsePixivUrl('https://www.pixiv.net/i/123456');
      expect(result).toEqual({
        type: 'illustration',
        id: 123456,
      });
    });

    it('should parse legacy member_illust.php URL', () => {
      const result = parsePixivUrl('https://www.pixiv.net/member_illust.php?mode=medium&illust_id=123456');
      expect(result).toEqual({
        type: 'illustration',
        id: 123456,
      });
    });

    it('should parse legacy member_illust.php URL without mode parameter', () => {
      const result = parsePixivUrl('https://www.pixiv.net/member_illust.php?illust_id=654321');
      expect(result).toEqual({
        type: 'illustration',
        id: 654321,
      });
    });

    it('should parse user artwork URL', () => {
      const result = parsePixivUrl('https://www.pixiv.net/users/12345/artworks/789012');
      expect(result).toEqual({
        type: 'illustration',
        id: 789012,
      });
    });

    it('should parse URL without www prefix', () => {
      const result = parsePixivUrl('https://pixiv.net/artworks/123456');
      expect(result).toEqual({
        type: 'illustration',
        id: 123456,
      });
    });

    it('should parse URL without https prefix', () => {
      const result = parsePixivUrl('pixiv.net/artworks/123456');
      expect(result).toEqual({
        type: 'illustration',
        id: 123456,
      });
    });

    it('should parse direct numeric ID as illustration', () => {
      const result = parsePixivUrl('123456');
      expect(result).toEqual({
        type: 'illustration',
        id: 123456,
      });
    });
  });

  describe('Novel URLs', () => {
    it('should parse standard novel URL', () => {
      const result = parsePixivUrl('https://www.pixiv.net/novel/show.php?id=26415663');
      expect(result).toEqual({
        type: 'novel',
        id: 26415663,
      });
    });

    it('should parse user novel URL', () => {
      const result = parsePixivUrl('https://www.pixiv.net/users/12345/novels/789012');
      expect(result).toEqual({
        type: 'novel',
        id: 789012,
      });
    });

    it('should parse novel series URL', () => {
      const result = parsePixivUrl('https://www.pixiv.net/novel/series/123456');
      expect(result).toEqual({
        type: 'series',
        seriesId: 123456,
      });
    });
  });

  describe('User URLs', () => {
    it('should parse user profile URL', () => {
      const result = parsePixivUrl('https://www.pixiv.net/users/123456');
      expect(result).toEqual({
        type: 'user',
        userId: '123456',
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle URL with trailing slash', () => {
      const result = parsePixivUrl('https://www.pixiv.net/artworks/123456/');
      expect(result).toEqual({
        type: 'illustration',
        id: 123456,
      });
    });

    it('should handle URL with extra whitespace', () => {
      const result = parsePixivUrl('  https://www.pixiv.net/artworks/123456  ');
      expect(result).toEqual({
        type: 'illustration',
        id: 123456,
      });
    });

    it('should return null for invalid URL', () => {
      const result = parsePixivUrl('https://example.com/artworks/123456');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parsePixivUrl('');
      expect(result).toBeNull();
    });

    it('should return null for non-numeric ID', () => {
      const result = parsePixivUrl('https://www.pixiv.net/artworks/abc');
      expect(result).toBeNull();
    });

    it('should support pixiv.org domain', () => {
      const result = parsePixivUrl('https://www.pixiv.org/artworks/123456');
      expect(result).toEqual({
        type: 'illustration',
        id: 123456,
      });
    });
  });
});

describe('parsedUrlToTargetConfig', () => {
  it('should convert illustration URL to target config', () => {
    const parsed = { type: 'illustration' as const, id: 123456 };
    const config = parsedUrlToTargetConfig(parsed);
    expect(config).toEqual({
      type: 'illustration',
      illustId: 123456,
      tag: 'illust-123456',
    });
  });

  it('should convert novel URL to target config', () => {
    const parsed = { type: 'novel' as const, id: 789012 };
    const config = parsedUrlToTargetConfig(parsed);
    expect(config).toEqual({
      type: 'novel',
      novelId: 789012,
      tag: 'novel-789012',
    });
  });

  it('should convert series URL to target config', () => {
    const parsed = { type: 'series' as const, seriesId: 456789 };
    const config = parsedUrlToTargetConfig(parsed);
    expect(config).toEqual({
      type: 'novel',
      seriesId: 456789,
      tag: 'series-456789',
    });
  });

  it('should convert user URL to target config with default illustration type', () => {
    const parsed = { type: 'user' as const, userId: '123456' };
    const config = parsedUrlToTargetConfig(parsed);
    expect(config).toEqual({
      type: 'illustration',
      userId: '123456',
      tag: 'user-123456',
    });
  });

  it('should convert user URL to target config with novel type override', () => {
    const parsed = { type: 'user' as const, userId: '123456' };
    const config = parsedUrlToTargetConfig(parsed, 'novel');
    expect(config).toEqual({
      type: 'novel',
      userId: '123456',
      tag: 'user-123456',
    });
  });
});
