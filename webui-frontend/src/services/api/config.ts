import { AxiosResponse } from 'axios';
import { apiClient } from './client';
import {
  ApiResponse,
  ConfigData,
  ConfigHistoryEntry,
  ConfigFileInfo,
  ConfigFileContent,
  ConfigDiagnoseResult,
  ConfigRepairResult,
} from './types';

/**
 * Configuration API service
 */
export const configApi = {
  /**
   * Get current configuration
   */
  getConfig: (): Promise<AxiosResponse<ApiResponse<ConfigData>>> =>
    apiClient.get('/config'),

  /**
   * Update configuration
   * @param config - Configuration object to update
   */
  updateConfig: (config: Partial<ConfigData>): Promise<AxiosResponse<ApiResponse<ConfigData>>> =>
    apiClient.put('/config', config),

  /**
   * Validate configuration without saving
   * @param config - Configuration object to validate
   */
  validateConfig: (
    config: Partial<ConfigData>
  ): Promise<AxiosResponse<ApiResponse<{ valid: boolean; errors?: string[] }>>> =>
    apiClient.post('/config/validate', config),

  /**
   * Backup current configuration
   */
  backupConfig: (): Promise<AxiosResponse<ApiResponse<{ backupPath: string }>>> =>
    apiClient.get('/config/backup'),

  /**
   * Restore configuration from backup
   * @param backupPath - Path to backup file
   */
  restoreConfig: (backupPath: string): Promise<AxiosResponse<ApiResponse<ConfigData>>> =>
    apiClient.post('/config/restore', { backupPath }),

  /**
   * Get configuration history
   */
  getConfigHistory: (): Promise<AxiosResponse<ApiResponse<ConfigHistoryEntry[]>>> =>
    apiClient.get('/config/history'),

  /**
   * Save configuration to history
   * @param name - Configuration name
   * @param config - Configuration object
   * @param description - Optional description
   */
  saveConfigHistory: (
    name: string,
    config: Partial<ConfigData>,
    description?: string
  ): Promise<AxiosResponse<ApiResponse<{ id: number }>>> =>
    apiClient.post('/config/history', { name, config, description }),

  /**
   * Apply a configuration history entry
   * @param id - History entry ID
   */
  applyConfigHistory: (id: number): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.post(`/config/history/${id}/apply`),

  /**
   * Delete a configuration history entry
   * @param id - History entry ID
   */
  deleteConfigHistory: (id: number): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.delete(`/config/history/${id}`),

  // ========== Configuration Files ==========

  /**
   * List all configuration files in the config directory
   */
  listConfigFiles: (): Promise<AxiosResponse<ApiResponse<ConfigFileInfo[]>>> =>
    apiClient.get('/config/files'),

  /**
   * Switch to a different configuration file
   * @param path - Path to the configuration file
   */
  switchConfigFile: (path: string): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.post('/config/files/switch', { path }),

  /**
   * Import a configuration and save it with auto-numbering
   * @param config - Configuration object to import
   * @param name - Optional name for the config
   */
  importConfigFile: (
    config: Partial<ConfigData>,
    name?: string
  ): Promise<AxiosResponse<ApiResponse<{
    path: string;
    pathRelative: string;
    filename: string;
  }>>> =>
    apiClient.post('/config/files/import', { config, name }),

  /**
   * Delete a configuration file
   * @param filename - Filename to delete
   */
  deleteConfigFile: (filename: string): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.delete(`/config/files/${filename}`),

  /**
   * Get the raw JSON content of a configuration file
   * @param filename - Filename to read
   */
  getConfigFileContent: (filename: string): Promise<AxiosResponse<ApiResponse<ConfigFileContent>>> =>
    apiClient.get(`/config/files/${filename}/content`),

  /**
   * Update the raw JSON content of a configuration file
   * @param filename - Filename to update
   * @param content - Raw JSON content as string
   */
  updateConfigFileContent: (
    filename: string,
    content: string
  ): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.put(`/config/files/${filename}/content`, { content }),

  /**
   * Diagnose and analyze current configuration
   */
  diagnoseConfig: (): Promise<AxiosResponse<ApiResponse<ConfigDiagnoseResult>>> =>
    apiClient.get('/config/diagnose'),

  /**
   * Repair current configuration file
   * @param createBackup - Whether to create a backup before repairing (default: true)
   */
  repairConfig: (createBackup?: boolean): Promise<AxiosResponse<ApiResponse<ConfigRepairResult>>> =>
    apiClient.post('/config/repair', { createBackup }),
};

