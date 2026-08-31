/**
 * Configuration type definitions
 */

export type TargetType = 'illustration' | 'novel';

export type DeliveryFieldValue = string | number | boolean | string[];

/** Discovery tuning for mode='topic'. Every value has a safe default. */
export interface TopicDiscoveryConfig {
  /** Max related tags used to build the search space (default 12). */
  maxTags?: number;
  /** Recent works sampled per type to compute co-occurrence (default 100). */
  sampleWorks?: number;
  /** Cache lifetime in days for the resolved tag space (default 7). */
  cacheDays?: number;
  /** Minimum relatedness score for a tag to enter the space (default 0.18). */
  minScore?: number;
  /** Ignore a fresh cache and re-discover now (default false). */
  refresh?: boolean;
  /** Include R-18 works in topic sampling and collection (default false). */
  includeR18?: boolean;
}

/** Candidate collection tuning for mode='topic'. */
export interface CandidateCollectionConfig {
  /** Max works fetched per related tag for the target day (default 40). */
  maxPerTag?: number;
  /** Hard cap on the merged, deduplicated candidate pool (default 250). */
  maxCandidates?: number;
  /** Minimum metadata-topic score to survive filtering (default 0.35). */
  minMetadataScore?: number;
}

/** Behaviour when a target cannot produce the requested number of works. */
export interface NoMatchPolicyConfig {
  /**
   * For topic novels with a language filter, inspect this many additional
   * preceding publication days, one day at a time (default 0, max 7).
   * Topic and language constraints are never relaxed implicitly.
   */
  lookbackDays?: number;
  /** Send a best-effort notice through the target's delivery endpoint. */
  notify?: boolean;
}

export interface TargetDeliveryConfig {
  /** 顶层 delivery.targets 中定义的交付目标名称 */
  target: string;
  /** 覆盖该交付目标的表单字段，支持 {{title}} 等模板变量 */
  fields?: Record<string, DeliveryFieldValue>;
}

