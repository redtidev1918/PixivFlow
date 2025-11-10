/**
 * Configuration Parser
 * 
 * A comprehensive tool for reading and identifying every element in configuration JSON files.
 * This tool can:
 * - Parse configuration files and extract all fields
 * - Identify field types, paths, and values
 * - Extract comments and documentation
 * - Generate detailed configuration reports
 * - Validate configuration structure
 * 
 * Usage:
 *   import { ConfigParser } from './utils/config-parser';
 *   const parser = new ConfigParser();
 *   const result = parser.parseFile('config/standalone.config.json');
 *   console.log(result);
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { StandaloneConfig, TargetConfig } from '../config';

export interface ConfigField {
  /** Full path to the field (e.g., "pixiv.clientId") */
  path: string;
  /** Field name */
  name: string;
  /** Field value */
  value: any;
  /** Field type (string, number, boolean, object, array, null, undefined) */
  type: string;
  /** Whether the field is required */
  required: boolean;
  /** Field description/comment if available */
  description?: string;
  /** Default value if available */
  defaultValue?: any;
  /** Possible values for enum types */
  enumValues?: any[];
  /** Parent field path */
  parentPath?: string;
  /** Depth in the object tree */
  depth: number;
  /** Whether this is a leaf node (not an object or array) */
  isLeaf: boolean;
  /** Array index if this field is in an array */
  arrayIndex?: number;
}

export interface ConfigParseResult {
  /** All fields found in the configuration */
  fields: ConfigField[];
  /** Root-level fields */
  rootFields: ConfigField[];
  /** Fields organized by section */
  sections: Record<string, ConfigField[]>;
  /** Configuration object */
  config: Partial<StandaloneConfig>;
  /** Raw JSON content */
  rawContent: string;
  /** Parse errors if any */
  errors: string[];
  /** Warnings */
  warnings: string[];
  /** Statistics */
  stats: {
    totalFields: number;
    totalSections: number;
    totalTargets: number;
    maxDepth: number;
    fieldTypes: Record<string, number>;
  };
}

/**
 * Configuration Parser Class
 */
export class ConfigParser {
  private fieldDefinitions: Map<string, {
    required: boolean;
    description?: string;
    defaultValue?: any;
    enumValues?: any[];
    type?: string;
  }> = new Map();

  constructor() {
    this.initializeFieldDefinitions();
  }

