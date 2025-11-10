import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, resolve, dirname, basename, extname } from 'path';
import { logger } from '../logger';
import { StandaloneConfig } from '../config';
import { ConfigParser, ConfigParseResult } from './config-parser';

/**
 * Configuration file manager
 * Manages multiple configuration files in a directory
 */
export class ConfigManager {
  private configDir: string;
  private currentConfigFile: string | null = null;
  private readonly CONFIG_FILE_PATTERN = /^standalone\.config(\.\d+)?\.json$/;
  private readonly CURRENT_CONFIG_FILE = '.current-config';

  constructor(configDir: string = 'config') {
    this.configDir = resolve(configDir);
    // Ensure config directory exists
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
      logger.info('Created config directory', { path: this.configDir });
    }
    // Load persisted current config file
    this.loadCurrentConfigFile();
  }

  /**
   * Get the path to the current config marker file
   */
  private getCurrentConfigFilePath(): string {
    return join(this.configDir, this.CURRENT_CONFIG_FILE);
  }

  /**
   * Load the persisted current config file path
   */
  private loadCurrentConfigFile(): void {
    try {
      const markerPath = this.getCurrentConfigFilePath();
      if (existsSync(markerPath)) {
        const content = readFileSync(markerPath, 'utf-8').trim();
        if (content && existsSync(content)) {
          this.currentConfigFile = content;
          logger.debug('Loaded persisted current config file', { path: content });
        }
      }
    } catch (error) {
      logger.warn('Failed to load persisted current config file', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Persist the current config file path
   */
  private persistCurrentConfigFile(): void {
    try {
      const markerPath = this.getCurrentConfigFilePath();
      if (this.currentConfigFile) {
        writeFileSync(markerPath, this.currentConfigFile, 'utf-8');
        logger.debug('Persisted current config file', { path: this.currentConfigFile });
      } else if (existsSync(markerPath)) {
        // Remove marker if no current config
        unlinkSync(markerPath);
      }
    } catch (error) {
      logger.warn('Failed to persist current config file', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the config directory path
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Scan and list all configuration files in the directory
   * Returns files sorted by modification time (newest first)
   */
  listConfigFiles(): Array<{
    filename: string;
    path: string;
    modifiedTime: Date;
    size: number;
    isActive: boolean;
  }> {
    try {
      // Get current active config file (this will load from persistence if needed)
      const currentConfig = this.getCurrentConfigFile();
      const currentConfigPath = currentConfig ? resolve(currentConfig) : null;
      
      const files = readdirSync(this.configDir)
        .filter(file => {
          // Match standalone.config.json or standalone.config.N.json
          return this.CONFIG_FILE_PATTERN.test(file) && extname(file) === '.json';
        })
        .map(file => {
          const path = join(this.configDir, file);
          const resolvedPath = resolve(path);
          const stats = statSync(path);
          return {
            filename: file,
            path,
            modifiedTime: stats.mtime,
            size: stats.size,
            isActive: currentConfigPath === resolvedPath,
          };
        })
        .sort((a, b) => {
          // Sort by modification time (newest first), then by filename
          const timeDiff = b.modifiedTime.getTime() - a.modifiedTime.getTime();
          if (timeDiff !== 0) return timeDiff;
          return a.filename.localeCompare(b.filename);
        });

      return files;
    } catch (error) {
      logger.error('Failed to list config files', {
        error: error instanceof Error ? error.message : String(error),
        configDir: this.configDir,
      });
      return [];
    }
  }

  /**
   * Get the first available configuration file
   * Priority: standalone.config.json > standalone.config.N.json (by number)
   */
  getFirstAvailableConfig(): string | null {
    const files = this.listConfigFiles();
    if (files.length === 0) {
      return null;
    }

    // First, try to find standalone.config.json
    const defaultFile = files.find(f => f.filename === 'standalone.config.json');
    if (defaultFile) {
      return defaultFile.path;
    }

    // Otherwise, return the first file (already sorted)
    return files[0].path;
  }

  /**
   * Set the current active configuration file
   */
  setCurrentConfigFile(path: string): void {
    const resolvedPath = resolve(path);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Configuration file not found: ${resolvedPath}`);
    }
    this.currentConfigFile = resolvedPath;
    this.persistCurrentConfigFile();
    logger.info('Set current config file', { path: resolvedPath });
  }

  /**
   * Get the current active configuration file path
   */
  getCurrentConfigFile(): string | null {
    if (this.currentConfigFile && existsSync(this.currentConfigFile)) {
      return this.currentConfigFile;
    }
    // If current config doesn't exist, try to load from persistence
    this.loadCurrentConfigFile();
    if (this.currentConfigFile && existsSync(this.currentConfigFile)) {
      return this.currentConfigFile;
    }
    // Auto-select first available config
    const firstConfig = this.getFirstAvailableConfig();
    if (firstConfig) {
      this.currentConfigFile = firstConfig;
      this.persistCurrentConfigFile();
      return firstConfig;
    }
    return null;
  }

  /**
   * Get the next available numbered config filename
   * Returns: standalone.config.1.json, standalone.config.2.json, etc.
   */
  getNextConfigFilename(): string {
    const files = this.listConfigFiles();
    const numbers: number[] = [];

    // Extract numbers from existing files
    files.forEach(file => {
      const match = file.filename.match(/^standalone\.config\.(\d+)\.json$/);
      if (match) {
        numbers.push(parseInt(match[1], 10));
      }
    });

    // Find the next available number
    let nextNumber = 1;
    if (numbers.length > 0) {
      numbers.sort((a, b) => a - b);
      nextNumber = numbers[numbers.length - 1] + 1;
    }

    return `standalone.config.${nextNumber}.json`;
  }

  /**
   * Import a configuration and save it with auto-numbering
   * @param config - Configuration object to save
   * @param name - Optional name for the config (used in filename)
   * @returns Path to the saved config file
   */
  importConfig(config: StandaloneConfig, name?: string): string {
    const filename = name
      ? this.sanitizeFilename(`standalone.config.${name}.json`)
      : this.getNextConfigFilename();
    
    const path = join(this.configDir, filename);
    
    // Ensure the config is valid JSON
    const jsonString = JSON.stringify(config, null, 2);
    writeFileSync(path, jsonString, 'utf-8');
    
    logger.info('Imported configuration', { filename, path });
    return path;
  }

  /**
   * Save configuration to a specific file
   */
  saveConfig(config: StandaloneConfig, path: string): void {
    const resolvedPath = resolve(path);
    const dir = dirname(resolvedPath);
    
    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    const jsonString = JSON.stringify(config, null, 2);
    writeFileSync(resolvedPath, jsonString, 'utf-8');
    
    logger.info('Saved configuration', { path: resolvedPath });
  }

  /**
   * Read a configuration file
   */
  readConfig(path: string): StandaloneConfig | null {
    try {
      const resolvedPath = resolve(path);
      if (!existsSync(resolvedPath)) {
        return null;
      }
      const content = readFileSync(resolvedPath, 'utf-8');
      return JSON.parse(content) as StandaloneConfig;
    } catch (error) {
      logger.error('Failed to read config file', {
        error: error instanceof Error ? error.message : String(error),
        path,
      });
      return null;
    }
  }

  /**
   * Read and parse a configuration file with detailed analysis
   */
  parseConfig(path: string): ConfigParseResult | null {
    try {
      const parser = new ConfigParser();
      return parser.parseFile(path);
    } catch (error) {
      logger.error('Failed to parse config file', {
        error: error instanceof Error ? error.message : String(error),
        path,
      });
      return null;
    }
  }

  /**
   * Repair a configuration file by fixing common issues
   */
  repairConfig(path: string, createBackup: boolean = true): {
    success: boolean;
    fixed: boolean;
    errors: string[];
    warnings: string[];
    backupPath?: string;
  } {
    const result = {
      success: false,
      fixed: false,
      errors: [] as string[],
      warnings: [] as string[],
      backupPath: undefined as string | undefined,
    };

    try {
      const resolvedPath = resolve(path);
      if (!existsSync(resolvedPath)) {
        result.errors.push(`Configuration file not found: ${resolvedPath}`);
        return result;
      }

      // Parse the configuration
      const parseResult = this.parseConfig(resolvedPath);
      if (!parseResult) {
        result.errors.push('Failed to parse configuration file');
        return result;
      }
      
      if (parseResult.errors.length > 0) {
        result.errors.push(...parseResult.errors);
        return result;
      }

      result.warnings.push(...parseResult.warnings);

      // Create backup if requested
      if (createBackup) {
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = `${resolvedPath}.backup.${timestamp}`;
          readFileSync(resolvedPath); // Ensure file is readable
          writeFileSync(backupPath, readFileSync(resolvedPath, 'utf-8'), 'utf-8');
          result.backupPath = backupPath;
          logger.info('Created backup before repair', { backupPath });
        } catch (error) {
          result.warnings.push(`Failed to create backup: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Get the config object
      let config = parseResult.config;

      // Fix common issues
      let fixed = false;

      // Ensure targets is always an array
      if (!config.targets || !Array.isArray(config.targets)) {
        config.targets = [];
        fixed = true;
        logger.info('Fixed missing targets array');
      }

      // Ensure pixiv section exists with minimal structure
      if (!config.pixiv) {
        config.pixiv = {
          clientId: '',
          clientSecret: '',
          deviceToken: 'pixiv',
          refreshToken: '',
          userAgent: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
        };
        fixed = true;
        logger.info('Fixed missing pixiv section');
      } else {
        // Ensure all required pixiv fields exist
        if (!config.pixiv.deviceToken) {
          config.pixiv.deviceToken = 'pixiv';
          fixed = true;
        }
        if (!config.pixiv.userAgent) {
          config.pixiv.userAgent = 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)';
          fixed = true;
        }
      }

      // Ensure storage section exists with defaults
      if (!config.storage) {
        config.storage = {
          downloadDirectory: './downloads',
          databasePath: './data/pixiv-downloader.db',
        };
        fixed = true;
        logger.info('Fixed missing storage section');
      }

      // Ensure download section exists with defaults
      if (!config.download) {
        config.download = {
          concurrency: 3,
          requestDelay: 500,
          dynamicConcurrency: true,
          minConcurrency: 1,
          maxRetries: 3,
          retryDelay: 2000,
          timeout: 60000,
        };
        fixed = true;
        logger.info('Fixed missing download section');
      }

      // Ensure network section exists with defaults
      if (!config.network) {
        config.network = {
          timeoutMs: 30000,
          retries: 3,
          retryDelay: 1000,
        };
        fixed = true;
        logger.info('Fixed missing network section');
      }

      // Write repaired config if fixes were made
      if (fixed) {
        const jsonString = JSON.stringify(config, null, 2);
        writeFileSync(resolvedPath, jsonString, 'utf-8');
        result.fixed = true;
        logger.info('Configuration repaired', { path: resolvedPath });
      }

      result.success = true;
      return result;
    } catch (error) {
      result.errors.push(`Failed to repair config: ${error instanceof Error ? error.message : String(error)}`);
      logger.error('Failed to repair config file', {
        error: error instanceof Error ? error.message : String(error),
        path,
      });
      return result;
    }
  }

  /**
   * Validate and normalize configuration for frontend display
   * This ensures the config is always in a valid format for the frontend
   */
  normalizeConfigForDisplay(config: Partial<StandaloneConfig>): Partial<StandaloneConfig> {
    // Ensure targets is always an array
    const normalized: Partial<StandaloneConfig> = {
      ...config,
      targets: Array.isArray(config.targets) ? config.targets : [],
    };

    // Ensure all sections exist (even if empty) for consistent frontend display
    if (!normalized.pixiv) {
      normalized.pixiv = {
        clientId: '',
        clientSecret: '',
        deviceToken: 'pixiv',
        refreshToken: '',
        userAgent: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
      };
    }

    if (!normalized.storage) {
      normalized.storage = {
        downloadDirectory: './downloads',
        databasePath: './data/pixiv-downloader.db',
      };
    }

    if (!normalized.network) {
      normalized.network = {
        timeoutMs: 30000,
        retries: 3,
        retryDelay: 1000,
      };
    }

    if (!normalized.download) {
      normalized.download = {
        concurrency: 3,
        requestDelay: 500,
        dynamicConcurrency: true,
        minConcurrency: 1,
        maxRetries: 3,
        retryDelay: 2000,
        timeout: 60000,
      };
    }

    return normalized;
  }

  /**
   * Delete a configuration file
   */
  deleteConfig(path: string): boolean {
    try {
      const resolvedPath = resolve(path);
      if (!existsSync(resolvedPath)) {
        return false;
      }
      
      // Don't allow deleting the default config if it's the only one
      const files = this.listConfigFiles();
      if (files.length === 1 && files[0].path === resolvedPath) {
        throw new Error('Cannot delete the last configuration file');
      }
      
      unlinkSync(resolvedPath);
      
      // If this was the current config, reset it
      if (this.currentConfigFile === resolvedPath) {
        this.currentConfigFile = null;
        this.persistCurrentConfigFile();
        // Auto-select another config if available
        const firstConfig = this.getFirstAvailableConfig();
        if (firstConfig) {
          this.currentConfigFile = firstConfig;
          this.persistCurrentConfigFile();
        }
      }
      
      logger.info('Deleted configuration file', { path: resolvedPath });
      return true;
    } catch (error) {
      logger.error('Failed to delete config file', {
        error: error instanceof Error ? error.message : String(error),
        path,
      });
      return false;
    }
  }

  /**
   * Sanitize filename to be safe for filesystem
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100); // Limit length
  }

  /**
   * Get default config path (for backward compatibility)
   */
  getDefaultConfigPath(): string {
    return join(this.configDir, 'standalone.config.json');
  }
}

// Global config manager instance
let globalConfigManager: ConfigManager | null = null;

/**
 * Get or create the global config manager instance
 */
export function getConfigManager(configDir?: string): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager(configDir);
  }
  return globalConfigManager;
}

/**
 * Reset the global config manager (useful for testing)
 */
export function resetConfigManager(): void {
  globalConfigManager = null;
}

