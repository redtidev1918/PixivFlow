/**
 * @deprecated This file is kept for backward compatibility.
 * Please use the new API structure from './api/index' instead.
 * 
 * The API has been refactored into separate service modules:
 * - authApi: Authentication related APIs
 * - configApi: Configuration related APIs
 * - downloadApi: Download related APIs
 * - filesApi: File management APIs
 * - logsApi: Logs APIs
 * - statsApi: Statistics APIs
 * 
 * The old `api` object is still available for backward compatibility,
 * but new code should use the individual API services.
 */

// Import individual services to avoid circular dependency
import { authApi } from './api/auth';
import { configApi } from './api/config';
import { downloadApi } from './api/download';
import { filesApi } from './api/files';
import { logsApi } from './api/logs';
import { statsApi } from './api/stats';
import { apiClient, createApiClient, createCustomApiClient } from './api/client';
import { ApiError, handleApiError } from './api/error-handler';
import { setupRequestInterceptor, setupResponseInterceptor } from './api/interceptors';

// Re-export all services
export {
  authApi,
  configApi,
  downloadApi,
  filesApi,
  logsApi,
  statsApi,
  apiClient,
  createApiClient,
  createCustomApiClient,
  ApiError,
  handleApiError,
  setupRequestInterceptor,
  setupResponseInterceptor,
};

// Create unified API object for backward compatibility
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

// Re-export types
export type {
  ApiResponse,
  StatsOverview,
  DownloadTask,
  DownloadStatus,
  IncompleteTask,
  DownloadHistoryItem,
  DownloadHistoryResponse,
  FileItem,
  FilesResponse,
  LogEntry,
  LogsResponse,
  ConfigData,
  AuthStatus,
  AuthLoginResponse,
  ConfigHistoryEntry,
  ConfigFileInfo,
  ConfigFileContent,
  ConfigDiagnoseResult,
  ConfigRepairResult,
  TaskLogsResponse,
  NormalizeFilesResult,
} from './api/types';
