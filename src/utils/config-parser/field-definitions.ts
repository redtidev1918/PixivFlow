/**
 * Configuration Field Definitions
 * 
 * Manages field definitions with metadata (required, description, default values, etc.)
 */

export interface FieldDefinition {
  required: boolean;
  description?: string;
  defaultValue?: any;
  enumValues?: any[];
  type?: string;
}

/**
 * Initialize root level field definitions
 */
function initializeRootFields(definitions: Map<string, FieldDefinition>): void {
  definitions.set('logLevel', {
    required: false,
    description: 'Log level: debug | info | warn | error',
    defaultValue: 'info',
    enumValues: ['debug', 'info', 'warn', 'error'],
    type: 'string',
  });

  definitions.set('initialDelay', {
    required: false,
    description: 'Initial delay before starting download (in milliseconds)',
    defaultValue: 0,
    type: 'number',
  });
}

/**
 * Initialize Pixiv section field definitions
 */
function initializePixivFields(definitions: Map<string, FieldDefinition>): void {
  definitions.set('pixiv.clientId', {
    required: true,
    description: 'Pixiv API client ID',
    type: 'string',
  });

  definitions.set('pixiv.clientSecret', {
    required: false,
    description: 'Pixiv API client secret',
    type: 'string',
  });

  definitions.set('pixiv.deviceToken', {
    required: false,
    description: 'Pixiv API device token',
    defaultValue: 'pixiv',
    type: 'string',
  });

  definitions.set('pixiv.refreshToken', {
    required: true,
    description: 'Pixiv API refresh token',
    type: 'string',
  });

  definitions.set('pixiv.userAgent', {
    required: false,
    description: 'User agent string for API requests',
    defaultValue: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
    type: 'string',
  });
}

/**
 * Initialize Network section field definitions
 */
function initializeNetworkFields(definitions: Map<string, FieldDefinition>): void {
  definitions.set('network.timeoutMs', {
    required: false,
    description: 'Request timeout in milliseconds',
    defaultValue: 30000,
    type: 'number',
  });

  definitions.set('network.retries', {
    required: false,
    description: 'Number of retries for failed requests',
    defaultValue: 3,
    type: 'number',
  });

  definitions.set('network.retryDelay', {
    required: false,
    description: 'Delay between retries in milliseconds',
    defaultValue: 1000,
    type: 'number',
  });

  definitions.set('network.proxy.enabled', {
    required: false,
    description: 'Enable proxy',
    defaultValue: false,
    type: 'boolean',
  });

  definitions.set('network.proxy.host', {
    required: false,
    description: 'Proxy host',
    type: 'string',
  });

  definitions.set('network.proxy.port', {
    required: false,
    description: 'Proxy port',
    type: 'number',
  });

  definitions.set('network.proxy.protocol', {
    required: false,
    description: 'Proxy protocol',
    enumValues: ['http', 'https', 'socks4', 'socks5'],
    type: 'string',
  });

  definitions.set('network.proxy.username', {
    required: false,
    description: 'Proxy username',
    type: 'string',
  });

  definitions.set('network.proxy.password', {
    required: false,
    description: 'Proxy password',
    type: 'string',
  });
}

/**
 * Initialize Storage section field definitions
 */
function initializeStorageFields(definitions: Map<string, FieldDefinition>): void {
  const organizationEnumValues = [
    'flat', 'byAuthor', 'byTag', 'byDate', 'byDay',
    'byDownloadDate', 'byDownloadDay', 'byAuthorAndTag',
    'byDateAndAuthor', 'byDayAndAuthor', 'byDownloadDateAndAuthor',
    'byDownloadDayAndAuthor',
  ];

  definitions.set('storage.databasePath', {
    required: false,
    description: 'Path to SQLite database file',
    defaultValue: './data/pixiv-downloader.db',
    type: 'string',
  });

  definitions.set('storage.downloadDirectory', {
    required: false,
    description: 'Root directory for downloads',
    defaultValue: './downloads',
    type: 'string',
  });

  definitions.set('storage.illustrationDirectory', {
    required: false,
    description: 'Directory for illustrations',
    type: 'string',
  });

  definitions.set('storage.novelDirectory', {
    required: false,
    description: 'Directory for novels',
    type: 'string',
  });

  definitions.set('storage.illustrationOrganization', {
    required: false,
    description: 'Directory organization mode for illustrations',
    defaultValue: 'flat',
    enumValues: organizationEnumValues,
    type: 'string',
  });

  definitions.set('storage.novelOrganization', {
    required: false,
    description: 'Directory organization mode for novels',
    defaultValue: 'flat',
    enumValues: organizationEnumValues,
    type: 'string',
  });
}

/**
 * Initialize Scheduler section field definitions
 */
function initializeSchedulerFields(definitions: Map<string, FieldDefinition>): void {
  definitions.set('scheduler.enabled', {
    required: false,
    description: 'Enable scheduler',
    defaultValue: false,
    type: 'boolean',
  });

  definitions.set('scheduler.cron', {
    required: false,
    description: 'Cron expression for scheduling',
    type: 'string',
  });

  definitions.set('scheduler.timezone', {
    required: false,
    description: 'Timezone for scheduler',
    defaultValue: 'Asia/Shanghai',
    type: 'string',
  });

  definitions.set('scheduler.maxExecutions', {
    required: false,
    description: 'Maximum number of executions',
    type: 'number',
  });

  definitions.set('scheduler.minInterval', {
    required: false,
    description: 'Minimum interval between executions (ms)',
    type: 'number',
  });

  definitions.set('scheduler.timeout', {
    required: false,
    description: 'Maximum execution time (ms)',
    type: 'number',
  });

  definitions.set('scheduler.maxConsecutiveFailures', {
    required: false,
    description: 'Maximum consecutive failures',
    type: 'number',
  });

  definitions.set('scheduler.failureRetryDelay', {
    required: false,
    description: 'Delay before retrying after failure (ms)',
    type: 'number',
  });
}

