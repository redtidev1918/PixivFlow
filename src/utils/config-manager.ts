/**
 * Configuration file manager
 * Manages multiple configuration files in a directory
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { logger } from '../logger';
import { StandaloneConfig } from '../config';
import { ConfigParser, ConfigParseResult } from './config-parser';
import { readConfigFile, saveConfigFile, importConfigFile } from './config-manager/file-operations';
import { listConfigFiles, getFirstAvailableConfig, getNextConfigFilename, sanitizeFilename } from './config-manager/file-discovery';
import { loadCurrentConfigFile, persistCurrentConfigFile } from './config-manager/config-persistence';
import { repairConfigFile, RepairResult } from './config-manager/config-repair';
import { normalizeConfigForDisplay } from './config-manager/config-normalization';
import { getConfigDirectory } from './project-root';

export class ConfigManager {
  private configDir: string;
  private currentConfigFile: string | null = null;
  private parser: ConfigParser;

  constructor(configDir?: string) {
    // If no configDir provided, use smart detection
    if (configDir) {
      this.configDir = resolve(configDir);
    } else {
      // Use smart detection to find the best config directory
      this.configDir = getConfigDirectory();
    }
    
    // Ensure config directory exists
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
      logger.info('Created config directory', { path: this.configDir });
    }
    // Load persisted current config file
    this.currentConfigFile = loadCurrentConfigFile(this.configDir);
    this.parser = new ConfigParser();
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
  listConfigFiles() {
    return listConfigFiles(this.configDir, this.getCurrentConfigFile());
  }

  /**
   * Get the first available configuration file
   * Priority: standalone.config.json > other JSON files (sorted by modification time)
   */
  getFirstAvailableConfig(): string | null {
    return getFirstAvailableConfig(this.configDir);
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
    persistCurrentConfigFile(this.configDir, this.currentConfigFile);
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
    this.currentConfigFile = loadCurrentConfigFile(this.configDir);
    if (this.currentConfigFile && existsSync(this.currentConfigFile)) {
      return this.currentConfigFile;
    }
    // Auto-select first available config
    const firstConfig = this.getFirstAvailableConfig();
    if (firstConfig) {
      this.currentConfigFile = firstConfig;
      persistCurrentConfigFile(this.configDir, this.currentConfigFile);
      return firstConfig;
    }
    return null;
  }

  /**
   * Get the next available numbered config filename
   * Returns: standalone.config.1.json, standalone.config.2.json, etc.
   */
  getNextConfigFilename(): string {
    return getNextConfigFilename(this.configDir);
  }

  /**
   * Import a configuration and save it with auto-numbering
   * @param config - Configuration object to save
   * @param name - Optional name for the config (used in filename)
   * @returns Path to the saved config file
   */
  importConfig(config: StandaloneConfig, name?: string): string {
    const filename = name
      ? sanitizeFilename(`standalone.config.${name}.json`)
      : this.getNextConfigFilename();
    
    return importConfigFile(config, filename, this.configDir);
  }

  /**
   * Save configuration to a specific file
   */
  saveConfig(config: StandaloneConfig, path: string): void {
    saveConfigFile(config, path);
  }

  /**
   * Read a configuration file
   */
  readConfig(path: string): StandaloneConfig | null {
    return readConfigFile(path);
  }

  /**
   * Read and parse a configuration file with detailed analysis
   */
  parseConfig(path: string): ConfigParseResult | null {
    try {
      return this.parser.parseFile(path);
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
  repairConfig(path: string, createBackup: boolean = true): RepairResult {
    return repairConfigFile(path, this.parser, createBackup);
  }

  /**
   * Validate and normalize configuration for frontend display
   * This ensures the config is always in a valid format for the frontend
   */
  normalizeConfigForDisplay(config: Partial<StandaloneConfig>): Partial<StandaloneConfig> {
    return normalizeConfigForDisplay(config);
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
        persistCurrentConfigFile(this.configDir, this.currentConfigFile);
        // Auto-select another config if available
        const firstConfig = this.getFirstAvailableConfig();
        if (firstConfig) {
          this.currentConfigFile = firstConfig;
          persistCurrentConfigFile(this.configDir, this.currentConfigFile);
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
