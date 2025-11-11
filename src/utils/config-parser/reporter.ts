/**
 * Configuration Reporter
 * 
 * Generates human-readable reports and provides field query utilities
 */

import { ConfigField, ConfigParseResult } from '../config-parser';

/**
 * Generate a human-readable report
 */
export function generateReport(result: ConfigParseResult): string {
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
export function findFields(result: ConfigParseResult, pattern: string | RegExp): ConfigField[] {
  if (typeof pattern === 'string') {
    return result.fields.filter((field) => field.path.includes(pattern));
  }
  return result.fields.filter((field) => pattern.test(field.path));
}

/**
 * Get fields by type
 */
export function getFieldsByType(result: ConfigParseResult, type: string): ConfigField[] {
  return result.fields.filter((field) => field.type === type);
}

/**
 * Get required fields that are missing
 */
export function getMissingRequiredFields(result: ConfigParseResult): ConfigField[] {
  return result.fields.filter(
    (field) => field.required && (field.value === undefined || field.value === null)
  );
}




