/**
 * Initialize Download section field definitions
 */
function initializeDownloadFields(definitions: Map<string, FieldDefinition>): void {
  definitions.set('download.concurrency', {
    required: false,
    description: 'Maximum concurrent downloads',
    defaultValue: 3,
    type: 'number',
  });

  definitions.set('download.requestDelay', {
    required: false,
    description: 'Minimum delay between API requests (ms)',
    defaultValue: 500,
    type: 'number',
  });

  definitions.set('download.dynamicConcurrency', {
    required: false,
    description: 'Enable dynamic concurrency adjustment',
    defaultValue: true,
    type: 'boolean',
  });

  definitions.set('download.minConcurrency', {
    required: false,
    description: 'Minimum concurrency when dynamically adjusted',
    defaultValue: 1,
    type: 'number',
  });

  definitions.set('download.maxRetries', {
    required: false,
    description: 'Maximum retries per download',
    defaultValue: 3,
    type: 'number',
  });

  definitions.set('download.retryDelay', {
    required: false,
    description: 'Delay between retries (ms)',
    defaultValue: 2000,
    type: 'number',
  });

  definitions.set('download.timeout', {
    required: false,
    description: 'Download timeout (ms)',
    defaultValue: 60000,
    type: 'number',
  });
}

/**
 * Initialize Target section field definitions
 */
function initializeTargetFields(definitions: Map<string, FieldDefinition>): void {
  definitions.set('targets[].type', {
    required: true,
    description: 'Target type: illustration | novel',
    enumValues: ['illustration', 'novel'],
    type: 'string',
  });

  definitions.set('targets[].tag', {
    required: false,
    description: 'Search tag',
    type: 'string',
  });

  definitions.set('targets[].limit', {
    required: false,
    description: 'Maximum works to download per execution',
    type: 'number',
  });

  definitions.set('targets[].searchTarget', {
    required: false,
    description: 'Search target parameter',
    enumValues: ['partial_match_for_tags', 'exact_match_for_tags', 'title_and_caption'],
    type: 'string',
  });

  definitions.set('targets[].sort', {
    required: false,
    description: 'Sort order',
    enumValues: ['date_desc', 'date_asc', 'popular_desc'],
    type: 'string',
  });

  definitions.set('targets[].mode', {
    required: false,
    description: 'Download mode: search | ranking',
    defaultValue: 'search',
    enumValues: ['search', 'ranking'],
    type: 'string',
  });

  definitions.set('targets[].rankingMode', {
    required: false,
    description: 'Ranking mode',
    enumValues: [
      'day', 'week', 'month', 'day_male', 'day_female', 'day_ai',
      'week_original', 'week_rookie', 'day_r18', 'day_male_r18', 'day_female_r18',
    ],
    type: 'string',
  });

  definitions.set('targets[].rankingDate', {
    required: false,
    description: 'Ranking date (YYYY-MM-DD format)',
    type: 'string',
  });

  definitions.set('targets[].filterTag', {
    required: false,
    description: 'Filter ranking results by tag',
    type: 'string',
  });

  definitions.set('targets[].minBookmarks', {
    required: false,
    description: 'Minimum number of bookmarks required',
    type: 'number',
  });

  definitions.set('targets[].startDate', {
    required: false,
    description: 'Start date for filtering (YYYY-MM-DD)',
    type: 'string',
  });

  definitions.set('targets[].endDate', {
    required: false,
    description: 'End date for filtering (YYYY-MM-DD)',
    type: 'string',
  });

  definitions.set('targets[].seriesId', {
    required: false,
    description: 'Novel series ID',
    type: 'number',
  });

  definitions.set('targets[].novelId', {
    required: false,
    description: 'Novel ID',
    type: 'number',
  });

  definitions.set('targets[].illustId', {
    required: false,
    description: 'Illustration ID',
    type: 'number',
  });
}

/**
 * Initialize all field definitions
 */
export function initializeFieldDefinitions(): Map<string, FieldDefinition> {
  const fieldDefinitions = new Map<string, FieldDefinition>();

  initializeRootFields(fieldDefinitions);
  initializePixivFields(fieldDefinitions);
  initializeNetworkFields(fieldDefinitions);
  initializeStorageFields(fieldDefinitions);
  initializeSchedulerFields(fieldDefinitions);
  initializeDownloadFields(fieldDefinitions);
  initializeTargetFields(fieldDefinitions);

  return fieldDefinitions;
}

/**
 * Get field definition for a given path
 */
export function getFieldDefinition(
  path: string,
  fieldDefinitions: Map<string, FieldDefinition>
): FieldDefinition | undefined {
  // Try exact match first
  let def = fieldDefinitions.get(path);
  if (def) return def;

  // Try pattern matching for array fields
  const arrayMatch = path.match(/^targets\[(\d+)\]\.(.+)$/);
  if (arrayMatch) {
    const fieldName = arrayMatch[2];
    const arrayDef = fieldDefinitions.get(`targets[].${fieldName}`);
    if (arrayDef) return arrayDef;
  }

  return undefined;
}