  /**
   * Initialize field definitions with metadata
   */
  private initializeFieldDefinitions(): void {
    // Root level fields
    this.fieldDefinitions.set('logLevel', {
      required: false,
      description: 'Log level: debug | info | warn | error',
      defaultValue: 'info',
      enumValues: ['debug', 'info', 'warn', 'error'],
      type: 'string',
    });

    this.fieldDefinitions.set('initialDelay', {
      required: false,
      description: 'Initial delay before starting download (in milliseconds)',
      defaultValue: 0,
      type: 'number',
    });

    // Pixiv section
    this.fieldDefinitions.set('pixiv.clientId', {
      required: true,
      description: 'Pixiv API client ID',
      type: 'string',
    });

    this.fieldDefinitions.set('pixiv.clientSecret', {
      required: false,
      description: 'Pixiv API client secret',
      type: 'string',
    });

    this.fieldDefinitions.set('pixiv.deviceToken', {
      required: false,
      description: 'Pixiv API device token',
      defaultValue: 'pixiv',
      type: 'string',
    });

    this.fieldDefinitions.set('pixiv.refreshToken', {
      required: true,
      description: 'Pixiv API refresh token',
      type: 'string',
    });

    this.fieldDefinitions.set('pixiv.userAgent', {
      required: false,
      description: 'User agent string for API requests',
      defaultValue: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
      type: 'string',
    });

    // Network section
    this.fieldDefinitions.set('network.timeoutMs', {
      required: false,
      description: 'Request timeout in milliseconds',
      defaultValue: 30000,
      type: 'number',
    });

    this.fieldDefinitions.set('network.retries', {
      required: false,
      description: 'Number of retries for failed requests',
      defaultValue: 3,
      type: 'number',
    });

    this.fieldDefinitions.set('network.retryDelay', {
      required: false,
      description: 'Delay between retries in milliseconds',
      defaultValue: 1000,
      type: 'number',
    });

    this.fieldDefinitions.set('network.proxy.enabled', {
      required: false,
      description: 'Enable proxy',
      defaultValue: false,
      type: 'boolean',
    });

    this.fieldDefinitions.set('network.proxy.host', {
      required: false,
      description: 'Proxy host',
      type: 'string',
    });

    this.fieldDefinitions.set('network.proxy.port', {
      required: false,
      description: 'Proxy port',
      type: 'number',
    });

    this.fieldDefinitions.set('network.proxy.protocol', {
      required: false,
      description: 'Proxy protocol',
      enumValues: ['http', 'https', 'socks4', 'socks5'],
      type: 'string',
    });

    this.fieldDefinitions.set('network.proxy.username', {
      required: false,
      description: 'Proxy username',
      type: 'string',
    });

    this.fieldDefinitions.set('network.proxy.password', {
      required: false,
      description: 'Proxy password',
      type: 'string',
    });

    // Storage section
    this.fieldDefinitions.set('storage.databasePath', {
      required: false,
      description: 'Path to SQLite database file',
      defaultValue: './data/pixiv-downloader.db',
      type: 'string',
    });

    this.fieldDefinitions.set('storage.downloadDirectory', {
      required: false,
      description: 'Root directory for downloads',
      defaultValue: './downloads',
      type: 'string',
    });

    this.fieldDefinitions.set('storage.illustrationDirectory', {
      required: false,
      description: 'Directory for illustrations',
      type: 'string',
    });

    this.fieldDefinitions.set('storage.novelDirectory', {
      required: false,
      description: 'Directory for novels',
      type: 'string',
    });

    this.fieldDefinitions.set('storage.illustrationOrganization', {
      required: false,
      description: 'Directory organization mode for illustrations',
      defaultValue: 'flat',
      enumValues: [
        'flat', 'byAuthor', 'byTag', 'byDate', 'byDay',
        'byDownloadDate', 'byDownloadDay', 'byAuthorAndTag',
        'byDateAndAuthor', 'byDayAndAuthor', 'byDownloadDateAndAuthor',
        'byDownloadDayAndAuthor',
      ],
      type: 'string',
    });

    this.fieldDefinitions.set('storage.novelOrganization', {
      required: false,
      description: 'Directory organization mode for novels',
      defaultValue: 'flat',
      enumValues: [
        'flat', 'byAuthor', 'byTag', 'byDate', 'byDay',
        'byDownloadDate', 'byDownloadDay', 'byAuthorAndTag',
        'byDateAndAuthor', 'byDayAndAuthor', 'byDownloadDateAndAuthor',
        'byDownloadDayAndAuthor',
      ],
      type: 'string',
    });

    // Scheduler section
    this.fieldDefinitions.set('scheduler.enabled', {
      required: false,
      description: 'Enable scheduler',
      defaultValue: false,
      type: 'boolean',
    });

    this.fieldDefinitions.set('scheduler.cron', {
      required: false,
      description: 'Cron expression for scheduling',
      type: 'string',
    });

    this.fieldDefinitions.set('scheduler.timezone', {
      required: false,
      description: 'Timezone for scheduler',
      defaultValue: 'Asia/Shanghai',
      type: 'string',
    });

    this.fieldDefinitions.set('scheduler.maxExecutions', {
      required: false,
      description: 'Maximum number of executions',
      type: 'number',
    });

    this.fieldDefinitions.set('scheduler.minInterval', {
      required: false,
      description: 'Minimum interval between executions (ms)',
      type: 'number',
    });

    this.fieldDefinitions.set('scheduler.timeout', {
      required: false,
      description: 'Maximum execution time (ms)',
      type: 'number',
    });

    this.fieldDefinitions.set('scheduler.maxConsecutiveFailures', {
      required: false,
      description: 'Maximum consecutive failures',
      type: 'number',
    });

    this.fieldDefinitions.set('scheduler.failureRetryDelay', {
      required: false,
      description: 'Delay before retrying after failure (ms)',
      type: 'number',
    });

    // Download section
    this.fieldDefinitions.set('download.concurrency', {
      required: false,
      description: 'Maximum concurrent downloads',
      defaultValue: 3,
      type: 'number',
    });

    this.fieldDefinitions.set('download.requestDelay', {
      required: false,
      description: 'Minimum delay between API requests (ms)',
      defaultValue: 500,
      type: 'number',
    });

    this.fieldDefinitions.set('download.dynamicConcurrency', {
      required: false,
      description: 'Enable dynamic concurrency adjustment',
      defaultValue: true,
      type: 'boolean',
    });

    this.fieldDefinitions.set('download.minConcurrency', {
      required: false,
      description: 'Minimum concurrency when dynamically adjusted',
      defaultValue: 1,
      type: 'number',
    });

    this.fieldDefinitions.set('download.maxRetries', {
      required: false,
      description: 'Maximum retries per download',
      defaultValue: 3,
      type: 'number',
    });

    this.fieldDefinitions.set('download.retryDelay', {
      required: false,
      description: 'Delay between retries (ms)',
      defaultValue: 2000,
      type: 'number',
    });

    this.fieldDefinitions.set('download.timeout', {
      required: false,
      description: 'Download timeout (ms)',
      defaultValue: 60000,
      type: 'number',
    });

    // Target fields
    this.fieldDefinitions.set('targets[].type', {
      required: true,
      description: 'Target type: illustration | novel',
      enumValues: ['illustration', 'novel'],
      type: 'string',
    });

    this.fieldDefinitions.set('targets[].tag', {
      required: false,
      description: 'Search tag',
      type: 'string',
    });

    this.fieldDefinitions.set('targets[].limit', {
      required: false,
      description: 'Maximum works to download per execution',
      type: 'number',
    });

    this.fieldDefinitions.set('targets[].searchTarget', {
      required: false,
      description: 'Search target parameter',
      enumValues: ['partial_match_for_tags', 'exact_match_for_tags', 'title_and_caption'],
      type: 'string',
    });

    this.fieldDefinitions.set('targets[].sort', {
      required: false,
      description: 'Sort order',
      enumValues: ['date_desc', 'date_asc', 'popular_desc'],
      type: 'string',
    });

    this.fieldDefinitions.set('targets[].mode', {
      required: false,
      description: 'Download mode: search | ranking',
      defaultValue: 'search',
      enumValues: ['search', 'ranking'],
      type: 'string',
    });

    this.fieldDefinitions.set('targets[].rankingMode', {
      required: false,
      description: 'Ranking mode',
      enumValues: [
        'day', 'week', 'month', 'day_male', 'day_female', 'day_ai',
        'week_original', 'week_rookie', 'day_r18', 'day_male_r18', 'day_female_r18',
      ],
      type: 'string',
    });

    this.fieldDefinitions.set('targets[].rankingDate', {
      required: false,
      description: 'Ranking date (YYYY-MM-DD format)',
      type: 'string',
    });

    this.fieldDefinitions.set('targets[].filterTag', {
      required: false,
      description: 'Filter ranking results by tag',
      type: 'string',
    });

    this.fieldDefinitions.set('targets[].minBookmarks', {
      required: false,
      description: 'Minimum number of bookmarks required',
      type: 'number',
    });

    this.fieldDefinitions.set('targets[].startDate', {
      required: false,
      description: 'Start date for filtering (YYYY-MM-DD)',
      type: 'string',
    });

    this.fieldDefinitions.set('targets[].endDate', {
      required: false,
      description: 'End date for filtering (YYYY-MM-DD)',
      type: 'string',
    });

    this.fieldDefinitions.set('targets[].seriesId', {
      required: false,
      description: 'Novel series ID',
      type: 'number',
    });

    this.fieldDefinitions.set('targets[].novelId', {
      required: false,
      description: 'Novel ID',
      type: 'number',
    });
  }

