import { resolve, relative, isAbsolute, normalize } from 'node:path';
import { existsSync } from 'node:fs';
import { StandaloneConfig, StorageConfig } from '../../config';
import { PathMigrationResult } from '../config-path-migrator';
import { logger } from '../../logger';

/**
 * Auto-fix configuration paths on load
 * This is called automatically when loading configuration
 * Now covers all storage paths including illustrationDirectory and novelDirectory
 */
export function autoFixConfig(config: Partial<StandaloneConfig>, projectRoot?: string): {
  fixed: boolean;
  changes: PathMigrationResult['changes'];
} {
  const result: { fixed: boolean; changes: PathMigrationResult['changes'] } = {
    fixed: false,
    changes: [],
  };

  if (!config.storage) {
    return result;
  }

  const storage = config.storage;
  const resolvedProjectRoot = resolve(projectRoot || process.cwd());

  // Fix database path
  if (storage.databasePath) {
    fixStoragePath(
      storage,
      'databasePath',
      './data/pixiv-downloader.db',
      'data/pixiv-downloader.db',
      resolvedProjectRoot,
      result
    );
  }

  // Fix download directory
  if (storage.downloadDirectory) {
    fixStoragePath(
      storage,
      'downloadDirectory',
      './downloads',
      'downloads',
      resolvedProjectRoot,
      result
    );
  }

  // Fix illustration directory (new)
  if (storage.illustrationDirectory) {
    fixDerivedStoragePath(
      storage,
      'illustrationDirectory',
      storage.downloadDirectory || './downloads',
      'illustrations',
      resolvedProjectRoot,
      result
    );
  }

  // Fix novel directory (new)
  if (storage.novelDirectory) {
    fixDerivedStoragePath(
      storage,
      'novelDirectory',
      storage.downloadDirectory || './downloads',
      'novels',
      resolvedProjectRoot,
      result
    );
  }

  return result;
}

/**
 * Fix a single storage path field
 */
function fixStoragePath(
  storage: StorageConfig,
  fieldName: 'databasePath' | 'downloadDirectory',
  defaultRelativePath: string,
  defaultPathSegment: string,
  resolvedProjectRoot: string,
  result: { fixed: boolean; changes: PathMigrationResult['changes'] }
): void {
  const currentPath = storage[fieldName];
  if (!currentPath) {
    return;
  }

  // Fix path issues first (duplication, concatenation errors)
  let pathToCheck = currentPath;
  if (isAbsolute(currentPath)) {
    const fixed = fixPathIssues(currentPath, resolvedProjectRoot);
    if (fixed !== currentPath) {
      storage[fieldName] = fixed;
      result.fixed = true;
      result.changes.push({
        field: fieldName,
        oldPath: currentPath,
        newPath: fixed,
        reason: 'Fixed path duplication or concatenation error',
      });
      pathToCheck = fixed;
    }
  }

  const resolved = isAbsolute(pathToCheck)
    ? pathToCheck
    : resolve(resolvedProjectRoot, pathToCheck);
  
  if (!existsSync(resolved)) {
    fixNonExistentPath(
      storage,
      fieldName,
      pathToCheck,
      resolved,
      defaultRelativePath,
      defaultPathSegment,
      resolvedProjectRoot,
      result
    );
  } else {
    fixAbsolutePathToRelative(
      storage,
      fieldName,
      pathToCheck,
      resolved,
      resolvedProjectRoot,
      result
    );
  }
}

/**
 * Fix path that doesn't exist
 */
function fixNonExistentPath(
  storage: StorageConfig,
  fieldName: 'databasePath' | 'downloadDirectory',
  currentPath: string,
  resolved: string,
  defaultRelativePath: string,
  defaultPathSegment: string,
  resolvedProjectRoot: string,
  result: { fixed: boolean; changes: PathMigrationResult['changes'] }
): void {
  // Try default path
  const defaultPath = resolve(resolvedProjectRoot, defaultPathSegment);
  if (existsSync(defaultPath)) {
    storage[fieldName] = defaultRelativePath;
    result.fixed = true;
    result.changes.push({
      field: fieldName,
      oldPath: currentPath,
      newPath: defaultRelativePath,
      reason: 'Path does not exist, using default path',
    });
  } else if (isAbsolute(currentPath) && resolved.startsWith(resolvedProjectRoot)) {
    // Convert absolute to relative
    const relativePath = relative(resolvedProjectRoot, resolved);
    const newRelativePath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
    storage[fieldName] = newRelativePath;
    result.fixed = true;
    result.changes.push({
      field: fieldName,
      oldPath: currentPath,
      newPath: newRelativePath,
      reason: 'Converted absolute path to relative path',
    });
  }
}

/**
 * Convert absolute path to relative if within project root
 */
