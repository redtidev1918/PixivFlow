import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { StandaloneConfig, StorageConfig } from '../config';
import { StoragePathMigration } from './config-path-migrator/storage-path-migration';
import { autoFixConfig } from './config-path-migrator/auto-fix';

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
    const storageMigration = new StoragePathMigration(this.projectRoot);
    return storageMigration.migrateStoragePaths(storage);
  }

  /**
   * Auto-fix configuration paths on load
   * This is called automatically when loading configuration
   */
  static autoFixConfig = autoFixConfig;
}

