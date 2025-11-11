import { Request, Response } from 'express';
import { getConfigPath, loadConfig } from '../../../../config';
import { TerminalLogin } from '../../../../terminal-login';
import { updateConfigWithToken } from '../../../../utils/login-helper';
import { logger } from '../../../../logger';
import { ErrorCode } from '../../../utils/error-codes';
import { getBestAvailableToken, isPlaceholderToken } from '../../../../utils/token-manager';
import { readConfigRaw } from './auth-utils';

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    let tokenToUse: string | undefined = refreshToken;

    if (!tokenToUse) {
      // Try to get from config
      const configPath = getConfigPath();
      let config;
      try {
        config = loadConfig(configPath);
      } catch (error) {
        // If config loading fails, try to read raw config
        logger.warn('Failed to load config, trying raw read', { error });
        const rawConfig = readConfigRaw(configPath);
        if (rawConfig?.pixiv?.refreshToken && !isPlaceholderToken(rawConfig.pixiv.refreshToken)) {
          tokenToUse = rawConfig.pixiv.refreshToken;
        } else {
          // Try unified storage
          const unifiedToken = getBestAvailableToken(undefined, rawConfig?.storage?.databasePath);
          if (unifiedToken) {
            tokenToUse = unifiedToken;
          }
        }
      }
      
      if (!tokenToUse) {
        tokenToUse = config?.pixiv?.refreshToken;
      }

      // Check if token is placeholder
      if (!tokenToUse || isPlaceholderToken(tokenToUse)) {
        // Try unified storage as last resort
        const rawConfig = readConfigRaw(configPath);
        const unifiedToken = getBestAvailableToken(tokenToUse, rawConfig?.storage?.databasePath);
        if (unifiedToken) {
          tokenToUse = unifiedToken;
        } else {
          res.status(400).json({
            errorCode: ErrorCode.AUTH_REFRESH_TOKEN_REQUIRED,
            message: 'No valid refresh token found. Please login first.',
          });
          return;
        }
      }
    }

    // Validate token is not placeholder before attempting refresh
    if (isPlaceholderToken(tokenToUse)) {
      res.status(400).json({
        errorCode: ErrorCode.AUTH_REFRESH_TOKEN_REQUIRED,
        message: 'Refresh token is a placeholder. Please login to get a valid token.',
      });
      return;
    }

    const loginInfo = await TerminalLogin.refresh(tokenToUse);
    
    // Auto-update config file with new refresh token if it changed
    if (loginInfo.refresh_token && loginInfo.refresh_token !== tokenToUse) {
      try {
        const configPath = getConfigPath();
        await updateConfigWithToken(configPath, loginInfo.refresh_token);
        logger.info('Config file automatically updated with new refresh token');
      } catch (error) {
        logger.warn('Failed to update config file with new refresh token', { error });
        // Don't fail the request - token refresh succeeded
      }
    }
    
    res.json({
      success: true,
      errorCode: ErrorCode.AUTH_REFRESH_SUCCESS,
      accessToken: loginInfo.access_token,
      refreshToken: loginInfo.refresh_token,
      expiresIn: loginInfo.expires_in,
    });
  } catch (error) {
    logger.error('Token refresh failed', { error });
    
    // Provide more detailed error message
    let errorMessage = error instanceof Error ? error.message : String(error);
    let statusCode = 401;
    
    // Check for specific error types
    if (errorMessage.includes('Failed to refresh token')) {
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        errorMessage = 'Refresh token is invalid or expired. Please login again.';
      } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        errorMessage = 'Refresh token is forbidden. Please login again.';
      } else if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
        statusCode = 429;
      }
    }
    
    res.status(statusCode).json({
      errorCode: ErrorCode.AUTH_REFRESH_FAILED,
      message: errorMessage,
    });
  }
}

