import { resolve, relative, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { StorageConfig } from '../../config';
import { PathMigrationResult } from '../config-path-migrator';
import { PathMigrationCore } from './path-migration-core';

/**
 * Storage path migration utilities
 */
export class StoragePathMigration {
  private core: PathMigrationCore;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.core = new PathMigrationCore(projectRoot);
  }

  /**
   * Migrate storage paths
   */
  migrateStoragePaths(storage: StorageConfig): {
    changes: PathMigrationResult['changes'];
    errors: PathMigrationResult['errors'];
  } {
    const changes: PathMigrationResult['changes'] = [];
    const errors: PathMigrationResult['errors'] = [];

    // Migrate database path
    if (storage.databasePath) {
      this.processPathMigration(
        storage.databasePath,
        'databasePath',
        'data/pixiv-downloader.db',
        changes,
        errors
      );
    }

    // Migrate download directory
    if (storage.downloadDirectory) {
      this.processPathMigration(
        storage.downloadDirectory,
        'downloadDirectory',
        './downloads',
        changes,
        errors
      );
    }

    // Migrate illustration directory
    if (storage.illustrationDirectory) {
      this.processPathMigration(
        storage.illustrationDirectory,
        'illustrationDirectory',
        './downloads/illustrations',
        changes,
        errors,
        storage.downloadDirectory
      );
    }

    // Migrate novel directory
    if (storage.novelDirectory) {
      this.processPathMigration(
        storage.novelDirectory,
        'novelDirectory',
        './downloads/novels',
        changes,
        errors,
        storage.downloadDirectory
      );
    }

    return { changes, errors };
  }

  /**
   * Process a single path migration and update changes/errors arrays
   */
  private processPathMigration(
    path: string,
    fieldName: string,
    defaultRelativePath: string,
    changes: PathMigrationResult['changes'],
    errors: PathMigrationResult['errors'],
    basePath?: string
  ): void {
    const migration = this.migratePath(path, fieldName, defaultRelativePath, basePath);
    if (!migration) {
      return;
    }

    if (migration.error) {
      errors.push({
        field: fieldName,
        path,
        error: migration.error,
      });
    } else if (migration.changed) {
      changes.push({
        field: fieldName,
        oldPath: path,
        newPath: migration.newPath,
        reason: migration.reason,
      });
    }
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

    // Check if path is within project root (convert absolute to relative)
    const withinProjectRoot = this.core.checkAndConvertAbsoluteToRelative(
      path,
      resolvedPath,
      resolvedProjectRoot
    );
    if (withinProjectRoot) {
      return withinProjectRoot;
    }

    // Handle absolute paths
    if (isAbsolute(path)) {
      return this.core.handleAbsolutePath(path, resolvedPath, resolvedProjectRoot, defaultRelativePath, basePath);
    }

    // Handle relative paths
    return this.core.handleRelativePath(path, defaultRelativePath);
  }
}

