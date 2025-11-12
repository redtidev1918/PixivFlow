/**
 * Configuration Validator
 * 
 * Validates configuration structure and required fields
 */

import { ConfigField, ConfigParseResult } from '../config-parser';
import { StandaloneConfig } from '../../config';

/**
 * Validate configuration fields
 */
export function validateConfig(
  fields: ConfigField[],
  config: Partial<StandaloneConfig>
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required fields
  fields.forEach((field) => {
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

  return { errors, warnings };
}





























