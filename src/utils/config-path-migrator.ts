import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname, join } from 'node:path';
import { logger } from '../logger';
import { StandaloneConfig, StorageConfig } from '../config';

export interface PathMigrationResult {
  updated: boolean;
  changes: Array<{
    field: string;
    oldPath: string;
    newPath: string;
    reason: string;
  }>;
  errors: Array<{
    field: string;
    path: string;
    error: string;
  }>;
}

/**
 * Configuration path migrator
 * Automatically converts absolute paths to relative paths when possible,
 * and fixes paths that don't exist in the new environment.
 */
export class ConfigPathMigrator {
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  /**
   * Migrate paths in configuration file
   * @param configPath Path to configuration file
   * @param dryRun If true, only report changes without modifying the file
   * @returns Migration result
   */
  migrateConfigFile(configPath: string, dryRun: boolean = false): PathMigrationResult {
    const result: PathMigrationResult = {
      updated: false,
      changes: [],
      errors: [],
    };

    try {
      if (!existsSync(configPath)) {
        result.errors.push({
          field: 'configPath',
          path: configPath,
          error: 'Configuration file does not exist',
        });
        return result;
      }

      const raw = readFileSync(configPath, 'utf-8');
      const config: Partial<StandaloneConfig> = JSON.parse(raw);

      // Migrate storage paths
      if (config.storage) {
        const storageChanges = this.migrateStoragePaths(config.storage);
        result.changes.push(...storageChanges.changes);
        result.errors.push(...storageChanges.errors);
      }

      // If there are changes and not dry run, update the file
      if (result.changes.length > 0 && !dryRun) {
        // Update the config object
        if (config.storage) {
          for (const change of result.changes) {
            if (change.field === 'databasePath') {
              config.storage.databasePath = change.newPath;
            } else if (change.field === 'downloadDirectory') {
              config.storage.downloadDirectory = change.newPath;
            } else if (change.field === 'illustrationDirectory') {
              config.storage.illustrationDirectory = change.newPath;
            } else if (change.field === 'novelDirectory') {
              config.storage.novelDirectory = change.newPath;
            }
          }
        }

        // Write back to file with proper formatting
        const updatedRaw = JSON.stringify(config, null, 2);
        writeFileSync(configPath, updatedRaw, 'utf-8');
        result.updated = true;
      }

      return result;
    } catch (error) {
      result.errors.push({
        field: 'config',
        path: configPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  }

  /**
   * Migrate storage paths
   */
  private migrateStoragePaths(storage: StorageConfig): {
    changes: PathMigrationResult['changes'];
    errors: PathMigrationResult['errors'];
  } {
    const changes: PathMigrationResult['changes'] = [];
    const errors: PathMigrationResult['errors'] = [];

    // Migrate database path
    if (storage.databasePath) {
      const migration = this.migratePath(
        storage.databasePath,
        'databasePath',
        'data/pixiv-downloader.db'
      );
      if (migration) {
        if (migration.error) {
          errors.push({
            field: 'databasePath',
            path: storage.databasePath,
            error: migration.error,
          });
        } else if (migration.changed) {
          changes.push({
            field: 'databasePath',
            oldPath: storage.databasePath,
            newPath: migration.newPath,
            reason: migration.reason,
          });
        }
      }
    }

    // Migrate download directory
    if (storage.downloadDirectory) {
      const migration = this.migratePath(
        storage.downloadDirectory,
        'downloadDirectory',
        './downloads'
      );
      if (migration) {
        if (migration.error) {
          errors.push({
            field: 'downloadDirectory',
            path: storage.downloadDirectory,
            error: migration.error,
          });
        } else if (migration.changed) {
          changes.push({
            field: 'downloadDirectory',
            oldPath: storage.downloadDirectory,
            newPath: migration.newPath,
            reason: migration.reason,
          });
        }
      }
    }

    // Migrate illustration directory
    if (storage.illustrationDirectory) {
      const migration = this.migratePath(
        storage.illustrationDirectory,
        'illustrationDirectory',
        './downloads/illustrations',
        storage.downloadDirectory
      );
      if (migration) {
        if (migration.error) {
          errors.push({
            field: 'illustrationDirectory',
            path: storage.illustrationDirectory,
            error: migration.error,
          });
        } else if (migration.changed) {
          changes.push({
            field: 'illustrationDirectory',
            oldPath: storage.illustrationDirectory,
            newPath: migration.newPath,
            reason: migration.reason,
          });
        }
      }
    }

    // Migrate novel directory
    if (storage.novelDirectory) {
      const migration = this.migratePath(
        storage.novelDirectory,
        'novelDirectory',
        './downloads/novels',
        storage.downloadDirectory
      );
      if (migration) {
        if (migration.error) {
          errors.push({
            field: 'novelDirectory',
            path: storage.novelDirectory,
            error: migration.error,
          });
        } else if (migration.changed) {
          changes.push({
            field: 'novelDirectory',
            oldPath: storage.novelDirectory,
            newPath: migration.newPath,
            reason: migration.reason,
          });
        }
      }
    }

    return { changes, errors };
  }

  /**
   * Migrate a single path
   */
  private migratePath(
    path: string,
    fieldName: string,
    defaultRelativePath: string,
    basePath?: string
  ): {
    changed: boolean;
    newPath: string;
    reason: string;
    error?: string;
  } | null {
    if (!path) {
      return null;
    }

    const resolvedPath = isAbsolute(path) ? path : resolve(this.projectRoot, path);
    const resolvedProjectRoot = resolve(this.projectRoot);

    // Check if path is within project root
    if (isAbsolute(path) && resolvedPath.startsWith(resolvedProjectRoot)) {
      // Convert to relative path
      const relativePath = relative(resolvedProjectRoot, resolvedPath);
      const normalizedRelative = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
      
      return {
        changed: true,
        newPath: normalizedRelative,
        reason: `Converted absolute path to relative path (within project root)`,
      };
    }

    // Check if absolute path exists
    if (isAbsolute(path)) {
      if (!existsSync(resolvedPath)) {
        // Path doesn't exist, try to use default relative path
        const defaultPath = basePath
          ? (isAbsolute(basePath)
              ? join(dirname(basePath), defaultRelativePath.replace('./', ''))
              : resolve(this.projectRoot, basePath, defaultRelativePath.replace('./', '')))
          : resolve(this.projectRoot, defaultRelativePath);

        // Check if default path exists
        if (existsSync(defaultPath)) {
          const relativeDefault = relative(this.projectRoot, defaultPath);
          const normalizedRelative = relativeDefault.startsWith('.') ? relativeDefault : `./${relativeDefault}`;
          
          return {
            changed: true,
            newPath: normalizedRelative,
            reason: `Path does not exist, using default relative path`,
          };
        } else {
          // Try to use relative path based on project root
          const relativePath = relative(this.projectRoot, resolvedPath);
          const normalizedRelative = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
          
          return {
            changed: true,
            newPath: normalizedRelative,
            reason: `Path does not exist, converted to relative path for portability`,
          };
        }
      } else {
        // Path exists but is absolute, convert to relative if within project
        if (resolvedPath.startsWith(resolvedProjectRoot)) {
          const relativePath = relative(this.projectRoot, resolvedPath);
          const normalizedRelative = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
          
          return {
            changed: true,
            newPath: normalizedRelative,
            reason: `Converted absolute path to relative path (within project root)`,
          };
        }
      }
    }

    // Check if relative path exists
    if (!isAbsolute(path)) {
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
    }

    return null;
  }

  /**
   * Auto-fix configuration paths on load
   * This is called automatically when loading configuration
   */
  static autoFixConfig(config: Partial<StandaloneConfig>, projectRoot?: string): {
    fixed: boolean;
    changes: PathMigrationResult['changes'];
  } {
    const migrator = new ConfigPathMigrator(projectRoot);
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
      const resolved = isAbsolute(storage.databasePath)
        ? storage.databasePath
        : resolve(resolvedProjectRoot, storage.databasePath);
      
      if (!existsSync(resolved)) {
        // Try default path
        const defaultPath = resolve(resolvedProjectRoot, 'data', 'pixiv-downloader.db');
        if (existsSync(defaultPath)) {
          storage.databasePath = './data/pixiv-downloader.db';
          result.fixed = true;
          result.changes.push({
            field: 'databasePath',
            oldPath: storage.databasePath,
            newPath: './data/pixiv-downloader.db',
            reason: 'Path does not exist, using default path',
          });
        } else if (isAbsolute(storage.databasePath) && resolved.startsWith(resolvedProjectRoot)) {
          // Convert absolute to relative
          const relativePath = relative(resolvedProjectRoot, resolved);
          storage.databasePath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
          result.fixed = true;
          result.changes.push({
            field: 'databasePath',
            oldPath: storage.databasePath,
            newPath: storage.databasePath,
            reason: 'Converted absolute path to relative path',
          });
        }
      } else if (isAbsolute(storage.databasePath) && resolved.startsWith(resolvedProjectRoot)) {
        // Convert absolute to relative
        const relativePath = relative(resolvedProjectRoot, resolved);
        const newPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
        if (newPath !== storage.databasePath) {
          const oldPath = storage.databasePath;
          storage.databasePath = newPath;
          result.fixed = true;
          result.changes.push({
            field: 'databasePath',
            oldPath,
            newPath,
            reason: 'Converted absolute path to relative path',
          });
        }
      }
    }

    // Fix download directory
    if (storage.downloadDirectory) {
      const resolved = isAbsolute(storage.downloadDirectory)
        ? storage.downloadDirectory
        : resolve(resolvedProjectRoot, storage.downloadDirectory);
      
      if (!existsSync(resolved)) {
        // Try default path
        const defaultPath = resolve(resolvedProjectRoot, 'downloads');
        if (existsSync(defaultPath)) {
          storage.downloadDirectory = './downloads';
          result.fixed = true;
          result.changes.push({
            field: 'downloadDirectory',
            oldPath: storage.downloadDirectory,
            newPath: './downloads',
            reason: 'Path does not exist, using default path',
          });
        } else if (isAbsolute(storage.downloadDirectory) && resolved.startsWith(resolvedProjectRoot)) {
          // Convert absolute to relative
          const relativePath = relative(resolvedProjectRoot, resolved);
          storage.downloadDirectory = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
          result.fixed = true;
          result.changes.push({
            field: 'downloadDirectory',
            oldPath: storage.downloadDirectory,
            newPath: storage.downloadDirectory,
            reason: 'Converted absolute path to relative path',
          });
        }
      } else if (isAbsolute(storage.downloadDirectory) && resolved.startsWith(resolvedProjectRoot)) {
        // Convert absolute to relative
        const relativePath = relative(resolvedProjectRoot, resolved);
        const newPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
        if (newPath !== storage.downloadDirectory) {
          const oldPath = storage.downloadDirectory;
          storage.downloadDirectory = newPath;
          result.fixed = true;
          result.changes.push({
            field: 'downloadDirectory',
            oldPath,
            newPath,
            reason: 'Converted absolute path to relative path',
          });
        }
      }
    }

    return result;
  }
}

