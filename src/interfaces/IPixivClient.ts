import { TargetConfig } from '../config';
import { PixivIllust, PixivNovel, PixivNovelTextResponse, PixivUser } from '../pixiv/PixivClient';

/**
 * Interface for Pixiv API client
 * Provides abstraction for Pixiv API interactions
 */
export interface IPixivClient {
  /**
   * Get user information
   */
  getUser(): Promise<PixivUser>;

  /**
   * Search illustrations using target config
   */
  searchIllustrations(target: TargetConfig): Promise<PixivIllust[]>;

  /**
   * Search novels using target config
   */
  searchNovels(target: TargetConfig): Promise<PixivNovel[]>;

  /**
   * Get illustration details by ID
   */
  getIllustration(id: number): Promise<PixivIllust>;

  /**
   * Get novel details by ID
   */
  getNovel(id: number): Promise<PixivNovel>;

  /**
   * Get novel text content
   */
  getNovelText(id: number): Promise<PixivNovelTextResponse>;

  /**
   * Get user illustrations
   */
  getUserIllustrations(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<PixivIllust[]>;

  /**
   * Get user novels
   */
  getUserNovels(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<PixivNovel[]>;

  /**
   * Get ranking illustrations
   */
  getRankingIllustrations(
    mode: 'day' | 'week' | 'month' | 'day_male' | 'day_female' | 'week_original' | 'week_rookie' | 'day_r18' | 'day_male_r18' | 'day_female_r18' | 'week_r18' | 'week_r18g',
    date?: string,
    limit?: number
  ): Promise<PixivIllust[]>;

  /**
   * Get ranking novels
   */
  getRankingNovels(
    mode: 'day' | 'week' | 'month' | 'day_male' | 'day_female' | 'day_r18' | 'day_male_r18' | 'day_female_r18' | 'week_r18' | 'week_r18g',
    date?: string,
    limit?: number
  ): Promise<PixivNovel[]>;

  /**
   * Get illustration detail with tags
   */
  getIllustDetailWithTags(illustId: number): Promise<{
    illust: PixivIllust;
    tags: Array<{ name: string; translated_name?: string }>;
  }>;

  /**
   * Get novel detail with tags
   */
  getNovelDetailWithTags(novelId: number): Promise<{
    novel: PixivNovel;
    tags: Array<{ name: string; translated_name?: string }>;
  }>;

  /**
   * Get novel detail
   */
  getNovelDetail(novelId: number): Promise<PixivNovel>;

  /**
   * Get novel series
   */
  getNovelSeries(seriesId: number): Promise<PixivNovel[]>;

  /**
   * Download image from URL
   */
  downloadImage(originalUrl: string): Promise<ArrayBuffer>;
}

