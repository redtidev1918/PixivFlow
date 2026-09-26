/**
 * Host-driven interactive login — HTTP handlers
 *
 * POST /api/auth/login/host/start    → mint a PKCE session + the authorize URL
 * POST /api/auth/login/host/complete → exchange the authorization code
 *
 * The host (PixivFlow Desktop, or any webview host) shows the authorize page in
 * its own window and captures the callback URL; the browser copy of the UI can
 * also let the user paste that URL back. Neither of them ever sees the PKCE
 * code verifier — the backend keeps it for the duration of the session.
 */

import { Request, Response } from 'express';
import { getConfigPath } from '../../../../config';
import { logger } from '../../../../logger';
import { exchangeCodeForToken } from '../../../../puppeteer-login-adapter/token-exchange';
import { updateConfigWithToken } from '../../../../utils/login-helper';
import { ErrorCode } from '../../../utils/error-codes';
import {
  consumeHostLoginSession,
  createHostLoginSession,
  extractAuthCode,
} from './host-login-session';

/**
 * POST /api/auth/login/host/start
 * Start an interactive login the caller completes in a window it owns.
 * No credentials are involved: the user authenticates against Pixiv itself.
 */
export async function hostLoginStart(_req: Request, res: Response): Promise<void> {
  try {
    const start = await createHostLoginSession();
    logger.info('Host login session created');
    res.json({ success: true, data: start });
  } catch (error) {
    logger.error('Failed to start host login', { error });
    res.status(500).json({
      errorCode: ErrorCode.AUTH_LOGIN_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * POST /api/auth/login/host/complete
 * Body: { loginId, code } or { loginId, callbackUrl }
 * Exchanges the authorization code for tokens and persists the refresh token.
 */
export async function hostLoginComplete(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as { loginId?: unknown; code?: unknown; callbackUrl?: unknown };
  const authCode = extractAuthCode(body.code ?? body.callbackUrl);

  // Validate the submission before burning the session: a malformed request
  // must not cost the user their pending login window.
  if (!authCode) {
    res.status(400).json({
      errorCode: ErrorCode.AUTH_CODE_REQUIRED,
      message: 'Authorization code is required (pass `code` or the full `callbackUrl`)',
    });
    return;
  }

  const codeVerifier = consumeHostLoginSession(body.loginId);
  if (!codeVerifier) {
    res.status(400).json({
      errorCode: ErrorCode.AUTH_HOST_LOGIN_SESSION_INVALID,
      message: 'Login session is unknown, expired or already used',
    });
    return;
  }

  let loginInfo;
  try {
    loginInfo = await exchangeCodeForToken(authCode, codeVerifier);
  } catch (error) {
    logger.error('Host login token exchange failed', { error });
    res.status(401).json({
      errorCode: ErrorCode.AUTH_LOGIN_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (!loginInfo?.refresh_token) {
    logger.error('Host login token exchange returned no refresh token');
    res.status(401).json({
      errorCode: ErrorCode.AUTH_LOGIN_FAILED,
      message: 'Token exchange returned no refresh token',
    });
    return;
  }

  try {
    await updateConfigWithToken(getConfigPath(), loginInfo.refresh_token);
    logger.info('Host login successful, config updated with refresh token');
  } catch (error) {
    // Mirror POST /api/auth/login: the token is valid even if persisting failed.
    logger.error('Host login succeeded but config update failed', { error });
  }

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
}
