/**
 * Terminal Login Module for PixivFlow
 * 
 * This module provides terminal-based authentication for Pixiv using Python gppt.
 * It supports both interactive and headless login modes.
 * 
 * Based on get-pixivpy-token (gppt) implementation:
 * https://github.com/eggplants/get-pixivpy-token
 * 
 * The module tries Puppeteer first (Node.js native, no external dependencies),
 * then falls back to Python gppt if Puppeteer fails or is unavailable.
 */

import * as readline from 'readline';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  checkPythonGpptAvailable,
  installGppt,
  loginWithGpptInteractive,
  loginWithGpptHeadless,
  ProxyConfig as PythonProxyConfig,
} from './python-login-adapter';
import {
  checkPuppeteerAvailable,
  loginWithPuppeteerInteractive,
  loginWithPuppeteerHeadless,
  ProxyConfig as PuppeteerProxyConfig,
} from './puppeteer-login-adapter';

// Use Puppeteer proxy config as the main type (they're compatible)
export type ProxyConfig = PuppeteerProxyConfig;

// Constants from gppt/consts.py
// These match the constants used in get-pixivpy-token (gppt)
// Reference: https://github.com/eggplants/get-pixivpy-token
const USER_AGENT = 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)';
const AUTH_TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token';
const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT';
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj';

const TIMEOUT = 10000; // 10 seconds

/**
 * Login credentials interface
 */
interface LoginCredentials {
  pixiv_id: string;
  password: string;
}

/**
 * Profile image URLs interface
 */
interface ProfileImageURLs {
  px_16x16: string;
  px_50x50: string;
  px_170x170: string;
}

/**
 * User information interface
 */
interface UserInfo {
  profile_image_urls: ProfileImageURLs;
  id: string;
  name: string;
  account: string;
  mail_address: string;
  is_premium: boolean;
  x_restrict: number;
  is_mail_authorized: boolean;
  require_policy_agreement: boolean;
}

/**
 * OAuth API response interface
 */
interface OAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token: string;
  user: UserInfo;
}

/**
 * Login information interface
 */
export interface LoginInfo extends OAuthResponse {
  response?: OAuthResponse;
}

/**
 * Custom error for Pixiv login failures
 */
export class PixivLoginFailedError extends Error {
  constructor(message: string = 'Pixiv login failed') {
    super(message);
    this.name = 'PixivLoginFailedError';
  }
}


/**
 * Main class for terminal-based Pixiv authentication
 * Uses Python gppt for login
 */
export class TerminalLogin {
  private headless: boolean;
  private username?: string;
  private password?: string;
  private proxy?: ProxyConfig;

  constructor(options: {
    headless?: boolean;
    username?: string;
    password?: string;
    proxy?: ProxyConfig;
  } = {}) {
    this.headless = options.headless ?? false;
    this.username = options.username;
    this.password = options.password;
    this.proxy = options.proxy;
  }

  /**
   * Login to Pixiv and obtain OAuth token
   * 
   * Tries Puppeteer first (Node.js native, no external dependencies),
   * falls back to Python gppt if Puppeteer fails or is unavailable.
   */
  async login(options: {
    headless?: boolean;
    username?: string;
    password?: string;
    proxy?: ProxyConfig;
    forcePython?: boolean; // Force use of Python gppt instead of Puppeteer
  } = {}): Promise<LoginInfo> {
    // Override instance options with method parameters
    if (options.headless !== undefined) {
      this.headless = options.headless;
    }
    if (options.username !== undefined) {
      this.username = options.username;
    }
    if (options.password !== undefined) {
      this.password = options.password;
    }
    if (options.proxy !== undefined) {
      this.proxy = options.proxy;
    }

    // Try Puppeteer first (unless forcePython is set)
    if (!options.forcePython) {
      const puppeteerAvailable = await checkPuppeteerAvailable();
      
      if (puppeteerAvailable) {
        console.log('[i]: Using Puppeteer (Node.js native) for login - no Python required!');
        
        try {
          let result: LoginInfo | null = null;
          
          if (this.headless && this.username && this.password) {
            result = await loginWithPuppeteerHeadless(this.username, this.password, this.proxy);
          } else {
            result = await loginWithPuppeteerInteractive(this.proxy);
          }
          
          if (result) {
            console.log('[+]: Login successful with Puppeteer!');
            return result;
          }
        } catch (error) {
          console.error('[!]: Puppeteer login failed:', error);
          console.log('[i]: Falling back to Python gppt...');
        }
      } else {
        console.log('[i]: Puppeteer not available, will try Python gppt...');
      }
    }
    
    // Fall back to Python gppt
    console.log('[i]: Attempting login with Python gppt...');
    const isAvailable = await checkPythonGpptAvailable();
    
    if (!isAvailable) {
      console.error('[!]: Python gppt is not installed. Attempting to install...');
      const installed = await installGppt();
      if (!installed) {
        throw new Error(
          'Failed to install Python gppt. Please install manually: pip3 install gppt\n' +
          'Or ensure Puppeteer is available (should be installed by default).'
        );
      }
    }
    
    // Use gppt for login
    let pythonResult: LoginInfo | null = null;
    
    if (this.headless && this.username && this.password) {
      try {
        pythonResult = await loginWithGpptHeadless(this.username, this.password, this.proxy);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[!]: Headless login failed:', errorMsg);
        console.log('\n[i]: 提示：无头模式登录失败。可能的解决方案：');
        console.log('[i]: 1. 检查网络连接和代理设置');
        console.log('[i]: 2. 尝试使用交互模式（不使用 --headless 参数）');
        console.log('[i]: 3. 确认登录凭据是否正确');
        console.log('[i]: 4. 等待一段时间后重试（可能被 Pixiv 限制）');
        throw error;
      }
    } else {
      pythonResult = await loginWithGpptInteractive(this.proxy);
    }
    
    if (pythonResult) {
      console.log('[+]: Login successful with Python gppt!');
      return pythonResult;
    } else {
      const errorMsg = this.headless && this.username && this.password
        ? 'Headless login failed. Try interactive mode (remove --headless flag) or check your credentials/proxy settings.'
        : 'Interactive login failed. Please check your network connection and try again.';
      throw new Error(errorMsg);
    }
  }

