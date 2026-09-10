/**
 * Kit-native query DTOs. These are Pixiv protocol parameters ONLY — no host
 * application config (TargetConfig/StandaloneConfig) may appear here.
 */

export type SearchSort = 'date_desc' | 'date_asc' | 'popular_desc';
export type SearchTarget =
  | 'partial_match_for_tags'
  | 'exact_match_for_tags'
  | 'title_and_caption';

export interface IllustSearchOptions {
  word: string;
  sort?: SearchSort;
  searchTarget?: SearchTarget;
  /** Include R-18 works (omit Pixiv's filter=for_ios). Default false. */
  includeR18?: boolean;
  includeTranslatedTagResults?: boolean;
  /** YYYY-MM-DD, sent to the endpoint when present. */
  startDate?: string;
  endDate?: string;
  /** Max items to collect through next_url pages. Default 30 (one page). */
  limit?: number;
  /** Start from a Pixiv next_url cursor. */
  cursor?: string | null;
  signal?: AbortSignal;
}

export interface NovelSearchOptions extends IllustSearchOptions {}

export type IllustRankingMode =
  | 'day'
  | 'week'
  | 'month'
  | 'day_male'
  | 'day_female'
  | 'week_original'
  | 'week_rookie'
  | 'day_r18'
  | 'day_male_r18'
  | 'day_female_r18'
  | 'week_r18'
  | 'week_r18g';

export type NovelRankingMode =
  | 'day'
  | 'week'
  | 'month'
  | 'day_male'
  | 'day_female'
  | 'day_r18'
  | 'day_male_r18'
  | 'day_female_r18'
  | 'week_r18'
  | 'week_r18g';

export interface RankingOptions {
  date?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface UserWorksOptions {
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface OnePageResult<T> {
  items: T[];
  /** Pixiv next_url (opaque cursor), null on the last page. */
  next: string | null;
}
