/**
 * Token Manager - Unified token storage management
 * 
 * This module provides a unified way to store and retrieve Pixiv refresh tokens
 * across different configuration files. Tokens are stored in a user-level location
 * (based on database path) so they persist when switching between config files.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { logger } from '../logger';

const TOKEN_FILE_NAME = '.pixiv-refresh-token';
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
    
    // Save token to file (simple text file, no JSON wrapper needed)
    writeFileSync(tokenPath, refreshToken.trim(), 'utf-8');
    logger.debug('Token saved to unified storage', { tokenPath });
  } catch (error) {
    logger.warn('Failed to save token to unified storage', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - this is a non-critical operation
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
      return null;
    }
    
    const token = readFileSync(tokenPath, 'utf-8').trim();
    
    if (isPlaceholderToken(token)) {
      return null;
    }
    
    logger.debug('Token loaded from unified storage', { tokenPath });
    return token;
  } catch (error) {
    logger.warn('Failed to load token from unified storage', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Clear token from unified storage
 * @param databasePath Optional database path to determine storage location
 */
export function clearTokenFromStorage(databasePath?: string): void {
  try {
    const tokenPath = getTokenFilePath(databasePath);
    
    if (existsSync(tokenPath)) {
      writeFileSync(tokenPath, PLACEHOLDER_TOKEN, 'utf-8');
      logger.debug('Token cleared from unified storage', { tokenPath });
    }
  } catch (error) {
    logger.warn('Failed to clear token from unified storage', {
      error: error instanceof Error ? error.message : String(error),
    });
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

