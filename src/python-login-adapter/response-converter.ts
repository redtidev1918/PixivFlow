/**
 * Response Converter
 * 
 * Converts gppt response to LoginInfo format
 */

import { LoginInfo } from '../terminal-login';

/**
 * Convert gppt response to LoginInfo format
 * 
 * According to gppt API, the response structure is:
 * {
 *   "access_token": "...",
 *   "expires_in": 3600,
 *   "refresh_token": "...",
 *   "scope": "",
 *   "token_type": "bearer",
 *   "user": { ... }
 * }
 * 
 * Reference: https://github.com/eggplants/get-pixivpy-token
 */
export function convertGpptResponseToLoginInfo(response: any): LoginInfo {
  // Handle both direct response and response.response format
  const data = response.response || response;
  
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    token_type: data.token_type || 'bearer',
    scope: data.scope || '',
    refresh_token: data.refresh_token,
    user: data.user,
    response: data, // Store the full response for reference
  };
}





