export interface TargetConfig {
  /**
   * Stable identifier used by schedules to select this target.
   * Optional for legacy single-schedule configurations.
   */
  id?: string;
  type: TargetType;
  tag?: string;
  /**
   * Maximum works to download per execution for this tag.
   */
  limit?: number;
  /**
   * Search target parameter for Pixiv API.
   */
  searchTarget?: 'partial_match_for_tags' | 'exact_match_for_tags' | 'title_and_caption';
  /**
   * Tag relation for multiple tags: 'and' (default) or 'or'
   * - 'and': Works must contain all tags (default behavior, space-separated tags)
   * - 'or': Works containing any of the tags will be included
   * 
   * When 'or' is used, the tag field should contain space-separated tags.
   * Each tag will be searched separately and results will be merged and deduplicated.
   */
  tagRelation?: 'and' | 'or';
  /**
   * Sort order for search results.
   * - 'date_desc': Sort by date (newest first)
   * - 'date_asc': Sort by date (oldest first)
   * - 'popular_desc': Sort by popularity (most bookmarks first)
   */
  sort?: 'date_desc' | 'date_asc' | 'popular_desc';
  restrict?: 'public' | 'private';
  /**
   * Include R-18 works in searches for this target (default false). Pixiv's
   * app API filters R-18 out of illustration search via `filter=for_ios`;
   * setting this removes the filter. Novel search already returns R-18.
   */
  r18?: boolean;
  /**
   * Exclude works that Pixiv marks as AI-generated (`illust_ai_type === 2`)
   * or that carry explicit AI-generation tags (生成AI / AI生成 / Generative AI).
   * Tag matching also catches works whose classification field is missing or
   * not yet set by Pixiv. Only applies to illustration targets. Default: false.
   */
  excludeAI?: boolean;
  /**
   * Optional content-side AI check (illustration targets only): after pages
   * are downloaded, scan the first page's file bytes for AI-generator
   * metadata markers (Stable Diffusion `parameters=` PNG tEXt, NovelAI EXIF,
   * ...) and skip delivery when found. Cost: one bounded 2 MiB read per work;
   * no pixel analysis, no model inference. Detected works are still recorded
   * as downloaded so they are not re-fetched on later runs. Default: false.
   */
  aiMetadataCheck?: boolean;
  /**
   * Illustration safety cap: skip works with more than this many pages.
   * A 20+ page original set is the single biggest memory/CPU spike on small
   * (512 MiB) machines; capping it keeps daily runs predictable. Default:
   * unlimited (0/undefined = no cap).
   */
  maxPageCount?: number;
  /**
   * Download mode: 'search' (default), 'ranking' or 'topic'
   * - 'search': Search by tag
   * - 'ranking': Use the Pixiv ranking API when filterTag is absent. With
   *   filterTag, search works published on rankingDate and rank them locally
   *   by popularity.
   * - 'topic': Semantic-topic download. Instead of requiring the user to know
   *   every related Pixiv tag, PixivFlow derives a dynamic search space from
   *   the topic itself (Pixiv autocomplete + tag co-occurrence on recent
   *   works), searches the target day across those tags, filters by lightweight
   *   metadata scoring and ranks by local popularity, then downloads Top N.
   *   No LLM/VLM/embeddings — only Pixiv tag/metadata signals.
   */
  mode?: 'search' | 'ranking' | 'topic';
  /**
   * Semantic topic for mode='topic'. Distinct from `tag`: a tag is an exact
   *   Pixiv tag to match, while a topic is expanded at runtime into related
   *   tags. Only the seed topic needs to be supplied.
   */
  topic?: string;
  /**
   * One-day publication window for mode='topic' (YYYY-MM-DD, 'YESTERDAY' or
   *   'TODAY'). Resolved at run time. Falls back to rankingDate/startDate, then
   *   YESTERDAY for the daily scheduler use case.
   */
  date?: string;
  /** Tunable discovery/collection knobs for mode='topic' (all optional). */
  topicDiscovery?: TopicDiscoveryConfig;
  candidateCollection?: CandidateCollectionConfig;
  /** Bounded fallback and notification policy for an empty result. */
  noMatchPolicy?: NoMatchPolicyConfig;
  /**
   * Ranking mode (only used when mode='ranking')
   * - 'day': Daily ranking
   * - 'week': Weekly ranking
   * - 'month': Monthly ranking
   * - 'day_male', 'day_female', 'day_ai': Daily ranking by category
   */
  rankingMode?: 'day' | 'week' | 'month' | 'day_male' | 'day_female' | 'day_ai' | 'week_original' | 'week_rookie' | 'day_r18' | 'day_male_r18' | 'day_female_r18';
  /**
   * Date for ranking (YYYY-MM-DD format, e.g., '2024-01-15')
   * If not specified, uses today's date
   */
  rankingDate?: string;
  /**
   * Tag-scoped daily popularity (only used when mode='ranking'). The selected
   * rankingDate becomes a one-day publication window.
   */
  filterTag?: string;
  /**
   * Random selection mode
   * If true, randomly selects from search results instead of downloading in order
   * When enabled, limit specifies how many results to fetch, then randomly selects one to download
   */
  random?: boolean;
  /**
   * Novel series ID (only used when type='novel')
   * If specified, downloads all novels in the series
   * Example: series ID 14690617 from URL https://www.pixiv.net/novel/series/14690617
   */
  seriesId?: number;
  /**
   * Novel ID (only used when type='novel')
   * If specified, downloads a single novel by ID
   * Example: novel ID 26132156 from URL https://www.pixiv.net/novel/show.php?id=26132156
   */
  novelId?: number;
  /**
   * Illustration ID (only used when type='illustration')
   * If specified, downloads a single illustration by ID
   * Example: illust ID 12345678 from URL https://www.pixiv.net/artworks/12345678
   */
  illustId?: number;
  /**
   * User ID (used when type='illustration' or 'novel')
   * If specified, downloads all works (illustrations or novels) from the user
   * Example: user ID 123456 from URL https://www.pixiv.net/users/123456
   */
  userId?: string;
  /**
   * Minimum number of bookmarks required for a work to be downloaded
   * If specified, only works with bookmarks >= minBookmarks will be downloaded
   */
  minBookmarks?: number;
  /**
   * Start date for filtering works (YYYY-MM-DD format, e.g., '2024-01-01')
   * If specified, only works created on or after this date will be downloaded
   */
  startDate?: string;
  /**
   * End date for filtering works (YYYY-MM-DD format, e.g., '2024-12-31')
   * If specified, only works created on or before this date will be downloaded
   */
  endDate?: string;
  /**
   * Language filter for novels (only used when type='novel')
   * - 'chinese': Only download Chinese novels
   * - 'non-chinese': Only download non-Chinese novels (e.g., Japanese, English)
   * - undefined: Download all novels regardless of language
   * 
   * Note: Language detection requires at least 50 characters of text content.
   * Novels that are too short for reliable detection will be downloaded by default.
   */
  languageFilter?: 'chinese' | 'non-chinese';
  /**
   * When a novel language filter is active, try this many popularity-ranked
   * candidates to backfill the requested limit (default 20, max 100).
   */
  languageCandidateLimit?: number;
  /**
   * Reject novels whose text is too short for reliable language detection.
   * Default false preserves the legacy permissive behavior.
   */
  strictLanguageFilter?: boolean;
  /**
   * Enable language detection and logging for novels (only used when type='novel')
   * If true, detected language will be logged and saved in metadata
   * Default: true
   */
  detectLanguage?: boolean;
  /**
   * 存储模式:'persistent'(默认,本地留存)或 'cache'(下载成功后上传到
   * target.delivery 指定的交付通道,成功即删除本地文件)。
   */
  storageMode?: 'persistent' | 'cache';
  /** cache 模式下该 target 使用的交付目标与字段覆盖 */
  delivery?: TargetDeliveryConfig;
}

