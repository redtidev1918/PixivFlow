/**
 * Configuration path resolution utilities
 */

import { resolve, basename, isAbsolute, normalize } from 'node:path';
import { logger } from '../logger';
import { StandaloneConfig, StorageConfig } from './types';
import { DEFAULT_CONFIG } from './defaults';

/**
 * Normalize relative paths to prevent duplication
 * If the relative path contains 'downloads/', extract the part after it
 * This prevents paths like './downloads/illustrations' from becoming downloadDir/downloads/illustrations
 */
function normalizeRelativePath(relativePath: string): string {
  // Remove leading './' or './downloads/' or 'downloads/'
  let normalized = relativePath.replace(/^\.\//, '').replace(/^downloads\//, '');
  // If it still starts with 'downloads/', remove it again (handles './downloads/downloads/...')
  normalized = normalized.replace(/^downloads\//, '');
  return normalized;
}

/**
 * Detect and fix path duplication in absolute paths
 * Checks if an absolute path contains "downloads/downloads" and fixes it
 */
function fixAbsolutePathDuplication(absolutePath: string): string {
  const normalized = normalize(absolutePath);
  // Check if path contains "downloads/downloads" pattern
  if (normalized.includes('/downloads/downloads/')) {
    // Replace "downloads/downloads" with "downloads"
    const fixed = normalized.replace(/\/downloads\/downloads\//g, '/downloads/');
    logger.warn('Detected path duplication in absolute path, fixing', {
      original: absolutePath,
      fixed: fixed,
    });
    return fixed;
  }
  return normalized;
}

/**
 * Resolve storage paths in configuration
 */
function resolveStoragePaths(storage: StorageConfig, baseDir: string): void {
  // Determine the correct base directory for resolving relative paths
  // If config is in a subdirectory (like config/), use project root for download directories
  // This ensures "./downloads" resolves to project root, not config/downloads
  let pathBaseDir = baseDir;
  const projectRoot = resolve(baseDir, '..');
  const baseDirName = basename(baseDir);
  
  // If config is in a standard subdirectory (like "config"), use project root for storage paths
  // Check if the resolved path would be under config directory, and if so, use project root instead
  if (baseDirName === 'config' && !isAbsolute(storage.downloadDirectory!)) {
    const testPath = resolve(baseDir, storage.downloadDirectory!);
    // If the resolved path is under config directory, use project root instead
    if (testPath.startsWith(baseDir)) {
      pathBaseDir = projectRoot;
      logger.debug('Using project root for storage paths (config in subdirectory)', {
        configDir: baseDir,
        projectRoot: pathBaseDir,
        downloadDirectory: storage.downloadDirectory,
      });
    }
  }
  
  const downloadDir = isAbsolute(storage.downloadDirectory!)
    ? storage.downloadDirectory!
    : resolve(pathBaseDir, storage.downloadDirectory!);
  
  // Resolve illustration directory
  if (!storage.illustrationDirectory) {
    storage.illustrationDirectory = resolve(downloadDir, 'illustrations');
  } else if (!isAbsolute(storage.illustrationDirectory)) {
    // Normalize relative path to prevent downloads/downloads/... duplication
    const normalizedPath = normalizeRelativePath(storage.illustrationDirectory);
    storage.illustrationDirectory = resolve(downloadDir, normalizedPath);
  } else {
    // Even for absolute paths, check and fix duplication
    storage.illustrationDirectory = fixAbsolutePathDuplication(storage.illustrationDirectory);
  }
  
  // Resolve novel directory
  if (!storage.novelDirectory) {
    storage.novelDirectory = resolve(downloadDir, 'novels');
  } else if (!isAbsolute(storage.novelDirectory)) {
    // Normalize relative path to prevent downloads/downloads/... duplication
    const normalizedPath = normalizeRelativePath(storage.novelDirectory);
    storage.novelDirectory = resolve(downloadDir, normalizedPath);
  } else {
    // Even for absolute paths, check and fix duplication
    storage.novelDirectory = fixAbsolutePathDuplication(storage.novelDirectory);
  }

  // Resolve database path - use baseDir to ensure relative paths are resolved correctly
  // Database path should still use config directory as base (or project root if config is in subdirectory)
  storage.databasePath = isAbsolute(storage.databasePath!)
    ? storage.databasePath!
    : resolve(pathBaseDir, storage.databasePath!);
}

/**
 * Apply default values to configuration
 * @param config Partial configuration to apply defaults to
 * @param basePath Base path for resolving relative paths (defaults to process.cwd())
 */
export function applyDefaults(config: Partial<StandaloneConfig>, basePath?: string): StandaloneConfig {
  const baseDir = basePath || process.cwd();
  const merged: StandaloneConfig = {
    ...config,
    logLevel: config.logLevel ?? DEFAULT_CONFIG.logLevel,
    network: {
      ...DEFAULT_CONFIG.network,
      ...config.network,
      proxy: config.network?.proxy,
    },
    storage: {
      ...DEFAULT_CONFIG.storage,
      ...config.storage,
    } as StorageConfig,
    scheduler: {
      ...DEFAULT_CONFIG.scheduler,
      ...config.scheduler,
    },
    download: {
      ...DEFAULT_CONFIG.download,
      ...config.download,
    },
    initialDelay: config.initialDelay ?? DEFAULT_CONFIG.initialDelay,
    pixiv: config.pixiv!,
    targets: config.targets!,
  };

  // Resolve storage paths
  resolveStoragePaths(merged.storage!, baseDir);

  return merged;
}

