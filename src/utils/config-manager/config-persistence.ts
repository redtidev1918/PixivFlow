/**
 * Configuration file persistence
 * Handles saving and loading the current active configuration file path
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { logger } from '../../logger';

const CURRENT_CONFIG_FILE = '.current-config';

/**
 * Get the path to the current config marker file
 */
export function getCurrentConfigFilePath(configDir: string): string {
  return join(configDir, CURRENT_CONFIG_FILE);
}

/**
 * Load the persisted current config file path
 */
export function loadCurrentConfigFile(configDir: string): string | null {
  try {
    const markerPath = getCurrentConfigFilePath(configDir);
    if (existsSync(markerPath)) {
      const content = readFileSync(markerPath, 'utf-8').trim();
      if (content && existsSync(content)) {
        logger.debug('Loaded persisted current config file', { path: content });
        return content;
      }
    }
  } catch (error) {
    logger.warn('Failed to load persisted current config file', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

/**
 * Persist the current config file path
 */
export function persistCurrentConfigFile(configDir: string, currentConfigFile: string | null): void {
  try {
    const markerPath = getCurrentConfigFilePath(configDir);
    if (currentConfigFile) {
      writeFileSync(markerPath, currentConfigFile, 'utf-8');
      logger.debug('Persisted current config file', { path: currentConfigFile });
    } else if (existsSync(markerPath)) {
      // Remove marker if no current config
      unlinkSync(markerPath);
    }
  } catch (error) {
    logger.warn('Failed to persist current config file', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}





















