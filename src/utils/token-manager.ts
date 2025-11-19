/**
 * Token Manager - Unified token storage management
 * 
 * This module provides a unified way to store and retrieve Pixiv refresh tokens
 * across different configuration files. Tokens are stored in a user-level location
 * (based on database path) so they persist when switching between config files.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { logger } from '../logger';

const TOKEN_FILE_NAME = '.pixiv-refresh-token';
const TOKEN_BACKUP_FILE_NAME = '.pixiv-refresh-token.backup';
const PLACEHOLDER_TOKEN = 'YOUR_REFRESH_TOKEN';

/**
 * Get the token storage directory based on database path
 * This ensures tokens are stored in a user-level location
 */
function getTokenStorageDir(databasePath?: string): string {
  if (databasePath) {
    // Use the same directory as the database
    return dirname(resolve(databasePath));
  }
  
  // Fallback to user's home directory
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
  return join(homeDir, '.pixiv-downloader');
}

/**
 * Get the token file path
 */
function getTokenFilePath(databasePath?: string): string {
  const storageDir = getTokenStorageDir(databasePath);
  return join(storageDir, TOKEN_FILE_NAME);
}

/**
 * Check if a token is a placeholder (not a real token)
 */
export function isPlaceholderToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string') {
    return true;
  }
  return token.trim() === '' || token === PLACEHOLDER_TOKEN || token.length < 10;
}

/**
 * Create a backup of the current token file
 * @param databasePath Optional database path to determine storage location
 */
function backupToken(databasePath?: string): void {
  try {
    const tokenPath = getTokenFilePath(databasePath);
    if (!existsSync(tokenPath)) {
      return; // No token to backup
    }
    
    const backupPath = join(dirname(tokenPath), TOKEN_BACKUP_FILE_NAME);
    copyFileSync(tokenPath, backupPath);
    logger.debug('Token backup created', { backupPath });
  } catch (error) {
    logger.warn('Failed to create token backup', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - backup is optional
  }
}

/**
 * Restore token from backup if main token file is missing or corrupted
 * @param databasePath Optional database path to determine storage location
 * @returns The restored token, or null if restoration failed
 */
function restoreTokenFromBackup(databasePath?: string): string | null {
  try {
    const backupPath = join(getTokenStorageDir(databasePath), TOKEN_BACKUP_FILE_NAME);
    
    if (!existsSync(backupPath)) {
      return null;
    }
    
    const token = readFileSync(backupPath, 'utf-8').trim();
    
    if (isPlaceholderToken(token)) {
      return null;
    }
    
    logger.info('Token restored from backup', { backupPath });
    
    // Restore the main token file
    const tokenPath = getTokenFilePath(databasePath);
    writeFileSync(tokenPath, token, 'utf-8');
    
    return token;
  } catch (error) {
    logger.warn('Failed to restore token from backup', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Save refresh token to unified storage
 * @param refreshToken The refresh token to save
 * @param databasePath Optional database path to determine storage location
 */
export function saveTokenToStorage(refreshToken: string, databasePath?: string): void {
  if (isPlaceholderToken(refreshToken)) {
    logger.warn('Attempted to save placeholder token, skipping');
    return;
  }

  try {
    const tokenPath = getTokenFilePath(databasePath);
    const storageDir = dirname(tokenPath);
    
    // Ensure directory exists
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }
    
    // Create backup of existing token before overwriting
    if (existsSync(tokenPath)) {
      backupToken(databasePath);
    }
    
    // Save token to file (simple text file, no JSON wrapper needed)
    writeFileSync(tokenPath, refreshToken.trim(), 'utf-8');
    logger.debug('Token saved to unified storage', { tokenPath });
    
    // Verify the write was successful
    if (!existsSync(tokenPath)) {
      throw new Error('Token file was not created successfully');
    }
    
    // Double-check the content
    const savedToken = readFileSync(tokenPath, 'utf-8').trim();
    if (savedToken !== refreshToken.trim()) {
      throw new Error('Saved token does not match input token');
    }
  } catch (error) {
    logger.error('Failed to save token to unified storage', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - this is a non-critical operation, but log as error
  }
}

/**
 * Load refresh token from unified storage
 * @param databasePath Optional database path to determine storage location
 * @returns The refresh token, or null if not found
 */
export function loadTokenFromStorage(databasePath?: string): string | null {
  try {
    const tokenPath = getTokenFilePath(databasePath);
    
    if (!existsSync(tokenPath)) {
      // Try to restore from backup
      logger.debug('Token file not found, attempting to restore from backup');
      return restoreTokenFromBackup(databasePath);
    }
    
    const token = readFileSync(tokenPath, 'utf-8').trim();
    
    if (isPlaceholderToken(token)) {
      // Token is invalid, try backup
      logger.debug('Token file contains placeholder, attempting to restore from backup');
      return restoreTokenFromBackup(databasePath);
    }
    
    logger.debug('Token loaded from unified storage', { tokenPath });
    return token;
  } catch (error) {
    logger.warn('Failed to load token from unified storage', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Try backup as last resort
    return restoreTokenFromBackup(databasePath);
  }
}

/**
 * Clear token from unified storage
 * Deletes the token file to ensure complete removal
 * @param databasePath Optional database path to determine storage location
 */
export function clearTokenFromStorage(databasePath?: string): void {
  try {
    const tokenPath = getTokenFilePath(databasePath);
    logger.info('Attempting to clear token from unified storage', { 
      tokenPath, 
      databasePath: databasePath || 'not provided (using default)' 
    });
    
    if (existsSync(tokenPath)) {
      unlinkSync(tokenPath);
      logger.info('Token file deleted from unified storage', { tokenPath });
    } else {
      logger.info('Token file does not exist in unified storage (may have been already cleared)', { tokenPath });
    }
  } catch (error) {
    logger.error('Failed to clear token from unified storage', {
      error: error instanceof Error ? error.message : String(error),
      databasePath: databasePath || 'not provided',
    });
    // Don't throw - clearing unified storage is best effort, but log as error for visibility
  }
}

/**
 * Get the best available refresh token
 * Priority: 1) Config file token (if valid), 2) Unified storage token
 * @param configToken Token from config file
 * @param databasePath Optional database path to determine storage location
 * @returns The best available token, or null if none found
 */
export function getBestAvailableToken(configToken: string | undefined | null, databasePath?: string): string | null {
  // First, try config file token (if valid)
  if (!isPlaceholderToken(configToken)) {
    return configToken!;
  }
  
  // Fallback to unified storage
  return loadTokenFromStorage(databasePath);
}

