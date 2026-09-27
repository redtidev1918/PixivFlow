/**
 * Semantic-topic download: resolve a user topic into a dynamic, Pixiv-derived
 * search space. Pure metadata/tag signals only — no LLM, VLM, embeddings or
 * local models are used anywhere in this module.
 */

export type TopicContentType = 'illustration' | 'novel';

/** A single related tag with a 0..1 relatedness score and provenance. */
export interface ResolvedTag {
  name: string;
  translatedName?: string;
  /** Combined relatedness score (co-occurrence * specificity * suggestion). */
  score: number;
  /** How many sampled works (of the seed search) carried this tag. */
  occurrences: number;
  /** Coverage of the sampled seed works (occurrences / sample size). */
  coverage: number;
  /** Specificity: high when common with the topic but rare in the background. */
  specificity: number;
  /** Present in Pixiv autocomplete for the seed. */
  suggested: boolean;
  /** The seed tag always scores 1.0 and is always included. */
  seed: boolean;
}

/**
 * The resolved search space for one topic + content type. Cached on the data
 * volume so daily runs reuse it and a failed refresh can fall back to it.
 */
export interface TopicSpace {
  version: 1;
  topic: string;
  contentType: TopicContentType;
  createdAt: string;
  expiresAt: string;
  sampleSize: number;
  sampledWorks: number;
  tags: ResolvedTag[];
}

/** When related tags may be used as their own recall channel (§topic-recall). */
export type RelatedTagMode = 'always' | 'when_seed_insufficient' | 'never';

export interface TopicDiscoveryOptions {
  /** Include R-18 works in topic sampling and collection (default false). */
  includeR18?: boolean;
  maxTags?: number;
  sampleWorks?: number;
  cacheDays?: number;
  minScore?: number;
  refresh?: boolean;
  /**
   * Related-tag recall mode (default `'always'`).
   *
   * A resolved tag space is a hierarchy, not a bag of interchangeable tags: the
   * seed tag is the topic the operator asked for and every other tag is a hint.
   * Under `'always'` each resolved tag is searched for the day's works, so a
   * second high-weight tag (丸吞) can occupy the only slot of a 西瓜肚 target.
   * `'when_seed_insufficient'` searches the seed tag first and only walks the
   * related channel when the seed cannot fill the limit for that day;
   * `'never'` searches the seed tag alone.
   */
  relatedTags?: RelatedTagMode;
}

export interface TopicCollectOptions {
  maxPerTag?: number;
  maxCandidates?: number;
  minMetadataScore?: number;
}

/** A trimmed candidate: only fields needed for filtering/ranking. */
export interface TopicCandidate {
  id: number;
  type: TopicContentType;
  title: string;
  caption: string;
  tags: string[];
  bookmarks: number;
  views: number;
  /** Local popularity score (bookmarks + views/1000). */
  popularity: number;
  /** Metadata topic-relevance score computed by the filter stage. */
  metadataScore: number;
  /** Pixiv AI classification copied from illustration search metadata. */
  aiType?: number;
}

/** Minimal surface the resolver/collector need from the Pixiv client. */
export interface TopicClient {
  getTagAutocomplete(
    seed: string,
    options?: { signal?: AbortSignal }
  ): Promise<Array<{ name: string; translated_name?: string }>>;
  searchIllustrationsForTags(
    seed: string,
    limit: number,
    options?: { startDate?: string; endDate?: string; includeR18?: boolean; signal?: AbortSignal }
  ): Promise<Array<WorkLike>>;
  searchNovelsForTags(
    seed: string,
    limit: number,
    options?: { startDate?: string; endDate?: string; includeR18?: boolean; signal?: AbortSignal }
  ): Promise<Array<WorkLike>>;
}

export interface WorkLike {
  id: number;
  title?: string;
  caption?: string;
  create_date?: string;
  tags?: Array<{ name: string; translated_name?: string }>;
  total_bookmarks?: number;
  bookmark_count?: number;
  total_view?: number;
  view_count?: number;
  illust_ai_type?: number;
}
