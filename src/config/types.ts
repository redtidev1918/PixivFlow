/**
 * Configuration type definitions
 */

export type TargetType = 'illustration' | 'novel';

export interface TargetConfig {
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
   * Download mode: 'search' (default) or 'ranking'
   * - 'search': Search by tag
   * - 'ranking': Download from ranking, then filter by tag
   */
  mode?: 'search' | 'ranking';
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
   * Filter ranking results by tag (only used when mode='ranking')
   * If specified, only downloads works that contain this tag
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
   * Enable language detection and logging for novels (only used when type='novel')
   * If true, detected language will be logged and saved in metadata
   * Default: true
   */
  detectLanguage?: boolean;
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
  /**
   * Download targets (tags to download)
   */
  targets: TargetConfig[];
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













