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
 * Detect and fix various path issues in absolute paths
 * - Path duplication (e.g., /downloads/downloads/)
 * - Path concatenation errors (e.g., /Users/ya/Users/yaoxiaohang/...)
 * - Multiple slashes
 * 
 * Only fixes obvious errors, doesn't modify valid paths
 */
function fixAbsolutePathIssues(absolutePath: string, expectedBaseDir?: string): string {
  let fixed = normalize(absolutePath);
  
  // Fix multiple consecutive slashes (except at the start for Unix paths)
  fixed = fixed.replace(/([^/])\/+/g, '$1/');
  
  // Fix path duplication patterns - only fix if pattern is clearly duplicated
  // Common patterns: /downloads/downloads/, /data/data/, /illustrations/illustrations/
  const duplicationPatterns = [
    { pattern: /\/downloads\/downloads\//g, replacement: '/downloads/' },
    { pattern: /\/data\/data\//g, replacement: '/data/' },
    { pattern: /\/illustrations\/illustrations\//g, replacement: '/illustrations/' },
    { pattern: /\/novels\/novels\//g, replacement: '/novels/' },
  ];
  
  for (const { pattern, replacement } of duplicationPatterns) {
    if (pattern.test(fixed)) {
      const before = fixed;
      fixed = fixed.replace(pattern, replacement);
      if (before !== fixed) {
        logger.warn('Detected path duplication, fixing', {
          original: absolutePath,
          fixed: fixed,
        });
      }
    }
  }
  
  // Fix user path concatenation errors
  // macOS/Linux: /Users/username1/Users/username2/ or /home/username1/home/username2/
  // Windows: C:\Users\username1\Users\username2\
  if (process.platform === 'win32') {
    // Windows path pattern: C:\Users\user1\Users\user2\ or similar
    const winUserPathPattern = /^([A-Z]:\\)Users\\([^\\]+)\\Users\\([^\\]+)\\/i;
    const winMatch = fixed.match(winUserPathPattern);
    if (winMatch && winMatch[2] !== winMatch[3]) {
      const corrected = fixed.replace(/^([A-Z]:\\)Users\\[^\\]+\\/i, '$1Users\\' + winMatch[3] + '\\');
      logger.warn('Detected Windows user path concatenation error, fixing', {
        original: absolutePath,
        fixed: corrected,
      });
      return normalize(corrected);
    }
  } else {
    // Unix path pattern: /Users/username1/Users/username2/ or /home/username1/home/username2/
    const unixUserPathPattern = /^\/(Users|home)\/([^/]+)\/\1\/([^/]+)\//;
    const unixMatch = fixed.match(unixUserPathPattern);
    if (unixMatch && unixMatch[2] !== unixMatch[3]) {
      const corrected = fixed.replace(/^\/(Users|home)\/[^/]+\//, '/' + unixMatch[1] + '/' + unixMatch[3] + '/');
      logger.warn('Detected Unix user path concatenation error, fixing', {
        original: absolutePath,
        fixed: corrected,
      });
      return normalize(corrected);
    }
  }
  
  return fixed;
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
  
  let downloadDir = isAbsolute(storage.downloadDirectory!)
    ? storage.downloadDirectory!
    : resolve(pathBaseDir, storage.downloadDirectory!);
  
  // Fix any path issues in download directory
  downloadDir = fixAbsolutePathIssues(downloadDir, pathBaseDir);
  
  // Update downloadDirectory to absolute path to ensure consistency
  storage.downloadDirectory = downloadDir;
  
  // Resolve illustration directory
  if (!storage.illustrationDirectory) {
    storage.illustrationDirectory = resolve(downloadDir, 'illustrations');
  } else if (!isAbsolute(storage.illustrationDirectory)) {
    // Normalize relative path to prevent downloads/downloads/... duplication
    const normalizedPath = normalizeRelativePath(storage.illustrationDirectory);
    storage.illustrationDirectory = resolve(downloadDir, normalizedPath);
  } else {
    // Even for absolute paths, check and fix all issues
    storage.illustrationDirectory = fixAbsolutePathIssues(storage.illustrationDirectory, pathBaseDir);
    // Ensure it's still within or relative to download directory
    if (!storage.illustrationDirectory.startsWith(downloadDir)) {
      // If absolute path is outside download directory, recalculate based on downloadDir
      const baseName = basename(storage.illustrationDirectory) || 'illustrations';
      storage.illustrationDirectory = resolve(downloadDir, baseName);
      logger.warn('Illustration directory path was outside download directory, recalculating', {
        newPath: storage.illustrationDirectory,
      });
    }
  }
  
  // Resolve novel directory
  if (!storage.novelDirectory) {
    storage.novelDirectory = resolve(downloadDir, 'novels');
  } else if (!isAbsolute(storage.novelDirectory)) {
    // Normalize relative path to prevent downloads/downloads/... duplication
    const normalizedPath = normalizeRelativePath(storage.novelDirectory);
    storage.novelDirectory = resolve(downloadDir, normalizedPath);
  } else {
    // Even for absolute paths, check and fix all issues
    storage.novelDirectory = fixAbsolutePathIssues(storage.novelDirectory, pathBaseDir);
    // Ensure it's still within or relative to download directory
    if (!storage.novelDirectory.startsWith(downloadDir)) {
      // If absolute path is outside download directory, recalculate based on downloadDir
      const baseName = basename(storage.novelDirectory) || 'novels';
      storage.novelDirectory = resolve(downloadDir, baseName);
      logger.warn('Novel directory path was outside download directory, recalculating', {
        newPath: storage.novelDirectory,
      });
    }
  }

  // Resolve database path - use baseDir to ensure relative paths are resolved correctly
  // Database path should still use config directory as base (or project root if config is in subdirectory)
  let dbPath = isAbsolute(storage.databasePath!)
    ? storage.databasePath!
    : resolve(pathBaseDir, storage.databasePath!);
  
  // Fix any path issues in database path
  storage.databasePath = fixAbsolutePathIssues(dbPath, pathBaseDir);
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
    pixiv: {
      clientId: config.pixiv?.clientId ?? 'MOBrBDS8blbauoSck0ZfDbtuzpyT',
      clientSecret: config.pixiv?.clientSecret ?? 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj',
      deviceToken: (config.pixiv?.deviceToken && config.pixiv.deviceToken.trim() !== '') 
        ? config.pixiv.deviceToken 
        : 'pixiv',
      refreshToken: config.pixiv?.refreshToken ?? 'YOUR_REFRESH_TOKEN',
      userAgent: config.pixiv?.userAgent ?? 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
    },
    targets: config.targets!,
  };

  // Resolve storage paths
  resolveStoragePaths(merged.storage!, baseDir);

  return merged;
}

