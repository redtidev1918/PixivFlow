/**
 * Configuration file operations
 * Handles reading, writing, and importing configuration files
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { logger } from '../../logger';
import { StandaloneConfig } from '../../config';

/**
 * Read a configuration file
 */
export function readConfigFile(path: string): StandaloneConfig | null {
  try {
    const resolvedPath = resolve(path);
    if (!existsSync(resolvedPath)) {
      return null;
    }
    const content = readFileSync(resolvedPath, 'utf-8');
    return JSON.parse(content) as StandaloneConfig;
  } catch (error) {
    logger.error('Failed to read config file', {
      error: error instanceof Error ? error.message : String(error),
      path,
    });
    return null;
  }
}

/**
 * Save configuration to a specific file
 */
export function saveConfigFile(config: StandaloneConfig, path: string): void {
  const resolvedPath = resolve(path);
  const dir = dirname(resolvedPath);
  
  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  const jsonString = JSON.stringify(config, null, 2);
  writeFileSync(resolvedPath, jsonString, 'utf-8');
  
  logger.info('Saved configuration', { path: resolvedPath });
}

/**
 * Import a configuration and save it with auto-numbering
 * @param config - Configuration object to save
 * @param filename - Filename to use
 * @param configDir - Directory to save in
 * @returns Path to the saved config file
 */
export function importConfigFile(
  config: StandaloneConfig,
  filename: string,
  configDir: string
): string {
  const { join } = require('path');
  const path = join(configDir, filename);
  
  // Ensure the config is valid JSON
  const jsonString = JSON.stringify(config, null, 2);
  writeFileSync(path, jsonString, 'utf-8');
  
  logger.info('Imported configuration', { filename, path });
  return path;
}