export interface PixivCredentialConfig {
  clientId: string;
  clientSecret: string;
  deviceToken: string;
  refreshToken: string;
  userAgent: string;
}

export interface NetworkConfig {
  /**
   * Request timeout in milliseconds
   * Default: 30000 (30 seconds)
   */
  timeoutMs?: number;
  /**
   * Number of retries for failed requests
   * Default: 3
   */
  retries?: number;
  /**
   * Delay between retries in milliseconds
   * Default: 1000 (1 second)
   */
  retryDelay?: number;
  /**
   * Proxy configuration
   */
  proxy?: {
    enabled: boolean;
    host: string;
    port: number;
    protocol?: 'http' | 'https' | 'socks4' | 'socks5';
    username?: string;
    password?: string;
  };
}

/**
 * Directory organization mode
 */
export type OrganizationMode =
  | 'flat' // Flat structure: all files in one directory
  | 'byAuthor' // Organize by author: {baseDir}/{author_name}/{filename}
  | 'byTag' // Organize by tag: {baseDir}/{tag}/{filename}
  | 'byDate' // Organize by creation date: {baseDir}/{YYYY-MM}/{filename}
  | 'byDay' // Organize by creation day: {baseDir}/{YYYY-MM-DD}/{filename}
  | 'byDownloadDate' // Organize by download date: {baseDir}/{YYYY-MM}/{filename}
  | 'byDownloadDay' // Organize by download day: {baseDir}/{YYYY-MM-DD}/{filename}
  | 'byAuthorAndTag' // Organize by author and tag: {baseDir}/{author_name}/{tag}/{filename}
  | 'byDateAndAuthor' // Organize by creation date and author: {baseDir}/{YYYY-MM}/{author_name}/{filename}
  | 'byDayAndAuthor' // Organize by creation day and author: {baseDir}/{YYYY-MM-DD}/{author_name}/{filename}
  | 'byDownloadDateAndAuthor' // Organize by download date and author: {baseDir}/{YYYY-MM}/{author_name}/{filename}
  | 'byDownloadDayAndAuthor'; // Organize by download day and author: {baseDir}/{YYYY-MM-DD}/{author_name}/{filename}

