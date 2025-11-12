/**
 * Token refresh functionality
 * Handles refreshing OAuth tokens using refresh tokens
 */

import axios from 'axios';
import { AUTH_TOKEN_URL, CLIENT_ID, CLIENT_SECRET, USER_AGENT, TIMEOUT } from './constants';
import { LoginInfo, OAuthResponse, PixivLoginFailedError } from './types';

/**
 * Refresh OAuth token using refresh token
 * 
 * Based on gppt's refresh token implementation.
 * This matches the token refresh flow used by get-pixivpy-token.
 * 
 * Reference: https://github.com/eggplants/get-pixivpy-token
 */
export async function refreshToken(refreshToken: string): Promise<LoginInfo> {
  try {
    const response = await axios.post<OAuthResponse>(
      AUTH_TOKEN_URL,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        include_policy: 'true',
        refresh_token: refreshToken,
      }).toString(),
      {
        headers: {
          'user-agent': USER_AGENT,
          'app-os-version': '14.6',
          'app-os': 'ios',
          'content-type': 'application/x-www-form-urlencoded',
        },
        timeout: TIMEOUT,
      }
    );

    // Convert OAuthResponse to LoginInfo
    return {
      ...response.data,
      response: response.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new PixivLoginFailedError(`Failed to refresh token: ${errorMessage}`);
  }
}















































