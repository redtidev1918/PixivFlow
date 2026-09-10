import type {
  IllustSearchOptions,
  IllustRankingMode,
  NovelRankingMode,
  NovelSearchOptions,
} from '@redtidev/pixiv-client';
import type { TargetConfig } from '../config';

/**
 * PixivFlow product query -> Pixiv Client Kit query.
 *
 * This is the ONLY place allowed to know both TargetConfig (product concern)
 * and the kit's Pixiv-protocol options. The kit itself never sees a
 * TargetConfig.
 */
export function mapTargetToIllustQuery(target: TargetConfig): IllustSearchOptions {
  if (!target.tag) throw new Error('tag is required for illustration search');
  return {
    word: target.tag,
    sort: target.sort ?? 'date_desc',
    searchTarget: target.searchTarget ?? 'partial_match_for_tags',
    includeR18: !!target.r18,
    includeTranslatedTagResults: true,
    startDate: target.startDate,
    endDate: target.endDate,
    limit: target.limit,
  };
}

export function mapTargetToNovelQuery(target: TargetConfig): NovelSearchOptions {
  if (!target.tag) throw new Error('tag is required for novel search');
  return {
    word: target.tag,
    sort: target.sort ?? 'date_desc',
    searchTarget: target.searchTarget ?? 'partial_match_for_tags',
    includeR18: !!target.r18,
    startDate: target.startDate,
    endDate: target.endDate,
    limit: target.limit,
  };
}

const ILLUST_RANKING_MODES = new Set<string>([
  'day', 'week', 'month', 'day_male', 'day_female', 'week_original', 'week_rookie',
  'day_r18', 'day_male_r18', 'day_female_r18', 'week_r18', 'week_r18g',
]);
const NOVEL_RANKING_MODES = new Set<string>([
  'day', 'week', 'month', 'day_male', 'day_female',
  'day_r18', 'day_male_r18', 'day_female_r18', 'week_r18', 'week_r18g',
]);

export function asIllustRankingMode(mode: string): IllustRankingMode {
  if (!ILLUST_RANKING_MODES.has(mode)) throw new Error(`Unsupported illustration ranking mode: ${mode}`);
  return mode as IllustRankingMode;
}

export function asNovelRankingMode(mode: string): NovelRankingMode {
  if (!NOVEL_RANKING_MODES.has(mode)) {
    // Illustration-only modes map to the closest valid novel mode.
    if (mode === 'week_original' || mode === 'week_rookie') return 'week';
    throw new Error(`Unsupported novel ranking mode: ${mode}`);
  }
  return mode as NovelRankingMode;
}