export interface StorageConfig {
  /**
   * Path to SQLite database file
   * Default: ./data/pixiv-downloader.db
   */
  databasePath?: string;
  /**
   * Root directory for downloads
   * Default: ./downloads
   */
  downloadDirectory?: string;
  /**
   * Directory for illustrations (relative to downloadDirectory or absolute)
   * Default: {downloadDirectory}/illustrations
   */
  illustrationDirectory?: string;
  /**
   * Directory for novels (relative to downloadDirectory or absolute)
   * Default: {downloadDirectory}/novels
   */
  novelDirectory?: string;
  /**
   * Directory organization mode for illustrations
   * Default: 'flat'
   */
  illustrationOrganization?: OrganizationMode;
  /**
   * Directory organization mode for novels
   * Default: 'flat'
   */
  novelOrganization?: OrganizationMode;
  /**
   * How many days downloaded cache files are kept before `pixivflow maintain`
   * prunes them (files + download records). Keeps storage bounded when
   * `delivery.deleteAfterDelivery` is false. Default: 14 (0 disables).
   */
  cacheRetentionDays?: number;
  /**
   * Maximum aggregate size of downloaded cache files in MiB. `maintain`
   * removes the oldest complete works until the cache is below this limit.
   * Default: 0 (disabled).
   */
  cacheMaxSizeMB?: number;
}

export interface SchedulerConfig {
  enabled: boolean;
  cron: string;
  timezone?: string;
  /**
   * Maximum number of times the scheduler will execute.
   * If set, scheduler will stop after reaching this count.
   * undefined means unlimited executions.
   */
  maxExecutions?: number;
  /**
   * Minimum interval between executions (in milliseconds).
   * If a job is triggered too soon after the previous one, it will be skipped.
   * Default: 0 (no minimum interval)
   */
  minInterval?: number;
  /**
   * Maximum execution time for a single job (in milliseconds).
   * If a job exceeds this time, it will be terminated.
   * undefined means no timeout.
   */
  timeout?: number;
  /**
   * Maximum consecutive failures before stopping the scheduler.
   * If set, scheduler will stop after this many consecutive failures.
   * undefined means unlimited failures.
   */
  maxConsecutiveFailures?: number;
  /**
   * Delay before retrying after a failure (in milliseconds).
   * If set, scheduler will wait this long before the next execution after a failure.
   * Default: 0 (no delay)
   */
  failureRetryDelay?: number;
}

/**
 * An independently timed group of download targets. Multiple plans are
 * hosted by one scheduler process and share the same Pixiv/runtime resources.
 */
export interface ScheduleConfig extends SchedulerConfig {
  /** Stable unique identifier. */
  id: string;
  /** Human-readable label shown by the WebUI and in logs. */
  name?: string;
  /**
   * Target ids to run. Omit or use an empty array to run every configured
   * target, which also keeps legacy configurations concise.
   */
  targetIds?: string[];
}

export interface SchedulerRuntimeConfig {
  /** Watch the active config and reload valid snapshots automatically. */
  watchConfig?: boolean;
  /** Debounce interval for atomic file replacements. Default: 500ms. */
  reloadDebounceMs?: number;
  /**
   * Maximum number of distinct pending plans while another plan is running.
   * One pending run per plan is retained; extra ticks are skipped.
   */
  queueLimit?: number;
}