  /**
   * Refresh OAuth token using refresh token
   * 
   * Based on gppt's refresh token implementation.
   * This matches the token refresh flow used by get-pixivpy-token.
   * 
   * Reference: https://github.com/eggplants/get-pixivpy-token
   */
  static async refresh(refreshToken: string): Promise<LoginInfo> {
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

}

/**
 * Authentication class with retry logic
 * Based on gppt/auth.py PixivAuth class
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
    const savedCreds = await this.readClientCred();

    if (savedCreds && attempt === 0) {
      // Use saved credentials on first attempt
      console.log('[+]: Using saved credentials...');
      const refreshToken = await this.getRefreshToken(
        savedCreds.pixiv_id,
        savedCreds.password
      );
      const loginInfo = await TerminalLogin.refresh(refreshToken);
      return loginInfo;
    } else {
      // Prompt for credentials
      const credentials = await this.promptForCredentials();
      console.log('[+]: Logging in...');
      const refreshToken = await this.getRefreshToken(
        credentials.pixiv_id,
        credentials.password
      );
      const loginInfo = await TerminalLogin.refresh(refreshToken);
      console.log('[+]: Login successful!');
      return loginInfo;
    }
  }

  /**
   * Get refresh token using credentials
   * Based on PixivAuth.get_refresh_token() static method
   */
  private async getRefreshToken(pixivId: string, password: string): Promise<string> {
    const login = new TerminalLogin({
      headless: true,
      username: pixivId,
      password: password,
    });

    const result = await login.login();
    return result.refresh_token;
  }

  /**
   * Read saved credentials from JSON file
   * Based on PixivAuth.read_client_cred() method
   */
  private async readClientCred(): Promise<LoginCredentials | null> {
    try {
      const filePath = path.resolve(this.authJsonPath);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const credentials = JSON.parse(fileContent) as LoginCredentials;

      // Validate credentials structure
      if (credentials.pixiv_id && credentials.password) {
        return credentials;
      }
      return null;
    } catch (error) {
      // File doesn't exist or is invalid
      return null;
    }
  }

  /**
   * Prompt user for credentials interactively
   * Based on the interactive prompt in PixivAuth.__auth()
   */
  private async promptForCredentials(): Promise<LoginCredentials> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      console.log('[+]: ID can be email address, username, or account name.');
      
      rl.question('[?]: Pixiv ID: ', async (pixivId) => {
        // Close readline first to release stdin
        rl.close();
        
        // Wait a bit to ensure readline is fully closed
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Now use secure password input
        const password = await this.promptPassword('[?]: Password: ');
        resolve({ pixiv_id: pixivId.trim(), password: password.trim() });
      });
    });
  }

  /**
   * Prompt for password with hidden input
   * Uses raw mode to hide password characters
   */
  private async promptPassword(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      process.stdout.write(prompt);
      
      let password = '';
      let wasRawMode = false;
      
      // Save current stdin settings
      if (process.stdin.isTTY) {
        wasRawMode = (process.stdin as any).isRaw || false;
        process.stdin.setRawMode(true);
      }
      
      process.stdin.resume();
      // Don't set encoding in raw mode - handle buffers directly
      // When encoding is not set, stdin emits Buffer objects
      
      const onData = (data: Buffer) => {
        // Convert buffer to string for processing
        const input = data.toString('utf8');
        
        // Process each character
        for (let i = 0; i < input.length; i++) {
          const char = input[i];
          const code = char.charCodeAt(0);
          
          // Enter key (13 = \r, 10 = \n)
          if (code === 13 || code === 10) {
            process.stdin.removeListener('data', onData);
            process.stdin.pause();
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(wasRawMode);
            }
            process.stdout.write('\n');
            resolve(password);
            return;
          }
          
          // Backspace (127) or Delete (8)
          if (code === 127 || code === 8) {
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b'); // Move cursor back, overwrite with space, move back again
            }
            continue;
          }
          
          // Ctrl+C (3)
          if (code === 3) {
            process.stdin.removeListener('data', onData);
            process.stdin.pause();
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(wasRawMode);
            }
            process.stdout.write('\n');
            process.exit(130); // Exit with SIGINT code
            return;
          }
          
          // Ctrl+D (4) - EOF
          if (code === 4) {
            process.stdin.removeListener('data', onData);
            process.stdin.pause();
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(wasRawMode);
            }
            process.stdout.write('\n');
            resolve(password);
            return;
          }
          
          // Ignore other control characters (0-31 except those handled above)
          if (code < 32) {
            continue;
          }
          
          // Add character to password (but don't display it)
          password += char;
          process.stdout.write('*'); // Show asterisk instead of actual character
        }
      };
      
      process.stdin.on('data', onData);
    });
  }
}

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

