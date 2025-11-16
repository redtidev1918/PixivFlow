import { Request, Response } from 'express';
import { getConfigPath, loadConfig, ConfigValidationError } from '../../../../config';
import { logger } from '../../../../logger';
import { ErrorCode } from '../../../utils/error-codes';
import { ConfigError } from '../../../../utils/errors';
import { isPlaceholderToken, getBestAvailableToken } from '../../../../utils/token-manager';
import { readConfigRaw, getRefreshToken, validateToken, getValidationErrors } from './auth-utils';

/**
 * GET /api/auth/status
 * Get authentication status
 * Validates token to ensure it's still valid, not just checking if it exists
 */
export async function getAuthStatus(req: Request, res: Response): Promise<void> {
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    const refreshToken = config.pixiv?.refreshToken;
    const hasToken = !!refreshToken && !isPlaceholderToken(refreshToken);
    
    // Validate token if it exists
    let authenticated = false;
    let tokenValid = false;
    let user = null;
    
    if (hasToken && refreshToken) {
      const validation = await validateToken(refreshToken);
      tokenValid = validation.valid;
      authenticated = validation.valid; // Only authenticated if token is valid
      user = validation.user;
      
      if (tokenValid) {
        logger.debug('Token validation successful', { hasUser: !!user });
      } else {
        logger.debug('Token validation failed - user is not authenticated', { hasToken });
      }
    } else {
      logger.debug('No valid token found - user is not authenticated', { hasToken, configPath });
    }

    logger.debug('Auth status check', { authenticated, hasToken, tokenValid, configPath });

    res.json({
      data: {
        authenticated,
        hasToken,
        tokenValid,
        isAuthenticated: authenticated, // Alias for compatibility
        user,
      },
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      const { errors: validationErrors, warnings: validationWarnings } = getValidationErrors(error);
      
      // Even if validation fails, check for refreshToken in raw config or unified storage
      // This allows users to be authenticated even if other config fields are missing
      const configPath = getConfigPath();
      const rawConfig = readConfigRaw(configPath);
      
      // Check config file token first
      let configToken = rawConfig?.pixiv?.refreshToken;
      if (isPlaceholderToken(configToken)) {
        // If config file has placeholder, check unified storage
        // We need to determine database path from config (even if invalid)
        const databasePath = rawConfig?.storage?.databasePath;
        const unifiedToken = getBestAvailableToken(configToken, databasePath);
        if (unifiedToken) {
          configToken = unifiedToken;
        }
      }
      
      const hasToken = !isPlaceholderToken(configToken);
      
      // Validate token if it exists
      let authenticated = false;
      let tokenValid = false;
      let user = null;
      
      if (hasToken && configToken) {
        const validation = await validateToken(configToken);
        tokenValid = validation.valid;
        authenticated = validation.valid;
        user = validation.user;
        
        if (tokenValid) {
          logger.debug('Token validation successful (from raw config)', { hasUser: !!user });
        }
      }
      
      const isTokenError = validationErrors.some(e => e.includes('refreshToken'));

      // Final authentication status: must have valid token to be authenticated
      // If token validation failed (tokenValid === false), user is NOT authenticated
      // Also force false if there's a token-related error in config validation
      const finalAuthenticated = (tokenValid && authenticated) && !isTokenError;

      logger.warn('Configuration invalid when checking auth status', {
        errors: validationErrors,
        warnings: validationWarnings,
        hasToken,
        authenticated: finalAuthenticated,
        tokenValid,
      });
      
      res.json({
        data: {
          authenticated: finalAuthenticated,
          hasToken,
          tokenValid,
          isAuthenticated: finalAuthenticated, // Alias for compatibility
          configReady: false, // Config is not fully ready (validation failed)
          errors: validationErrors,
          warnings: validationWarnings,
          user,
        },
      });
      return;
    }
    logger.error('Failed to get auth status', { error });
    res.status(500).json({ errorCode: ErrorCode.AUTH_STATUS_FAILED });
  }
}