function fixAbsolutePathToRelative(
  storage: StorageConfig,
  fieldName: 'databasePath' | 'downloadDirectory' | 'illustrationDirectory' | 'novelDirectory',
  currentPath: string,
  resolved: string,
  resolvedProjectRoot: string,
  result: { fixed: boolean; changes: PathMigrationResult['changes'] }
): void {
  if (isAbsolute(currentPath) && resolved.startsWith(resolvedProjectRoot)) {
    const relativePath = relative(resolvedProjectRoot, resolved);
    const newPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
    if (newPath !== currentPath) {
      storage[fieldName] = newPath;
      result.fixed = true;
      result.changes.push({
        field: fieldName,
        oldPath: currentPath,
        newPath,
        reason: 'Converted absolute path to relative path',
      });
    }
  }
}

/**
 * Fix derived storage paths (illustrationDirectory, novelDirectory)
 * These paths should be relative to downloadDirectory
 */
function fixDerivedStoragePath(
  storage: StorageConfig,
  fieldName: 'illustrationDirectory' | 'novelDirectory',
  downloadDirectory: string,
  defaultSubdir: string,
  resolvedProjectRoot: string,
  result: { fixed: boolean; changes: PathMigrationResult['changes'] }
): void {
  const currentPath = storage[fieldName];
  if (!currentPath) {
    return;
  }

  // Resolve download directory to get the base
  const resolvedDownloadDir = isAbsolute(downloadDirectory)
    ? downloadDirectory
    : resolve(resolvedProjectRoot, downloadDirectory);

  // Check for path issues first
  let fixedPath = currentPath;
  
  // Fix path duplication and concatenation errors
  if (isAbsolute(currentPath)) {
    fixedPath = fixPathIssues(currentPath, resolvedProjectRoot);
    if (fixedPath !== currentPath) {
      storage[fieldName] = fixedPath;
      result.fixed = true;
      result.changes.push({
        field: fieldName,
        oldPath: currentPath,
        newPath: fixedPath,
        reason: 'Fixed path duplication or concatenation error',
      });
      return;
    }
  }

  // Check if path is outside download directory (should be relative to it)
  const resolvedCurrent = isAbsolute(currentPath)
    ? currentPath
    : resolve(resolvedProjectRoot, currentPath);

  // If absolute path is outside download directory, make it relative
  if (isAbsolute(currentPath) && !resolvedCurrent.startsWith(resolvedDownloadDir)) {
    // Try to make it relative to download directory
    try {
      const relativeToDownload = relative(resolvedDownloadDir, resolvedCurrent);
      // If it's a reasonable relative path, use it
      if (!relativeToDownload.startsWith('..')) {
        const newPath = relativeToDownload.startsWith('.') ? relativeToDownload : `./${relativeToDownload}`;
        storage[fieldName] = newPath;
        result.fixed = true;
        result.changes.push({
          field: fieldName,
          oldPath: currentPath,
          newPath,
          reason: 'Made path relative to download directory',
        });
        return;
      }
    } catch {
      // If relative calculation fails, fall through to default fix
    }
  }

  // If path doesn't exist and is absolute, try converting to relative
  if (isAbsolute(currentPath) && !existsSync(resolvedCurrent)) {
    const relativePath = relative(resolvedProjectRoot, resolvedCurrent);
    if (relativePath.startsWith('..') || relativePath.includes('..')) {
      // Path is outside project root, use default
      const defaultPath = `./downloads/${defaultSubdir}`;
      storage[fieldName] = defaultPath;
      result.fixed = true;
      result.changes.push({
        field: fieldName,
        oldPath: currentPath,
        newPath: defaultPath,
        reason: 'Path outside project root, using default',
      });
    } else {
      fixAbsolutePathToRelative(storage, fieldName, currentPath, resolvedCurrent, resolvedProjectRoot, result);
    }
  } else if (isAbsolute(currentPath)) {
    fixAbsolutePathToRelative(storage, fieldName, currentPath, resolvedCurrent, resolvedProjectRoot, result);
  }
}

/**
 * Fix common path issues: duplication, concatenation errors, etc.
 */
function fixPathIssues(path: string, projectRoot: string): string {
  let fixed = normalize(path);
  
  // Fix multiple consecutive slashes
  fixed = fixed.replace(/([^/])\/+/g, '$1/');
  
  // Fix path duplication patterns
  const duplicationPatterns = [
    /\/downloads\/downloads\//g,
    /\/data\/data\//g,
    /\/illustrations\/illustrations\//g,
    /\/novels\/novels\//g,
  ];
  
  for (const pattern of duplicationPatterns) {
    if (pattern.test(fixed)) {
      fixed = fixed.replace(pattern, (match) => match.replace(/\/[^/]+\//, '/'));
    }
  }
  
  // Fix user path concatenation errors (e.g., /Users/ya/Users/yaoxiaohang/...)
  const userPathPattern = /^\/Users\/([^/]+)\/Users\/([^/]+)\//;
  const match = fixed.match(userPathPattern);
  if (match && match[1] !== match[2]) {
    fixed = fixed.replace(/^\/Users\/[^/]+\//, '/Users/' + match[2] + '/');
    logger.debug('Fixed user path concatenation error', {
      original: path,
      fixed: fixed,
    });
  }
  
  return fixed;
}

