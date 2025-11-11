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
import { StandaloneConfig } from '../config';
import { initializeFieldDefinitions, getFieldDefinition } from './config-parser/field-definitions';
import { parseObject, extractComments } from './config-parser/parser';
import { validateConfig } from './config-parser/validator';
import { generateReport, findFields, getFieldsByType, getMissingRequiredFields } from './config-parser/reporter';

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
  }>;

  constructor() {
    this.fieldDefinitions = initializeFieldDefinitions();
  }

  /**
   * Parse a configuration file
   */
  parseFile(filePath: string): ConfigParseResult {
    const resolvedPath = resolve(filePath);
    
    if (!existsSync(resolvedPath)) {
      return this.createEmptyResult(`File not found: ${resolvedPath}`);
    }

    try {
      const rawContent = readFileSync(resolvedPath, 'utf-8');
      const config = JSON.parse(rawContent) as Partial<StandaloneConfig>;
      return this.parseConfigInternal(config, rawContent);
    } catch (error) {
      return this.createEmptyResult(
        `Failed to parse file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse a configuration object directly
   */
  parseConfig(config: Partial<StandaloneConfig>): ConfigParseResult {
    return this.parseConfigInternal(config, JSON.stringify(config, null, 2));
  }

  /**
   * Internal method to parse configuration
   */
  private parseConfigInternal(
    config: Partial<StandaloneConfig>,
    rawContent: string
  ): ConfigParseResult {
    // Extract comments
    const comments = extractComments(config);

    // Parse all fields
    const allFields = parseObject(config, this.fieldDefinitions);

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

    // Validate configuration
    const { errors, warnings } = validateConfig(allFields, config);

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
  }

  /**
   * Create an empty result with error
   */
  private createEmptyResult(errorMessage: string): ConfigParseResult {
    return {
      fields: [],
      rootFields: [],
      sections: {},
      config: {},
      rawContent: '',
      errors: [errorMessage],
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

  /**
   * Generate a human-readable report
   */
  generateReport(result: ConfigParseResult): string {
    return generateReport(result);
  }

  /**
   * Get fields by path pattern
   */
  findFields(result: ConfigParseResult, pattern: string | RegExp): ConfigField[] {
    return findFields(result, pattern);
  }

  /**
   * Get fields by type
   */
  getFieldsByType(result: ConfigParseResult, type: string): ConfigField[] {
    return getFieldsByType(result, type);
  }

  /**
   * Get required fields that are missing
   */
  getMissingRequiredFields(result: ConfigParseResult): ConfigField[] {
    return getMissingRequiredFields(result);
  }
}
