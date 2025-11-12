/**
 * Output formatting
 * Handles formatting and printing login results
 */

import { LoginInfo } from './types';

/**
 * Print authentication token response
 * Based on __print_auth_token_response() function in gppt/main.py
 */
export function printAuthTokenResponse(
  loginInfo: LoginInfo,
  outputJson: boolean = false
): void {
  try {
    const { access_token, refresh_token, expires_in } = loginInfo;

    if (outputJson) {
      console.log(
        JSON.stringify(
          {
            access_token,
            refresh_token,
            expires_in,
          },
          null,
          2
        )
      );
    } else {
      console.log('access_token:', access_token);
      console.log('refresh_token:', refresh_token);
      console.log('expires_in:', expires_in);
    }
  } catch (error) {
    console.error('Error printing auth response:', error);
    process.exit(1);
  }
}

























