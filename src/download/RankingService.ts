import { IPixivClient } from '../interfaces/IPixivClient';
import { PixivIllust, PixivNovel } from '../pixiv/PixivClient';
import { getThisWeekMonday, getLastWeekMonday } from '../utils/pixiv-date-utils';
import { logger } from '../logger';

/**
 * Service for fetching ranking data with automatic fallback logic
 */
export class RankingService {
  constructor(private readonly client: IPixivClient) {}

  /**
   * Get ranking illustrations with automatic fallback for week mode
   * If week ranking fails, automatically tries:
   * 1. This week's ranking (without date or with this week's date)
   * 2. Day ranking with last week's Monday date
   */
  async getRankingIllustrationsWithFallback(
    mode: string,
    date: string | undefined,
    limit: number | undefined
  ): Promise<PixivIllust[]> {
    // If not week mode, use normal ranking API directly
    if (mode !== 'week') {
      const rankingMode = mode as 'day' | 'week' | 'month' | 'day_male' | 'day_female' | 'week_original' | 'week_rookie' | 'day_r18' | 'day_male_r18' | 'day_female_r18' | 'week_r18' | 'week_r18g';
      return await this.client.getRankingIllustrations(rankingMode, date, limit);
    }

    // For week mode, try with fallback
    try {
      // First try: use the provided date (or undefined for current week)
      return await this.client.getRankingIllustrations('week', date, limit);
    } catch (error) {
      logger.warn(`Week ranking failed with date ${date}, trying fallback...`, { error: error instanceof Error ? error.message : String(error) });
      
      try {
        // Second try: use this week's Monday date
        const thisWeekMonday = getThisWeekMonday();
        return await this.client.getRankingIllustrations('week', thisWeekMonday, limit);
      } catch (error2) {
        logger.warn(`Week ranking with this week's Monday failed, trying day ranking with last week's Monday...`, { error: error2 instanceof Error ? error2.message : String(error2) });
        
        // Third try: use day ranking with last week's Monday date
        const lastWeekMonday = getLastWeekMonday();
        return await this.client.getRankingIllustrations('day', lastWeekMonday, limit);
      }
    }
  }

  /**
   * Get ranking novels with automatic fallback for week mode
   * If week ranking fails, automatically tries:
   * 1. This week's ranking (without date or with this week's date)
   * 2. Day ranking with last week's Monday date
   */
  async getRankingNovelsWithFallback(
    mode: string,
    date: string | undefined,
    limit: number | undefined
  ): Promise<PixivNovel[]> {
    // If not week mode, use normal ranking API directly
    if (mode !== 'week') {
      // Note: getRankingNovels doesn't support 'week_original' and 'week_rookie'
      const rankingMode = mode as 'day' | 'week' | 'month' | 'day_male' | 'day_female' | 'day_r18' | 'day_male_r18' | 'day_female_r18' | 'week_r18' | 'week_r18g';
      return await this.client.getRankingNovels(rankingMode, date, limit);
    }

    // For week mode, try with fallback
    try {
      // First try: use the provided date (or undefined for current week)
      return await this.client.getRankingNovels('week', date, limit);
    } catch (error) {
      logger.warn(`Week ranking failed with date ${date}, trying fallback...`, { error: error instanceof Error ? error.message : String(error) });
      
      try {
        // Second try: use this week's Monday date
        const thisWeekMonday = getThisWeekMonday();
        return await this.client.getRankingNovels('week', thisWeekMonday, limit);
      } catch (error2) {
        logger.warn(`Week ranking with this week's Monday failed, trying day ranking with last week's Monday...`, { error: error2 instanceof Error ? error2.message : String(error2) });
        
        // Third try: use day ranking with last week's Monday date
        const lastWeekMonday = getLastWeekMonday();
        return await this.client.getRankingNovels('day', lastWeekMonday, limit);
      }
    }
  }
}

