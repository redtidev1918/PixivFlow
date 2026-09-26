import { Router } from 'express';
import * as authHandlers from './handlers/auth-handlers';

const router = Router();

/**
 * GET /api/auth/status
 * Get authentication status
 */
router.get('/status', authHandlers.getAuthStatus);

/**
 * POST /api/auth/login
 * Login to Pixiv
 */
router.post('/login', authHandlers.login);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', authHandlers.refreshToken);

/**
 * POST /api/auth/login/host/start
 * Start an interactive login the caller completes in a window it owns
 * (PixivFlow Desktop opens it in an app window; no system browser involved)
 */
router.post('/login/host/start', authHandlers.hostLoginStart);

/**
 * POST /api/auth/login/host/complete
 * Exchange the authorization code captured from the host window
 */
router.post('/login/host/complete', authHandlers.hostLoginComplete);

/**
 * POST /api/auth/login-with-token
 * Login with refresh token directly
 */
router.post('/login-with-token', authHandlers.loginWithToken);

/**
 * POST /api/auth/logout
 * Logout (clear token)
 */
router.post('/logout', authHandlers.logout);

export default router;
