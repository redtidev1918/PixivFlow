import { Router, Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { TerminalLogin } from '../../terminal-login';
import { loadConfig, getConfigPath, ConfigValidationError, StandaloneConfig } from '../../config';
import { updateConfigWithToken, clearConfigToken } from '../../utils/login-helper';
import { logger } from '../../logger';
import { ErrorCode } from '../utils/error-codes';
import { ConfigError } from '../../utils/errors';
import { getBestAvailableToken, isPlaceholderToken } from '../../utils/token-manager';

const router = Router();

/**
 * Read config file without validation (for checking refreshToken even if validation fails)
 */
function readConfigRaw(configPath: string): Partial<StandaloneConfig> | null {
  try {
    if (!existsSync(configPath)) {
      return null;
    }
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as Partial<StandaloneConfig>;
  } catch (error) {
    logger.warn('Failed to read raw config file', {
      error: error instanceof Error ? error.message : String(error),
      configPath,
    });
    return null;
  }
}

/**
 * GET /api/auth/status
 * Get authentication status
 * Validates token to ensure it's still valid, not just checking if it exists
 */
router.get('/status', async (req: Request, res: Response) => {
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
      try {
        // Try to refresh the token to validate it
        const loginInfo = await TerminalLogin.refresh(refreshToken);
        tokenValid = true;
        authenticated = true;
        user = loginInfo.user;
        logger.debug('Token validation successful', { hasUser: !!user });
      } catch (error) {
        // Token is invalid or expired
        tokenValid = false;
        authenticated = false;
        logger.warn('Token validation failed', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
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
      const validationErrors =
        error.cause instanceof ConfigValidationError
          ? error.cause.errors
          : [error.message];
      const validationWarnings =
        error.cause instanceof ConfigValidationError
          ? error.cause.warnings
          : [];
      
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
        try {
          // Try to refresh the token to validate it
          const loginInfo = await TerminalLogin.refresh(configToken);
          tokenValid = true;
          authenticated = true;
          user = loginInfo.user;
          logger.debug('Token validation successful (from raw config)', { hasUser: !!user });
        } catch (error) {
          // Token is invalid or expired
          tokenValid = false;
          authenticated = false;
          logger.warn('Token validation failed (from raw config)', { 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
      
      logger.warn('Configuration invalid when checking auth status', {
        errors: validationErrors,
        warnings: validationWarnings,
        hasToken,
        authenticated,
        tokenValid,
      });
      
      return res.json({
        data: {
          authenticated,
          hasToken,
          tokenValid,
          isAuthenticated: authenticated, // Alias for compatibility
          configReady: false, // Config is not fully ready (validation failed)
          errors: validationErrors,
          warnings: validationWarnings,
          user,
        },
      });
    }
    logger.error('Failed to get auth status', { error });
    res.status(500).json({ errorCode: ErrorCode.AUTH_STATUS_FAILED });
  }
});

/**
 * POST /api/auth/login
 * Login to Pixiv
 * 
 * Supports two modes:
 * - headless=true: Requires username and password, runs browser in background
 * - headless=false: Interactive mode, opens browser window for manual login (no username/password needed)
 * 
 * Supports proxy configuration:
 * - If proxy is provided in request body, use it
 * - Otherwise, read from config file
 * - Proxy format: { enabled: boolean, host: string, port: number, protocol: string, username?: string, password?: string }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password, headless = true, proxy } = req.body;

    // For headless mode, username and password are required
    // For interactive mode (headless=false), username and password are optional
    if (headless && (!username || !password)) {
      return res.status(400).json({
        errorCode: ErrorCode.AUTH_USERNAME_PASSWORD_REQUIRED,
      });
    }

    // Get proxy configuration: use provided proxy or read from config
    let proxyConfig = proxy;
    if (!proxyConfig) {
      const configPath = getConfigPath();
      try {
        const config = loadConfig(configPath);
        if (config.network?.proxy?.enabled) {
          proxyConfig = config.network.proxy;
        }
      } catch (error) {
        // Config might be invalid (e.g., missing refreshToken on first login)
        // This is OK - we'll just proceed without proxy config
        logger.debug('Could not load config for proxy settings, proceeding without proxy', { error });
      }
    }

    logger.info('Starting login process', { headless, hasUsername: !!username });
    
    // Check if we're in Electron environment
    let isElectron = false;
    if (typeof process !== 'undefined') {
      if (process.versions?.electron !== undefined) {
        isElectron = true;
      } else {
        // Check for Electron-specific process.type (cast to any to avoid TypeScript error)
        const proc = process as any;
        if (proc.type === 'renderer' || proc.type === 'browser') {
          isElectron = true;
        }
      }
    }
    
    // In Electron environment, if it's interactive login (headless=false), 
    // we should recommend using Electron's login window instead
    if (isElectron && !headless) {
      logger.warn('Interactive login requested in Electron environment - Puppeteer may not work');
      logger.warn('Recommendation: Use Electron\'s built-in login window from the frontend');
    }
    
    const login = new TerminalLogin({
      headless: headless as boolean,
      username: username || undefined,
      password: password || undefined,
      proxy: proxyConfig,
    });

    let loginInfo;
    try {
      loginInfo = await login.login({
        headless: headless as boolean,
        username: username || undefined,
        password: password || undefined,
        proxy: proxyConfig,
      });

      if (!loginInfo) {
        throw new Error('Login returned null - login may have been cancelled or failed');
      }
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      
      // Check if it's an Electron-related Puppeteer error
      if (isElectron && errorMsg.includes('Electron environment')) {
        logger.error('Puppeteer login failed in Electron environment', { error: errorMsg });
        return res.status(400).json({
          errorCode: ErrorCode.AUTH_LOGIN_FAILED,
          message: 'Puppeteer cannot launch browser in Electron environment. Please use Electron\'s built-in login window instead. ' +
                   'If you are using the Electron app, the login window should open automatically from the frontend.',
          electronLoginRecommended: true, // Flag to indicate Electron login should be used
        });
      }
      
      // Re-throw other errors to be handled by the outer catch block
      throw error;
    }

    logger.info('Login successful, updating config file...');
    // Update config with refresh token
    const configPath = getConfigPath();
    try {
      await updateConfigWithToken(configPath, loginInfo.refresh_token);
      logger.info('Config file updated successfully with refresh token');
    } catch (error) {
      logger.error('Login successful but config update failed', { error });
      // Still return success, but log the error
      // The token is still valid, user can manually update config if needed
    }

    logger.info('Login API returning success response');
    res.json({
      success: true,
      errorCode: ErrorCode.AUTH_LOGIN_SUCCESS,
      data: {
        accessToken: loginInfo.access_token,
        refreshToken: loginInfo.refresh_token,
        expiresIn: loginInfo.expires_in,
        user: loginInfo.user,
      },
    });
  } catch (error) {
    logger.error('Login failed', { error });
    res.status(401).json({
      errorCode: ErrorCode.AUTH_LOGIN_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req: Request, res: Response) => {
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
          return res.status(400).json({
            errorCode: ErrorCode.AUTH_REFRESH_TOKEN_REQUIRED,
            message: 'No valid refresh token found. Please login first.',
          });
        }
      }
    }

    // Validate token is not placeholder before attempting refresh
    if (isPlaceholderToken(tokenToUse)) {
      return res.status(400).json({
        errorCode: ErrorCode.AUTH_REFRESH_TOKEN_REQUIRED,
        message: 'Refresh token is a placeholder. Please login to get a valid token.',
      });
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
});

/**
 * POST /api/auth/login-with-token
 * Login with refresh token directly
 * Validates the token and saves it to config file
 */
router.post('/login-with-token', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      return res.status(400).json({
        errorCode: ErrorCode.AUTH_REFRESH_TOKEN_REQUIRED,
        message: 'Refresh token is required',
      });
    }

    const trimmedToken = refreshToken.trim();
    logger.info('Validating refresh token...');

    // Validate token by attempting to refresh it
    let loginInfo;
    try {
      loginInfo = await TerminalLogin.refresh(trimmedToken);
      logger.info('Refresh token validated successfully');
    } catch (error) {
      logger.error('Refresh token validation failed', { error });
      return res.status(401).json({
        errorCode: ErrorCode.AUTH_REFRESH_FAILED,
        message: error instanceof Error ? error.message : 'Invalid refresh token',
      });
    }

    // Update config file with the refresh token
    const configPath = getConfigPath();
    try {
      await updateConfigWithToken(configPath, trimmedToken);
      logger.info('Config file updated successfully with refresh token');
    } catch (error) {
      logger.error('Failed to update config file with refresh token', { error });
      // Still return success if token is valid, but log the error
      // User can manually update config if needed
    }

    logger.info('Login with token successful');
    res.json({
      success: true,
      errorCode: ErrorCode.AUTH_LOGIN_SUCCESS,
      data: {
        accessToken: loginInfo.access_token,
        refreshToken: loginInfo.refresh_token,
        expiresIn: loginInfo.expires_in,
        user: loginInfo.user,
      },
    });
  } catch (error) {
    logger.error('Login with token failed', { error });
    res.status(500).json({
      errorCode: ErrorCode.AUTH_LOGIN_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (clear token)
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const configPath = getConfigPath();
    
    // Clear the refresh token from config file
    await clearConfigToken(configPath);
    
    logger.info('User logged out successfully');
    res.json({ success: true, errorCode: ErrorCode.AUTH_LOGOUT_SUCCESS });
  } catch (error) {
    logger.error('Logout failed', { error });
    res.status(500).json({ 
      errorCode: ErrorCode.AUTH_LOGOUT_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

