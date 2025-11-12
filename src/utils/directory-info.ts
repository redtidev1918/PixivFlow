/**
 * Directory information display utility
 * Shows users where files are saved and default directory locations
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { StandaloneConfig } from '../config';
import { getConfigDirectory, getDefaultConfigPath } from './project-root';

export interface DirectoryInfo {
  configDirectory: string;
  configFile: string;
  downloadDirectory: string;
  illustrationDirectory: string;
  novelDirectory: string;
  databasePath: string;
  logDirectory?: string;
}

/**
 * Get all directory information from configuration
 * Note: config should already have resolved absolute paths from applyDefaults()
 */
export function getDirectoryInfo(config: StandaloneConfig | any, configPath?: string): DirectoryInfo {
  const configFile = configPath || getDefaultConfigPath();
  const configDir = getConfigDirectory();
  
  // Use the resolved paths from config (they should already be absolute after applyDefaults)
  const storage = config.storage || {};
  const downloadDir = storage.downloadDirectory || './downloads';
  const illustrationDir = storage.illustrationDirectory || resolve(downloadDir, 'illustrations');
  const novelDir = storage.novelDirectory || resolve(downloadDir, 'novels');
  const databasePath = storage.databasePath || './data/pixiv-downloader.db';
  
  // Paths should already be absolute from applyDefaults, but ensure they are resolved
  // resolve() will return absolute paths as-is, or resolve relative paths
  const resolvedDownloadDir = resolve(downloadDir);
  const resolvedIllustrationDir = resolve(illustrationDir);
  const resolvedNovelDir = resolve(novelDir);
  const resolvedDatabasePath = resolve(databasePath);
  
  // Extract log directory from database path
  const logDirectory = resolve(resolvedDatabasePath, '..');

  return {
    configDirectory: configDir,
    configFile: resolve(configFile),
    downloadDirectory: resolvedDownloadDir,
    illustrationDirectory: resolvedIllustrationDir,
    novelDirectory: resolvedNovelDir,
    databasePath: resolvedDatabasePath,
    logDirectory,
  };
}

/**
 * Format directory path for display (shorten if too long)
 */
function formatPath(path: string, maxLength: number = 80): string {
  if (path.length <= maxLength) {
    return path;
  }
  
  // Try to show beginning and end of path
  const start = path.substring(0, Math.floor(maxLength / 2) - 10);
  const end = path.substring(path.length - Math.floor(maxLength / 2) + 10);
  return `${start}...${end}`;
}

/**
 * Check if a directory exists
 */
function checkDirectoryExists(path: string): { exists: boolean; readable: boolean } {
  try {
    const exists = existsSync(path);
    return { exists, readable: exists };
  } catch {
    return { exists: false, readable: false };
  }
}

/**
 * Display directory information in a formatted way
 */
export function displayDirectoryInfo(info: DirectoryInfo, options?: { verbose?: boolean }): void {
  const verbose = options?.verbose ?? false;
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              📁 Directory Information                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Configuration
  console.log('📋 Configuration:');
  const configStatus = checkDirectoryExists(info.configFile);
  console.log(`   ${configStatus.exists ? '✓' : '✗'} Config File: ${formatPath(info.configFile)}`);
  if (!configStatus.exists && !verbose) {
    console.log('     ⚠ Config file does not exist, will use default configuration');
  }
  console.log(`   📂 Config Directory: ${formatPath(info.configDirectory)}`);
  console.log('');

  // Storage directories
  console.log('💾 Storage Directories:');
  
  const downloadStatus = checkDirectoryExists(info.downloadDirectory);
  console.log(`   ${downloadStatus.exists ? '✓' : '○'} Download Directory: ${formatPath(info.downloadDirectory)}`);
  if (!downloadStatus.exists) {
    console.log('     ℹ Directory does not exist, will be created on first download');
  }
  
  const illustrationStatus = checkDirectoryExists(info.illustrationDirectory);
  console.log(`   ${illustrationStatus.exists ? '✓' : '○'} Illustration Directory: ${formatPath(info.illustrationDirectory)}`);
  
  const novelStatus = checkDirectoryExists(info.novelDirectory);
  console.log(`   ${novelStatus.exists ? '✓' : '○'} Novel Directory: ${formatPath(info.novelDirectory)}`);
  console.log('');

  // Database
  console.log('🗄️  Database:');
  const dbDir = resolve(info.databasePath, '..');
  const dbDirStatus = checkDirectoryExists(dbDir);
  const dbFileStatus = checkDirectoryExists(info.databasePath);
  console.log(`   ${dbFileStatus.exists ? '✓' : '○'} Database File: ${formatPath(info.databasePath)}`);
  if (!dbDirStatus.exists) {
    console.log('     ℹ Database directory does not exist, will be created on first run');
  }
  console.log('');

  // Logs
  if (info.logDirectory) {
    console.log('📝 Logs:');
    const logStatus = checkDirectoryExists(info.logDirectory);
    console.log(`   ${logStatus.exists ? '✓' : '○'} Log Directory: ${formatPath(info.logDirectory)}`);
    console.log('');
  }

  // Summary
  console.log('💡 Tips:');
  console.log('   • Use "pixivflow config show" to view full configuration');
  console.log('   • Use "pixivflow config set <key> <value>" to modify directory paths');
  console.log('   • Downloaded files will be saved in the directories above');
  console.log('');
}

/**
 * Display directory information in a compact format (for download operations)
 */
export function displayDownloadPath(path: string, type: 'illustration' | 'novel'): void {
  const icon = type === 'illustration' ? '🖼️' : '📖';
  const typeName = type === 'illustration' ? 'Illustration' : 'Novel';
  console.log(`   ${icon} ${typeName} saved: ${formatPath(path, 100)}`);
}

/**
 * Display initialization message with directory information
 */
export function displayInitializationInfo(info: DirectoryInfo): void {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          🚀 PixivFlow Initialized                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📁 Important Directories:\n');
  console.log(`   📥 Download Directory: ${formatPath(info.downloadDirectory)}`);
  console.log(`   🖼️  Illustration Directory: ${formatPath(info.illustrationDirectory)}`);
  console.log(`   📖 Novel Directory: ${formatPath(info.novelDirectory)}`);
  console.log(`   🗄️  Database: ${formatPath(info.databasePath)}`);
  console.log(`   📋 Config File: ${formatPath(info.configFile)}\n`);
  
  console.log('💡 Tip: Use "pixivflow dirs" to view directory information anytime\n');
}