  /**
   * Get field definition for a given path
   */
  private getFieldDefinition(path: string): {
    required: boolean;
    description?: string;
    defaultValue?: any;
    enumValues?: any[];
    type?: string;
  } | undefined {
    // Try exact match first
    let def = this.fieldDefinitions.get(path);
    if (def) return def;

    // Try pattern matching for array fields
    const arrayMatch = path.match(/^targets\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const fieldName = arrayMatch[2];
      const arrayDef = this.fieldDefinitions.get(`targets[].${fieldName}`);
      if (arrayDef) return arrayDef;
    }

    return undefined;
  }

  /**
   * Get JavaScript type of a value
   */
  private getValueType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Recursively parse an object and extract all fields
   */
  private parseObject(
    obj: any,
    parentPath: string = '',
    depth: number = 0,
    fields: ConfigField[] = []
  ): ConfigField[] {
    if (obj === null || obj === undefined) {
      return fields;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        const arrayPath = parentPath ? `${parentPath}[${index}]` : `[${index}]`;
        if (typeof item === 'object' && item !== null) {
          this.parseObject(item, arrayPath, depth + 1, fields);
        } else {
          const fieldDef = this.getFieldDefinition(parentPath.replace(/\[\d+\]/g, '[]'));
          fields.push({
            path: arrayPath,
            name: `[${index}]`,
            value: item,
            type: this.getValueType(item),
            required: fieldDef?.required || false,
            description: fieldDef?.description,
            defaultValue: fieldDef?.defaultValue,
            enumValues: fieldDef?.enumValues,
            parentPath: parentPath,
            depth: depth,
            isLeaf: true,
            arrayIndex: index,
          });
        }
      });
      return fields;
    }

    if (typeof obj === 'object') {
      Object.keys(obj).forEach((key) => {
        // Skip comment fields
        if (key.startsWith('_')) {
          return;
        }

        const currentPath = parentPath ? `${parentPath}.${key}` : key;
        const value = obj[key];
        const valueType = this.getValueType(value);

        if (valueType === 'object' && !Array.isArray(value) && value !== null) {
          // Nested object - add parent field and recurse
          const fieldDef = this.getFieldDefinition(currentPath);
          fields.push({
            path: currentPath,
            name: key,
            value: value,
            type: 'object',
            required: fieldDef?.required || false,
            description: fieldDef?.description,
            defaultValue: fieldDef?.defaultValue,
            parentPath: parentPath,
            depth: depth,
            isLeaf: false,
          });
          this.parseObject(value, currentPath, depth + 1, fields);
        } else if (Array.isArray(value)) {
          // Array - add parent field and recurse
          const fieldDef = this.getFieldDefinition(currentPath);
          fields.push({
            path: currentPath,
            name: key,
            value: value,
            type: 'array',
            required: fieldDef?.required || false,
            description: fieldDef?.description,
            defaultValue: fieldDef?.defaultValue,
            parentPath: parentPath,
            depth: depth,
            isLeaf: false,
          });
          this.parseObject(value, currentPath, depth + 1, fields);
        } else {
          // Leaf node
          const fieldDef = this.getFieldDefinition(currentPath);
          fields.push({
            path: currentPath,
            name: key,
            value: value,
            type: valueType,
            required: fieldDef?.required || false,
            description: fieldDef?.description,
            defaultValue: fieldDef?.defaultValue,
            enumValues: fieldDef?.enumValues,
            parentPath: parentPath,
            depth: depth,
            isLeaf: true,
          });
        }
      });
    }

    return fields;
  }

  /**
   * Extract comments from JSON (fields starting with _)
   */
  private extractComments(obj: any, path: string = ''): Map<string, string> {
    const comments = new Map<string, string>();
    
    if (typeof obj !== 'object' || obj === null) {
      return comments;
    }

    Object.keys(obj).forEach((key) => {
      const currentPath = path ? `${path}.${key}` : key;
      const value = obj[key];

      if (key.startsWith('_')) {
        // This is a comment field
        const targetPath = key.replace(/^_/, '').replace(/_comment$/, '').replace(/_note$/, '');
        const commentPath = path ? `${path}.${targetPath}` : targetPath;
        comments.set(commentPath, typeof value === 'string' ? value : JSON.stringify(value));
      } else if (typeof value === 'object' && value !== null) {
        // Recurse into nested objects
        const nestedComments = this.extractComments(value, currentPath);
        nestedComments.forEach((comment, commentPath) => {
          comments.set(commentPath, comment);
        });
      }
    });

    return comments;
  }

  /**
   * Parse a configuration file
   */
  parseFile(filePath: string): ConfigParseResult {
    const resolvedPath = resolve(filePath);
    
    if (!existsSync(resolvedPath)) {
      return {
        fields: [],
        rootFields: [],
        sections: {},
        config: {},
        rawContent: '',
        errors: [`File not found: ${resolvedPath}`],
        warnings: [],
        stats: {
          totalFields: 0,
          totalSections: 0,
          totalTargets: 0,
          maxDepth: 0,
          fieldTypes: {},
        },
      };
    }

    try {
      const rawContent = readFileSync(resolvedPath, 'utf-8');
      const config = JSON.parse(rawContent) as Partial<StandaloneConfig>;

      // Extract comments
      const comments = this.extractComments(config);

      // Parse all fields
      const allFields = this.parseObject(config);

      // Attach comments to fields
      allFields.forEach((field) => {
        const comment = comments.get(field.path);
        if (comment && !field.description) {
          field.description = comment;
        }
      });

      // Organize fields
      const rootFields = allFields.filter((f) => f.depth === 0);
      const sections: Record<string, ConfigField[]> = {};
      const fieldTypes: Record<string, number> = {};

      allFields.forEach((field) => {
        // Count field types
        fieldTypes[field.type] = (fieldTypes[field.type] || 0) + 1;

        // Organize by section
        const sectionMatch = field.path.match(/^([^.]+)/);
        if (sectionMatch) {
          const section = sectionMatch[1];
          if (!sections[section]) {
            sections[section] = [];
          }
          sections[section].push(field);
        }
      });

      // Count targets
      const targets = Array.isArray(config.targets) ? config.targets : [];
      const totalTargets = targets.length;

      // Find max depth
      const maxDepth = Math.max(...allFields.map((f) => f.depth), 0);

      // Validate required fields
      const errors: string[] = [];
      const warnings: string[] = [];

      allFields.forEach((field) => {
        if (field.required && (field.value === undefined || field.value === null)) {
          errors.push(`Required field missing: ${field.path}`);
        }
      });

      // Check for pixiv section
      if (!config.pixiv) {
        errors.push('Required section missing: pixiv');
      } else {
        if (!config.pixiv.clientId) {
          errors.push('Required field missing: pixiv.clientId');
        }
        if (!config.pixiv.refreshToken) {
          errors.push('Required field missing: pixiv.refreshToken');
        }
      }

      // Check for targets
      if (!config.targets || !Array.isArray(config.targets) || config.targets.length === 0) {
        warnings.push('No download targets configured');
      }

      return {
        fields: allFields,
        rootFields,
        sections,
        config,
        rawContent,
        errors,
        warnings,
        stats: {
          totalFields: allFields.length,
          totalSections: Object.keys(sections).length,
          totalTargets,
          maxDepth,
          fieldTypes,
        },
      };
    } catch (error) {
      return {
        fields: [],
        rootFields: [],
        sections: {},
        config: {},
        rawContent: '',
        errors: [`Failed to parse file: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        stats: {
          totalFields: 0,
          totalSections: 0,
          totalTargets: 0,
          maxDepth: 0,
          fieldTypes: {},
        },
      };
    }
  }

  /**
   * Parse a configuration object directly
   */
  parseConfig(config: Partial<StandaloneConfig>): ConfigParseResult {
    const comments = this.extractComments(config);
    const allFields = this.parseObject(config);

    // Attach comments
    allFields.forEach((field) => {
      const comment = comments.get(field.path);
      if (comment && !field.description) {
        field.description = comment;
      }
    });

    const rootFields = allFields.filter((f) => f.depth === 0);
    const sections: Record<string, ConfigField[]> = {};
    const fieldTypes: Record<string, number> = {};

    allFields.forEach((field) => {
      fieldTypes[field.type] = (fieldTypes[field.type] || 0) + 1;
      const sectionMatch = field.path.match(/^([^.]+)/);
      if (sectionMatch) {
        const section = sectionMatch[1];
        if (!sections[section]) {
          sections[section] = [];
        }
        sections[section].push(field);
      }
    });

    const targets = Array.isArray(config.targets) ? config.targets : [];
    const maxDepth = Math.max(...allFields.map((f) => f.depth), 0);

    const errors: string[] = [];
    const warnings: string[] = [];

    allFields.forEach((field) => {
      if (field.required && (field.value === undefined || field.value === null)) {
        errors.push(`Required field missing: ${field.path}`);
      }
    });

    if (!config.pixiv) {
      errors.push('Required section missing: pixiv');
    }

    if (!config.targets || !Array.isArray(config.targets) || config.targets.length === 0) {
      warnings.push('No download targets configured');
    }

    return {
      fields: allFields,
      rootFields,
      sections,
      config,
      rawContent: JSON.stringify(config, null, 2),
      errors,
      warnings,
      stats: {
        totalFields: allFields.length,
        totalSections: Object.keys(sections).length,
        totalTargets: targets.length,
        maxDepth,
        fieldTypes,
      },
    };
  }

  /**
   * Generate a human-readable report
   */
  generateReport(result: ConfigParseResult): string {
    const lines: string[] = [];
    
    lines.push('='.repeat(80));
    lines.push('Configuration Parse Report');
    lines.push('='.repeat(80));
    lines.push('');

    // Statistics
    lines.push('Statistics:');
    lines.push(`  Total Fields: ${result.stats.totalFields}`);
    lines.push(`  Total Sections: ${result.stats.totalSections}`);
    lines.push(`  Total Targets: ${result.stats.totalTargets}`);
    lines.push(`  Max Depth: ${result.stats.maxDepth}`);
    lines.push(`  Field Types: ${JSON.stringify(result.stats.fieldTypes, null, 2)}`);
    lines.push('');

    // Errors
    if (result.errors.length > 0) {
      lines.push('Errors:');
      result.errors.forEach((error) => {
        lines.push(`  ❌ ${error}`);
      });
      lines.push('');
    }

    // Warnings
    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      result.warnings.forEach((warning) => {
        lines.push(`  ⚠️  ${warning}`);
      });
      lines.push('');
    }

    // Sections
    lines.push('Sections:');
    Object.keys(result.sections).forEach((section) => {
      lines.push(`  ${section}: ${result.sections[section].length} fields`);
    });
    lines.push('');

    // Fields by section
    Object.keys(result.sections).forEach((section) => {
      lines.push(`Section: ${section}`);
      lines.push('-'.repeat(80));
      result.sections[section].forEach((field) => {
        const indent = '  '.repeat(field.depth);
        const required = field.required ? ' [REQUIRED]' : '';
        const type = field.type ? ` (${field.type})` : '';
        lines.push(`${indent}${field.path}${type}${required}`);
        if (field.description) {
          lines.push(`${indent}  Description: ${field.description}`);
        }
        if (field.defaultValue !== undefined) {
          lines.push(`${indent}  Default: ${JSON.stringify(field.defaultValue)}`);
        }
        if (field.enumValues && field.enumValues.length > 0) {
          lines.push(`${indent}  Possible values: ${field.enumValues.join(', ')}`);
        }
        lines.push(`${indent}  Value: ${JSON.stringify(field.value)}`);
        lines.push('');
      });
    });

    return lines.join('\n');
  }

  /**
   * Get fields by path pattern
   */
  findFields(result: ConfigParseResult, pattern: string | RegExp): ConfigField[] {
    if (typeof pattern === 'string') {
      return result.fields.filter((field) => field.path.includes(pattern));
    }
    return result.fields.filter((field) => pattern.test(field.path));
  }

  /**
   * Get fields by type
   */
  getFieldsByType(result: ConfigParseResult, type: string): ConfigField[] {
    return result.fields.filter((field) => field.type === type);
  }

  /**
   * Get required fields that are missing
   */
  getMissingRequiredFields(result: ConfigParseResult): ConfigField[] {
    return result.fields.filter(
      (field) => field.required && (field.value === undefined || field.value === null)
    );
  }
}

