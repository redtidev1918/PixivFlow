import { Router, Request, Response } from 'express';
import { TerminalLogin } from '../../terminal-login';
import { loadConfig, getConfigPath, ConfigValidationError } from '../../config';
import { updateConfigWithToken } from '../../utils/login-helper';
import { logger } from '../../logger';
import { ErrorCode } from '../utils/error-codes';
import { ConfigError } from '../../utils/errors';

const router = Router();

/**
 * GET /api/auth/status
 * Get authentication status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    const hasToken = !!config.pixiv?.refreshToken;
    const authenticated = hasToken;

    logger.debug('Auth status check', { authenticated, hasToken, configPath });

    res.json({
      authenticated,
      hasToken,
      isAuthenticated: authenticated, // Alias for compatibility
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
      logger.warn('Configuration invalid when checking auth status', {
        errors: validationErrors,
        warnings: validationWarnings,
      });
      return res.json({
        authenticated: false,
        hasToken: false,
        isAuthenticated: false,
        configReady: false,
        errors: validationErrors,
        warnings: validationWarnings,
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

    if (!refreshToken) {
      // Try to get from config
      const configPath = getConfigPath();
      const config = loadConfig(configPath);
      const token = config.pixiv?.refreshToken;

      if (!token) {
        return res.status(400).json({
          errorCode: ErrorCode.AUTH_REFRESH_TOKEN_REQUIRED,
        });
      }

      const loginInfo = await TerminalLogin.refresh(token);
      res.json({
        success: true,
        errorCode: ErrorCode.AUTH_REFRESH_SUCCESS,
        accessToken: loginInfo.access_token,
        refreshToken: loginInfo.refresh_token,
        expiresIn: loginInfo.expires_in,
      });
    } else {
      const loginInfo = await TerminalLogin.refresh(refreshToken);
      res.json({
        success: true,
        errorCode: ErrorCode.AUTH_REFRESH_SUCCESS,
        accessToken: loginInfo.access_token,
        refreshToken: loginInfo.refresh_token,
        expiresIn: loginInfo.expires_in,
      });
    }
  } catch (error) {
    logger.error('Token refresh failed', { error });
    res.status(401).json({
      errorCode: ErrorCode.AUTH_REFRESH_FAILED,
      message: error instanceof Error ? error.message : String(error),
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
    // In a real implementation, you might want to invalidate the token
    // For now, we just return success
    res.json({ success: true, errorCode: ErrorCode.AUTH_LOGOUT_SUCCESS });
  } catch (error) {
    logger.error('Logout failed', { error });
    res.status(500).json({ errorCode: ErrorCode.AUTH_LOGOUT_FAILED });
  }
});

export default router;

