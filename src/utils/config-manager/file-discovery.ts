/**
 * Configuration file discovery
 * Handles listing and finding configuration files
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, resolve, extname } from 'path';
import { logger } from '../../logger';

export interface ConfigFileInfo {
  filename: string;
  path: string;
  modifiedTime: Date;
  size: number;
  isActive: boolean;
}

/**
 * Scan and list all configuration files in the directory
 * Returns files sorted by modification time (newest first)
 */
export function listConfigFiles(
  configDir: string,
  currentConfigPath: string | null
): ConfigFileInfo[] {
  try {
    const currentConfigResolved = currentConfigPath ? resolve(currentConfigPath) : null;
    
    // Read all files in config directory
    const allFiles = readdirSync(configDir);
    
    // Filter to include only JSON files (exclude hidden files like .current-config)
    const jsonFiles = allFiles.filter(file => {
      const isJson = extname(file) === '.json';
      const isNotHidden = !file.startsWith('.');
      return isJson && isNotHidden;
    });
    
    // Map to file info objects
    const files = jsonFiles
      .map(file => {
        try {
          const path = join(configDir, file);
          const resolvedPath = resolve(path);
          const stats = statSync(path);
          return {
            filename: file,
            path,
            modifiedTime: stats.mtime,
            size: stats.size,
            isActive: currentConfigResolved === resolvedPath,
          };
        } catch (error) {
          // Log but don't fail - skip files that can't be read
          logger.warn('Failed to read config file stats', {
            file,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      })
      .filter((file): file is ConfigFileInfo => file !== null)
      .sort((a, b) => {
        // Sort by modification time (newest first), then by filename
        const timeDiff = b.modifiedTime.getTime() - a.modifiedTime.getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.filename.localeCompare(b.filename);
      });

    // Log for debugging - helps identify if files are being filtered incorrectly
    logger.debug('Listed config files', {
      configDir,
      totalFiles: allFiles.length,
      jsonFiles: jsonFiles.length,
      returnedFiles: files.length,
      filenames: files.map(f => f.filename),
      currentConfig: currentConfigResolved,
    });

    return files;
  } catch (error) {
    logger.error('Failed to list config files', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      configDir,
    });
    return [];
  }
}

/**
 * Get the first available configuration file
 * Priority: standalone.config.json > other JSON files (sorted by modification time)
 */
export function getFirstAvailableConfig(configDir: string): string | null {
  const files = listConfigFiles(configDir, null);
  if (files.length === 0) {
    return null;
  }

  // First, try to find standalone.config.json (default config)
  const defaultFile = files.find(f => f.filename === 'standalone.config.json');
  if (defaultFile) {
    return defaultFile.path;
  }

  // Otherwise, return the first file (already sorted by modification time, newest first)
  return files[0].path;
}

/**
 * Get the next available numbered config filename
 * Returns: standalone.config.1.json, standalone.config.2.json, etc.
 */
export function getNextConfigFilename(configDir: string): string {
  const files = listConfigFiles(configDir, null);
  const numbers: number[] = [];

  // Extract numbers from existing files
  files.forEach(file => {
    const match = file.filename.match(/^standalone\.config\.(\d+)\.json$/);
    if (match) {
      numbers.push(parseInt(match[1], 10));
    }
  });

  // Find the next available number
  let nextNumber = 1;
  if (numbers.length > 0) {
    numbers.sort((a, b) => a - b);
    nextNumber = numbers[numbers.length - 1] + 1;
  }

  return `standalone.config.${nextNumber}.json`;
}

/**
 * Sanitize filename to be safe for filesystem
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 100); // Limit length
}

















































