import { Router, Request, Response } from 'express';
import { TerminalLogin } from '../../terminal-login';
import { loadConfig, getConfigPath, ConfigValidationError } from '../../config';
import { updateConfigWithToken } from '../../utils/login-helper';
import { logger } from '../../logger';
import { ErrorCode } from '../utils/error-codes';
import { ConfigError } from '../../utils/errors';
import { checkPythonGpptAvailable } from '../../python-login-adapter';
import { checkPuppeteerAvailable } from '../../puppeteer-login-adapter';

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

    res.json({
      authenticated: hasToken,
      hasToken,
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
 * GET /api/auth/diagnose
 * Diagnose login dependencies (Puppeteer, Python, gppt, etc.)
 */
router.get('/diagnose', async (req: Request, res: Response) => {
  try {
    logger.info('Running login diagnostics...');
    
    // Check Puppeteer (Node.js native - preferred method)
    const puppeteerAvailable = await checkPuppeteerAvailable();
    
    // Check Python gppt (fallback method)
    const pythonGpptAvailable = await checkPythonGpptAvailable();
    
    const diagnostics = {
      puppeteer: {
        available: puppeteerAvailable,
        recommended: true,
        description: 'Node.js native browser automation (no external dependencies)',
      },
      pythonGppt: {
        available: pythonGpptAvailable,
        recommended: false,
        description: 'Python-based login (requires Python 3.9+ and gppt package)',
      },
      recommendation: puppeteerAvailable 
        ? 'Puppeteer is available and will be used (no Python needed!)' 
        : pythonGpptAvailable
        ? 'Python gppt is available and will be used as fallback'
        : 'No login method available. Puppeteer should be installed by default.',
    };
    
    logger.info('Diagnostics result:', { diagnostics });
    
    res.json({
      success: true,
      diagnostics,
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        isElectron: !!process.versions.electron,
        electronVersion: process.versions.electron,
        execPath: process.execPath,
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH,
          NODE_PATH: process.env.NODE_PATH,
          HOME: process.env.HOME,
          USER: process.env.USER,
        },
      },
    });
  } catch (error) {
    logger.error('Diagnostics failed', { error });
    res.status(500).json({
      success: false,
      errorCode: ErrorCode.AUTH_LOGIN_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
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

    const login = new TerminalLogin({
      headless: headless as boolean,
      username: username || undefined,
      password: password || undefined,
      proxy: proxyConfig,
    });

    const loginInfo = await login.login({
      headless: headless as boolean,
      username: username || undefined,
      password: password || undefined,
      proxy: proxyConfig,
    });

    // Update config with refresh token
    const configPath = getConfigPath();
    try {
      await updateConfigWithToken(configPath, loginInfo.refresh_token);
    } catch (error) {
      logger.warn('Login successful but config update failed', { error });
    }

    res.json({
      success: true,
      errorCode: ErrorCode.AUTH_LOGIN_SUCCESS,
      accessToken: loginInfo.access_token,
      refreshToken: loginInfo.refresh_token,
      expiresIn: loginInfo.expires_in,
      user: loginInfo.user,
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

