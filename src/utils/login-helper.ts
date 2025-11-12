/**
 * Login helper utility
 * Provides functions to login and update config file
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TerminalLogin, LoginInfo } from '../terminal-login';
import { loadConfig, StandaloneConfig, getConfigPath } from '../config';
import { logger } from '../logger';
import { saveTokenToStorage, clearTokenFromStorage } from './token-manager';

/**
 * Update config file with new refresh token
 * Also saves token to unified storage for cross-config-file persistence
 */
export async function updateConfigWithToken(
  configPath: string,
  refreshToken: string
): Promise<void> {
  try {
    let configData: any;
    try {
      const fileContent = await fs.readFile(configPath, 'utf-8');
      configData = JSON.parse(fileContent);
    } catch (parseError) {
      // If file doesn't exist or is invalid JSON, create a new config
      logger.warn('Config file is invalid or missing, creating new config with token');
      const { generateDefaultConfig } = await import('../config/defaults');
      configData = generateDefaultConfig();
    }
    
    // Ensure pixiv section exists
    if (!configData.pixiv) {
      configData.pixiv = {};
    }
    
    configData.pixiv.refreshToken = refreshToken;
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf-8');
    logger.info('Configuration updated with new refresh token');
    
    // Also save to unified storage for cross-config-file persistence
    saveTokenToStorage(refreshToken, configData.storage?.databasePath);
  } catch (error) {
    throw new Error(`Failed to update config file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Clear refresh token from config file (logout)
 * Also clears token from unified storage
 */
export async function clearConfigToken(
  configPath: string
): Promise<void> {
  try {
    const configData = JSON.parse(await fs.readFile(configPath, 'utf-8')) as StandaloneConfig;
    // Clear the refresh token by setting it to placeholder
    configData.pixiv.refreshToken = 'YOUR_REFRESH_TOKEN';
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf-8');
    logger.info('Configuration updated: refresh token cleared');
    
    // Also clear from unified storage
    clearTokenFromStorage(configData.storage?.databasePath);
  } catch (error) {
    throw new Error(`Failed to clear token from config file: ${error}`);
  }
}

/**
 * Perform login and update config file
 * @param options Login options
 * @returns LoginInfo with tokens
 */
export async function loginAndUpdateConfig(options: {
  configPath?: string;
  headless?: boolean;
  username?: string;
  password?: string;
} = {}): Promise<LoginInfo> {
  // Use getConfigPath to ensure we use the same config path resolution logic
  const configPath = options.configPath || getConfigPath();

  logger.info('Starting Pixiv login...');
  
  const login = new TerminalLogin({
    headless: options.headless ?? false,
    username: options.username,
    password: options.password,
  });

  const loginInfo = await login.login({
    headless: options.headless,
    username: options.username,
    password: options.password,
  });

  // Update config file with refresh token
  await updateConfigWithToken(configPath, loginInfo.refresh_token);
  
  logger.info('Login successful and config updated!');
  return loginInfo;
}

/**
 * Check if refresh token is valid by attempting to refresh
 */
export async function isTokenValid(refreshToken: string): Promise<boolean> {
  try {
    await TerminalLogin.refresh(refreshToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure valid token exists in config, login if needed
 */
export async function ensureValidToken(options: {
  configPath?: string;
  headless?: boolean;
  username?: string;
  password?: string;
  autoLogin?: boolean;
} = {}): Promise<string> {
  // Use getConfigPath to ensure we use the same config path resolution logic
  const configPath = options.configPath || getConfigPath();

  try {
    const config = loadConfig(configPath);
    const refreshToken = config.pixiv.refreshToken;

    // In Docker/non-interactive environments, skip token validation
    // and trust the token in config file (should be validated on host)
    logger.info(`ensureValidToken: autoLogin=${options.autoLogin}, refreshToken=${refreshToken ? 'exists' : 'missing'}`);
    if (options.autoLogin === false) {
      if (refreshToken) {
        logger.info('Using refresh token from config (skip validation in Docker environment)');
        return refreshToken;
      } else {
        throw new Error('No refresh token found in config and auto-login is disabled. Please login on host first.');
      }
    }

    // Check if token is valid
    if (refreshToken && await isTokenValid(refreshToken)) {
      logger.info('Valid refresh token found in config');
      return refreshToken;
    }

    // Token invalid or missing, need to login
    logger.warn('Invalid or missing refresh token, performing login...');
    const loginInfo = await loginAndUpdateConfig({
      configPath,
      headless: options.headless,
      username: options.username,
      password: options.password,
    });
    return loginInfo.refresh_token;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Configuration file not found')) {
      // Config file doesn't exist, need to login
      if (options.autoLogin !== false) {
        logger.warn('Config file not found, performing login...');
        const loginInfo = await loginAndUpdateConfig({
          configPath,
          headless: options.headless,
          username: options.username,
          password: options.password,
        });
        return loginInfo.refresh_token;
      } else {
        throw new Error('Config file not found and auto-login is disabled');
      }
    }
    throw error;
  }
}