export interface HttpMultipartSuccessConfig {
  /** 可接受的 HTTP 状态码；缺省接受全部 2xx */
  statuses?: number[];
  /** 可选 JSON 路径，例如 "ok" 或 "data.accepted" */
  jsonPath?: string;
  /** jsonPath 对应的期望值 */
  equals?: string | number | boolean | null;
}

export interface HttpMultipartDeliveryConfig {
  type: 'httpMultipart';
  url: string;
  /** Optional JSON endpoint used for no-match operational notifications. */
  notificationUrl?: string;
  method?: 'POST' | 'PUT';
  /** 支持 ${ENV_NAME} 环境变量插值 */
  headers?: Record<string, string>;
  /** multipart 文件字段名，默认 files */
  fileField?: string;
  /** 普通表单字段，支持 title/pixivId/type/tag/topic/workTags 模板变量 */
  fields?: Record<string, DeliveryFieldValue>;
  /** 数组字段编码方式，默认 comma */
  arrayFormat?: 'comma' | 'repeat' | 'json';
  success?: HttpMultipartSuccessConfig;
  /** 单次交付的最大尝试次数（含首次），默认 3 */
  maxAttempts?: number;
  /** 重试基础间隔（毫秒），默认 2000 */
  retryDelayMs?: number;
}

export type DeliveryTargetConfig = HttpMultipartDeliveryConfig;

export interface DeliveryConfig {
  /** 可供各 target 引用的命名交付目标 */
  targets: Record<string, DeliveryTargetConfig>;
  /** 交付成功后删除缓存文件；默认 true，失败一律保留 */
  deleteAfterDelivery?: boolean;
  /** 持久 outbox 跨运行重试的基础退避；默认 5 分钟 */
  outboxRetryBaseMs?: number;
  /** 持久 outbox 跨运行重试的最大退避；默认 6 小时 */
  outboxRetryMaxMs?: number;
}

export interface StandaloneConfig {
  /**
   * Pixiv API credentials
   */
  pixiv: PixivCredentialConfig;
  /**
   * Network configuration
   */
  network?: NetworkConfig;
  /**
   * Storage configuration
   */
  storage?: StorageConfig;
  /**
   * Scheduler configuration
   */
  scheduler?: SchedulerConfig;
  /** Independent schedules. When present, these replace the legacy cron. */
  schedules?: ScheduleConfig[];
  /** Low-memory scheduler and hot-reload controls. */
  schedulerRuntime?: SchedulerRuntimeConfig;
  /**
   * Download targets (tags to download)
   */
  targets: TargetConfig[];
  /**
   * 缓存模式的通用交付配置(storageMode='cache' 时使用)
   */
  delivery?: DeliveryConfig;
  /**
   * Log level: 'debug' | 'info' | 'warn' | 'error'
   * Default: 'info'
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /**
   * Initial delay before starting download (in milliseconds)
   * Useful for testing or when you want to delay the start of downloads
   * Default: 0 (no delay)
   */
  initialDelay?: number;
  /**
   * Download configuration
   */
  download?: {
    /**
     * Maximum concurrent downloads
     * Default: 3
     */
    concurrency?: number;
    /**
     * Minimum delay between API requests (in milliseconds)
     * Helps avoid rate limiting by spacing out requests
     * Default: 500
     */
    requestDelay?: number;
    /**
     * Enable dynamic concurrency adjustment
     * Automatically reduces concurrency when rate limited
     * Default: true
     */
    dynamicConcurrency?: boolean;
    /**
     * Minimum concurrency when dynamically adjusted
     * Default: 1
     */
    minConcurrency?: number;
    /**
     * Maximum retries per download
     * Default: 3
     */
    maxRetries?: number;
    /**
     * Delay between retries (in milliseconds)
     * Default: 2000
     */
    retryDelay?: number;
    /**
     * Download timeout (in milliseconds)
     * Default: 60000
     */
    timeout?: number;
  };
}






















































