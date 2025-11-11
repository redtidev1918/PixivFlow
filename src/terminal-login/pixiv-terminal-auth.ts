/**
 * Authentication class with retry logic
 * Based on gppt/auth.py PixivAuth class
 */

import { LoginInfo, PixivLoginFailedError } from './types';
import { readClientCredentials, promptForCredentials } from './credentials';
import { refreshToken } from './token-refresh';
import { loginWithAdapter, LoginOptions } from './adapter-selector';

/**
 * Authentication class with retry logic
 * Based on PixivAuth.auth() method
 */
export class PixivTerminalAuth {
  private authJsonPath: string;

  constructor(authJsonPath: string = 'client.json') {
    this.authJsonPath = authJsonPath;
  }

  /**
   * Authenticate user with retry logic (up to 3 attempts)
   * Based on PixivAuth.auth() method
   */
  async auth(): Promise<LoginInfo> {
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      try {
        const loginInfo = await this.attemptAuth(attempt);
        return loginInfo;
      } catch (error) {
        console.error(`[!]: Login attempt ${attempt + 1} failed: ${error}`);
        attempt++;
      }
    }

    throw new PixivLoginFailedError(
      `Login failed after ${maxAttempts} attempts. Please check your credentials.`
    );
  }

  /**
   * Attempt authentication
   * Based on PixivAuth.__auth() method
   */
  private async attemptAuth(attempt: number): Promise<LoginInfo> {
    // Try to read saved credentials
    const savedCreds = await readClientCredentials(this.authJsonPath);

    if (savedCreds && attempt === 0) {
      // Use saved credentials on first attempt
      console.log('[+]: Using saved credentials...');
      const refreshTokenValue = await this.getRefreshToken(
        savedCreds.pixiv_id,
        savedCreds.password
      );
      const loginInfo = await refreshToken(refreshTokenValue);
      return loginInfo;
    } else {
      // Prompt for credentials
      const credentials = await promptForCredentials();
      console.log('[+]: Logging in...');
      const refreshTokenValue = await this.getRefreshToken(
        credentials.pixiv_id,
        credentials.password
      );
      const loginInfo = await refreshToken(refreshTokenValue);
      console.log('[+]: Login successful!');
      return loginInfo;
    }
  }

  /**
   * Get refresh token using credentials
   * Based on PixivAuth.get_refresh_token() static method
   */
  private async getRefreshToken(pixivId: string, password: string): Promise<string> {
    const options: LoginOptions = {
      headless: true,
      username: pixivId,
      password: password,
    };

    const result = await loginWithAdapter(options);
    return result.refresh_token;
  }
}














