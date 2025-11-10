/**
 * Token Revocation Utilities
 * 
 * Note: Pixiv API does not provide a standard token revocation endpoint.
 * The most reliable way to invalidate tokens is to change the Pixiv password.
 */

import { logger } from '../logger';
import { PixivCredentialConfig, NetworkConfig } from '../config';

/**
 * Attempt to revoke token on Pixiv server
 * 
 * WARNING: Pixiv API may not support token revocation.
 * This function attempts to call a potential revocation endpoint,
 * but the most reliable method is to change the password.
 * 
 * @param refreshToken - The refresh token to revoke
 * @param credentials - Pixiv credentials
 * @param network - Network configuration
 * @returns true if revocation appears successful, false otherwise
 */
export async function attemptTokenRevocation(
  refreshToken: string,
  credentials: PixivCredentialConfig,
  network: NetworkConfig
): Promise<boolean> {
  // Pixiv API does not have a documented token revocation endpoint
  // We'll try a few potential endpoints, but they likely won't work
  
  const potentialEndpoints = [
    'https://oauth.secure.pixiv.net/auth/revoke',
    'https://oauth.secure.pixiv.net/auth/token/revoke',
    'https://app-api.pixiv.net/v1/auth/logout',
  ];

  for (const endpoint of potentialEndpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), network.timeoutMs ?? 30000);

      const body = new URLSearchParams({
        client_id: credentials.clientId ?? 'MOBrBDS8blbauoSck0ZfDbtuzpyT',
        client_secret: credentials.clientSecret ?? 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj',
        token: refreshToken,
        token_type_hint: 'refresh_token',
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': credentials.userAgent ?? 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)',
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        body: body.toString(),
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // If we get a 200 or 204, assume success (even if endpoint doesn't exist, we tried)
      if (response.status === 200 || response.status === 204) {
        logger.info('Token revocation attempt completed', { endpoint, status: response.status });
        return true;
      }

      // 404 means endpoint doesn't exist (expected)
      if (response.status === 404) {
        logger.debug('Token revocation endpoint not found', { endpoint });
        continue;
      }

      // Other status codes might indicate the endpoint exists but failed
      logger.warn('Token revocation attempt returned unexpected status', {
        endpoint,
        status: response.status,
      });
    } catch (error) {
      // Network errors or timeouts are expected if endpoint doesn't exist
      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug('Token revocation request timed out', { endpoint });
      } else {
        logger.debug('Token revocation request failed', {
          endpoint,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }
  }

  // None of the endpoints worked (expected)
  logger.warn(
    'Token revocation endpoints not available. To truly invalidate tokens, change your Pixiv password at https://www.pixiv.net/setting_user.php'
  );
  return false;
}

/**
 * Get instructions for invalidating tokens on Pixiv server
 */
export function getTokenInvalidationInstructions(): {
  method: string;
  description: string;
  url: string;
  steps: string[];
} {
  return {
    method: 'Change Pixiv Password',
    description:
      'Changing your Pixiv password is the most reliable way to invalidate all existing tokens on the server side.',
    url: 'https://www.pixiv.net/setting_user.php',
    steps: [
      'Visit https://www.pixiv.net/setting_user.php',
      'Log in to your Pixiv account',
      'Navigate to the "Password" or "パスワード" section',
      'Enter your current password and a new password',
      'Save the changes',
      'All existing tokens will be immediately invalidated',
      'You will need to log in again with the new password to get new tokens',
    ],
  };
}

