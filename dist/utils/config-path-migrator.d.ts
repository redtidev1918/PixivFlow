import { StandaloneConfig } from '../config';
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
export declare class ConfigPathMigrator {
    private projectRoot;
    constructor(projectRoot?: string);
    /**
     * Migrate paths in configuration file
     * @param configPath Path to configuration file
     * @param dryRun If true, only report changes without modifying the file
     * @returns Migration result
     */
    migrateConfigFile(configPath: string, dryRun?: boolean): PathMigrationResult;
    /**
     * Migrate storage paths
     */
    private migrateStoragePaths;
    /**
     * Migrate a single path
     */
    private migratePath;
    /**
     * Auto-fix configuration paths on load
     * This is called automatically when loading configuration
     */
    static autoFixConfig(config: Partial<StandaloneConfig>, projectRoot?: string): {
        fixed: boolean;
        changes: PathMigrationResult['changes'];
    };
}
//# sourceMappingURL=config-path-migrator.d.ts.map