/**
 * API services index
 * 
 * This file exports all API services and maintains backward compatibility
 * with the old api.ts structure.
 */

// Export all API services
export { authApi } from './auth';
export { configApi } from './config';
export { downloadApi } from './download';
export { filesApi } from './files';
export { logsApi } from './logs';
export { statsApi } from './stats';

// Export client and utilities
export { apiClient, createApiClient, createCustomApiClient } from './client';
export { ApiError, handleApiError } from './error-handler';
export { setupRequestInterceptor, setupResponseInterceptor } from './interceptors';

// Export types
export * from './types';

// Backward compatibility: Create a unified API object
import { authApi } from './auth';
import { configApi } from './config';
import { downloadApi } from './download';
import { filesApi } from './files';
import { logsApi } from './logs';
import { statsApi } from './stats';

/**
 * Unified API object for backward compatibility
 * @deprecated Use individual API services (authApi, configApi, etc.) instead
 */
export const api = {
  // Authentication
  getAuthStatus: authApi.getAuthStatus,
  login: authApi.login,
  loginWithToken: authApi.loginWithToken,
  refreshToken: authApi.refreshToken,
  logout: authApi.logout,

  // Configuration
  getConfig: configApi.getConfig,
  updateConfig: configApi.updateConfig,
  validateConfig: configApi.validateConfig,
  backupConfig: configApi.backupConfig,
  restoreConfig: configApi.restoreConfig,
  getConfigHistory: configApi.getConfigHistory,
  saveConfigHistory: configApi.saveConfigHistory,
  applyConfigHistory: configApi.applyConfigHistory,
  deleteConfigHistory: configApi.deleteConfigHistory,
  listConfigFiles: configApi.listConfigFiles,
  switchConfigFile: configApi.switchConfigFile,
  importConfigFile: configApi.importConfigFile,
  deleteConfigFile: configApi.deleteConfigFile,
  getConfigFileContent: configApi.getConfigFileContent,
  updateConfigFileContent: configApi.updateConfigFileContent,
  diagnoseConfig: configApi.diagnoseConfig,
  repairConfig: configApi.repairConfig,

  // Download
  startDownload: downloadApi.startDownload,
  stopDownload: downloadApi.stopDownload,
  getDownloadStatus: downloadApi.getDownloadStatus,
  getTaskLogs: downloadApi.getTaskLogs,
  getDownloadHistory: downloadApi.getDownloadHistory,
  runAllDownloads: downloadApi.runAllDownloads,
  randomDownload: downloadApi.randomDownload,
  getIncompleteTasks: downloadApi.getIncompleteTasks,
  resumeDownload: downloadApi.resumeDownload,
  deleteIncompleteTask: downloadApi.deleteIncompleteTask,
  deleteAllIncompleteTasks: downloadApi.deleteAllIncompleteTasks,

  // Statistics
  getStatsOverview: statsApi.getStatsOverview,
  getDownloadStats: statsApi.getDownloadStats,
  getTagStats: statsApi.getTagStats,
  getAuthorStats: statsApi.getAuthorStats,

  // Logs
  getLogs: logsApi.getLogs,
  clearLogs: logsApi.clearLogs,

  // Files
  listFiles: filesApi.listFiles,
  getRecentFiles: filesApi.getRecentFiles,
  getFilePreview: filesApi.getFilePreview,
  deleteFile: filesApi.deleteFile,
  normalizeFiles: filesApi.normalizeFiles,
};

