"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigPathMigrator = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * Configuration path migrator
 * Automatically converts absolute paths to relative paths when possible,
 * and fixes paths that don't exist in the new environment.
 */
class ConfigPathMigrator {
    projectRoot;
    constructor(projectRoot) {
        this.projectRoot = projectRoot || process.cwd();
    }
    /**
     * Migrate paths in configuration file
     * @param configPath Path to configuration file
     * @param dryRun If true, only report changes without modifying the file
     * @returns Migration result
     */
    migrateConfigFile(configPath, dryRun = false) {
        const result = {
            updated: false,
            changes: [],
            errors: [],
        };
        try {
            if (!(0, node_fs_1.existsSync)(configPath)) {
                result.errors.push({
                    field: 'configPath',
                    path: configPath,
                    error: 'Configuration file does not exist',
                });
                return result;
            }
            const raw = (0, node_fs_1.readFileSync)(configPath, 'utf-8');
            const config = JSON.parse(raw);
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
                        }
                        else if (change.field === 'downloadDirectory') {
                            config.storage.downloadDirectory = change.newPath;
                        }
                        else if (change.field === 'illustrationDirectory') {
                            config.storage.illustrationDirectory = change.newPath;
                        }
                        else if (change.field === 'novelDirectory') {
                            config.storage.novelDirectory = change.newPath;
                        }
                    }
                }
                // Write back to file with proper formatting
                const updatedRaw = JSON.stringify(config, null, 2);
                (0, node_fs_1.writeFileSync)(configPath, updatedRaw, 'utf-8');
                result.updated = true;
            }
            return result;
        }
        catch (error) {
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
    migrateStoragePaths(storage) {
        const changes = [];
        const errors = [];
        // Migrate database path
        if (storage.databasePath) {
            const migration = this.migratePath(storage.databasePath, 'databasePath', 'data/pixiv-downloader.db');
            if (migration) {
                if (migration.error) {
                    errors.push({
                        field: 'databasePath',
                        path: storage.databasePath,
                        error: migration.error,
                    });
                }
                else if (migration.changed) {
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
            const migration = this.migratePath(storage.downloadDirectory, 'downloadDirectory', './downloads');
            if (migration) {
                if (migration.error) {
                    errors.push({
                        field: 'downloadDirectory',
                        path: storage.downloadDirectory,
                        error: migration.error,
                    });
                }
                else if (migration.changed) {
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
            const migration = this.migratePath(storage.illustrationDirectory, 'illustrationDirectory', './downloads/illustrations', storage.downloadDirectory);
            if (migration) {
                if (migration.error) {
                    errors.push({
                        field: 'illustrationDirectory',
                        path: storage.illustrationDirectory,
                        error: migration.error,
                    });
                }
                else if (migration.changed) {
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
            const migration = this.migratePath(storage.novelDirectory, 'novelDirectory', './downloads/novels', storage.downloadDirectory);
            if (migration) {
                if (migration.error) {
                    errors.push({
                        field: 'novelDirectory',
                        path: storage.novelDirectory,
                        error: migration.error,
                    });
                }
                else if (migration.changed) {
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
    migratePath(path, fieldName, defaultRelativePath, basePath) {
        if (!path) {
            return null;
        }
        const resolvedPath = (0, node_path_1.isAbsolute)(path) ? path : (0, node_path_1.resolve)(this.projectRoot, path);
        const resolvedProjectRoot = (0, node_path_1.resolve)(this.projectRoot);
        // Check if path is within project root
        if ((0, node_path_1.isAbsolute)(path) && resolvedPath.startsWith(resolvedProjectRoot)) {
            // Convert to relative path
            const relativePath = (0, node_path_1.relative)(resolvedProjectRoot, resolvedPath);
            const normalizedRelative = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
            return {
                changed: true,
                newPath: normalizedRelative,
                reason: `Converted absolute path to relative path (within project root)`,
            };
        }
        // Check if absolute path exists
        if ((0, node_path_1.isAbsolute)(path)) {
            if (!(0, node_fs_1.existsSync)(resolvedPath)) {
                // Path doesn't exist, try to use default relative path
                const defaultPath = basePath
                    ? ((0, node_path_1.isAbsolute)(basePath)
                        ? (0, node_path_1.join)((0, node_path_1.dirname)(basePath), defaultRelativePath.replace('./', ''))
                        : (0, node_path_1.resolve)(this.projectRoot, basePath, defaultRelativePath.replace('./', '')))
                    : (0, node_path_1.resolve)(this.projectRoot, defaultRelativePath);
                // Check if default path exists
                if ((0, node_fs_1.existsSync)(defaultPath)) {
                    const relativeDefault = (0, node_path_1.relative)(this.projectRoot, defaultPath);
                    const normalizedRelative = relativeDefault.startsWith('.') ? relativeDefault : `./${relativeDefault}`;
                    return {
                        changed: true,
                        newPath: normalizedRelative,
                        reason: `Path does not exist, using default relative path`,
                    };
                }
                else {
                    // Try to use relative path based on project root
                    const relativePath = (0, node_path_1.relative)(this.projectRoot, resolvedPath);
                    const normalizedRelative = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
                    return {
                        changed: true,
                        newPath: normalizedRelative,
                        reason: `Path does not exist, converted to relative path for portability`,
                    };
                }
            }
            else {
                // Path exists but is absolute, convert to relative if within project
                if (resolvedPath.startsWith(resolvedProjectRoot)) {
                    const relativePath = (0, node_path_1.relative)(this.projectRoot, resolvedPath);
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
        if (!(0, node_path_1.isAbsolute)(path)) {
            const fullPath = (0, node_path_1.resolve)(this.projectRoot, path);
            if (!(0, node_fs_1.existsSync)(fullPath)) {
                // Try default path
                const defaultPath = (0, node_path_1.resolve)(this.projectRoot, defaultRelativePath);
                if ((0, node_fs_1.existsSync)(defaultPath)) {
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
    static autoFixConfig(config, projectRoot) {
        const migrator = new ConfigPathMigrator(projectRoot);
        const result = {
            fixed: false,
            changes: [],
        };
        if (!config.storage) {
            return result;
        }
        const storage = config.storage;
        const resolvedProjectRoot = (0, node_path_1.resolve)(projectRoot || process.cwd());
        // Fix database path
        if (storage.databasePath) {
            const resolved = (0, node_path_1.isAbsolute)(storage.databasePath)
                ? storage.databasePath
                : (0, node_path_1.resolve)(resolvedProjectRoot, storage.databasePath);
            if (!(0, node_fs_1.existsSync)(resolved)) {
                // Try default path
                const defaultPath = (0, node_path_1.resolve)(resolvedProjectRoot, 'data', 'pixiv-downloader.db');
                if ((0, node_fs_1.existsSync)(defaultPath)) {
                    storage.databasePath = './data/pixiv-downloader.db';
                    result.fixed = true;
                    result.changes.push({
                        field: 'databasePath',
                        oldPath: storage.databasePath,
                        newPath: './data/pixiv-downloader.db',
                        reason: 'Path does not exist, using default path',
                    });
                }
                else if ((0, node_path_1.isAbsolute)(storage.databasePath) && resolved.startsWith(resolvedProjectRoot)) {
                    // Convert absolute to relative
                    const relativePath = (0, node_path_1.relative)(resolvedProjectRoot, resolved);
                    storage.databasePath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
                    result.fixed = true;
                    result.changes.push({
                        field: 'databasePath',
                        oldPath: storage.databasePath,
                        newPath: storage.databasePath,
                        reason: 'Converted absolute path to relative path',
                    });
                }
            }
            else if ((0, node_path_1.isAbsolute)(storage.databasePath) && resolved.startsWith(resolvedProjectRoot)) {
                // Convert absolute to relative
                const relativePath = (0, node_path_1.relative)(resolvedProjectRoot, resolved);
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
            const resolved = (0, node_path_1.isAbsolute)(storage.downloadDirectory)
                ? storage.downloadDirectory
                : (0, node_path_1.resolve)(resolvedProjectRoot, storage.downloadDirectory);
            if (!(0, node_fs_1.existsSync)(resolved)) {
                // Try default path
                const defaultPath = (0, node_path_1.resolve)(resolvedProjectRoot, 'downloads');
                if ((0, node_fs_1.existsSync)(defaultPath)) {
                    storage.downloadDirectory = './downloads';
                    result.fixed = true;
                    result.changes.push({
                        field: 'downloadDirectory',
                        oldPath: storage.downloadDirectory,
                        newPath: './downloads',
                        reason: 'Path does not exist, using default path',
                    });
                }
                else if ((0, node_path_1.isAbsolute)(storage.downloadDirectory) && resolved.startsWith(resolvedProjectRoot)) {
                    // Convert absolute to relative
                    const relativePath = (0, node_path_1.relative)(resolvedProjectRoot, resolved);
                    storage.downloadDirectory = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
                    result.fixed = true;
                    result.changes.push({
                        field: 'downloadDirectory',
                        oldPath: storage.downloadDirectory,
                        newPath: storage.downloadDirectory,
                        reason: 'Converted absolute path to relative path',
                    });
                }
            }
            else if ((0, node_path_1.isAbsolute)(storage.downloadDirectory) && resolved.startsWith(resolvedProjectRoot)) {
                // Convert absolute to relative
                const relativePath = (0, node_path_1.relative)(resolvedProjectRoot, resolved);
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
exports.ConfigPathMigrator = ConfigPathMigrator;
//# sourceMappingURL=config-path-migrator.js.map