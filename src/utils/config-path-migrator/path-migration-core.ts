import { resolve, relative, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';

export interface PathMigration {
  changed: boolean;
  newPath: string;
  reason: string;
  error?: string;
}

/**
 * Core path migration utilities
 */
export class PathMigrationCore {
  constructor(private projectRoot: string) {}

  /**
   * Check if absolute path is within project root and convert to relative
   */
  checkAndConvertAbsoluteToRelative(
    path: string,
    resolvedPath: string,
    resolvedProjectRoot: string
  ): { changed: boolean; newPath: string; reason: string } | null {
    if (isAbsolute(path) && resolvedPath.startsWith(resolvedProjectRoot)) {
      const relativePath = relative(resolvedProjectRoot, resolvedPath);
      const normalizedRelative = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
      
      return {
        changed: true,
        newPath: normalizedRelative,
        reason: `Converted absolute path to relative path (within project root)`,
      };
    }
    return null;
  }

  /**
   * Handle migration of absolute paths
   */
  handleAbsolutePath(
    path: string,
    resolvedPath: string,
    resolvedProjectRoot: string,
    defaultRelativePath: string,
    basePath?: string
  ): PathMigration | null {
    if (!existsSync(resolvedPath)) {
      // Path doesn't exist, try default path
      const defaultResult = this.tryDefaultPath(defaultRelativePath, basePath, resolvedProjectRoot);
      if (defaultResult) {
        return defaultResult;
      }
      
      // Fallback: convert to relative for portability
      const relativePath = relative(resolvedProjectRoot, resolvedPath);
      const normalizedRelative = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
      
      return {
        changed: true,
        newPath: normalizedRelative,
        reason: `Path does not exist, converted to relative path for portability`,
      };
    }
    
    // Path exists, convert to relative if within project
    if (resolvedPath.startsWith(resolvedProjectRoot)) {
      const relativePath = relative(resolvedProjectRoot, resolvedPath);
      const normalizedRelative = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
      
      return {
        changed: true,
        newPath: normalizedRelative,
        reason: `Converted absolute path to relative path (within project root)`,
      };
    }
    
    return null;
  }

  /**
   * Handle migration of relative paths
   */
  handleRelativePath(
    path: string,
    defaultRelativePath: string
  ): PathMigration | null {
    const fullPath = resolve(this.projectRoot, path);
    if (!existsSync(fullPath)) {
      // Try default path
      const defaultPath = resolve(this.projectRoot, defaultRelativePath);
      if (existsSync(defaultPath)) {
        return {
          changed: true,
          newPath: defaultRelativePath,
          reason: `Relative path does not exist, using default path`,
        };
      }
    }
    return null;
  }

  /**
   * Try to use default path when original path doesn't exist
   */
  private tryDefaultPath(
    defaultRelativePath: string,
    basePath: string | undefined,
    resolvedProjectRoot: string
  ): PathMigration | null {
    const { join, dirname } = require('node:path');
    const defaultPath = basePath
      ? (isAbsolute(basePath)
          ? join(dirname(basePath), defaultRelativePath.replace('./', ''))
          : resolve(resolvedProjectRoot, basePath, defaultRelativePath.replace('./', '')))
      : resolve(resolvedProjectRoot, defaultRelativePath);

    if (existsSync(defaultPath)) {
      const relativeDefault = relative(resolvedProjectRoot, defaultPath);
      const normalizedRelative = relativeDefault.startsWith('.') ? relativeDefault : `./${relativeDefault}`;
      
      return {
        changed: true,
        newPath: normalizedRelative,
        reason: `Path does not exist, using default relative path`,
      };
    }
    return null;
  }
}

