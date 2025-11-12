import {
  api,
  ConfigData,
  ConfigHistoryEntry,
  ConfigFileInfo,
  ConfigFileContent,
  ConfigDiagnoseResult,
  ConfigRepairResult,
} from './api';

/**
 * Configuration Service
 * Encapsulates all configuration-related API calls
 */
export const configService = {
  /**
   * Get current configuration
   */
  async getConfig(): Promise<ConfigData> {
    const response = await api.getConfig();
    return response.data.data;
  },

  /**
   * Update configuration
   */
  async updateConfig(config: Partial<ConfigData>): Promise<ConfigData> {
    const response = await api.updateConfig(config);
    return response.data.data;
  },

  /**
   * Validate configuration without saving
   */
  async validateConfig(config: Partial<ConfigData>): Promise<{ valid: boolean; errors?: string[] }> {
    const response = await api.validateConfig(config);
    return response.data.data;
  },

  /**
   * Backup current configuration
   */
  async backupConfig(): Promise<{ backupPath: string }> {
    const response = await api.backupConfig();
    return response.data.data;
  },

  /**
   * Restore configuration from backup
   */
  async restoreConfig(backupPath: string): Promise<ConfigData> {
    const response = await api.restoreConfig(backupPath);
    return response.data.data;
  },

  /**
   * Get configuration history
   */
  async getConfigHistory(): Promise<ConfigHistoryEntry[]> {
    const response = await api.getConfigHistory();
    return response.data.data;
  },

  /**
   * Save configuration to history
   */
  async saveConfigHistory(
    name: string,
    config: Partial<ConfigData>,
    description?: string
  ): Promise<ConfigHistoryEntry> {
    const response = await api.saveConfigHistory(name, config, description);
    return response.data.data;
  },

  /**
   * Apply a configuration history entry
   */
  async applyConfigHistory(id: number): Promise<void> {
    await api.applyConfigHistory(id);
  },

  /**
   * Delete a configuration history entry
   */
  async deleteConfigHistory(id: number): Promise<void> {
    await api.deleteConfigHistory(id);
  },

  /**
   * List all configuration files
   */
  async listConfigFiles(): Promise<ConfigFileInfo[]> {
    const response = await api.listConfigFiles();
    return response.data.data;
  },

  /**
   * Switch to a different configuration file
   */
  async switchConfigFile(path: string): Promise<void> {
    await api.switchConfigFile(path);
  },

  /**
   * Import a configuration file
   */
  async importConfigFile(
    config: Partial<ConfigData>,
    name?: string
  ): Promise<ConfigFileInfo> {
    const response = await api.importConfigFile(config, name);
    return response.data.data;
  },

  /**
   * Delete a configuration file
   */
  async deleteConfigFile(filename: string): Promise<void> {
    await api.deleteConfigFile(filename);
  },

  /**
   * Get configuration file content
   */
  async getConfigFileContent(filename: string): Promise<ConfigFileContent> {
    const response = await api.getConfigFileContent(filename);
    return response.data.data;
  },

  /**
   * Update configuration file content
   */
  async updateConfigFileContent(filename: string, content: string): Promise<void> {
    await api.updateConfigFileContent(filename, content);
  },

  /**
   * Diagnose configuration
   */
  async diagnoseConfig(): Promise<ConfigDiagnoseResult> {
    const response = await api.diagnoseConfig();
    return response.data.data;
  },

  /**
   * Repair configuration
   */
  async repairConfig(createBackup = true): Promise<ConfigRepairResult> {
    const response = await api.repairConfig(createBackup);
    return response.data.data;
  },
};

