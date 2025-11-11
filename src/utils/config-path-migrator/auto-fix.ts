import { resolve, relative, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { StandaloneConfig, StorageConfig } from '../../config';
import { PathMigrationResult } from '../config-path-migrator';

/**
 * Auto-fix configuration paths on load
 * This is called automatically when loading configuration
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

  const resolved = isAbsolute(currentPath)
    ? currentPath
    : resolve(resolvedProjectRoot, currentPath);
  
  if (!existsSync(resolved)) {
    fixNonExistentPath(
      storage,
      fieldName,
      currentPath,
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
      currentPath,
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
  fieldName: 'databasePath' | 'downloadDirectory',
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

