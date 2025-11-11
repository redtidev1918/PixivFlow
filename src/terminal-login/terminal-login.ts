/**
 * Terminal Login class
 * Main class for terminal-based Pixiv authentication
 */

import { LoginInfo, PixivLoginFailedError } from './types';
import { loginWithAdapter, LoginOptions, ProxyConfig } from './adapter-selector';
import { refreshToken } from './token-refresh';

/**
 * Main class for terminal-based Pixiv authentication
 * Uses multiple adapters (pixiv-token-getter, Puppeteer, Python gppt) for login
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
   * Tries methods in this order:
   * 1. pixiv-token-getter (specialized library, recommended)
   * 2. Puppeteer (Node.js native, no external dependencies)
   * 3. Python gppt (fallback)
   */
  async login(options: LoginOptions = {}): Promise<LoginInfo> {
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

    // Build login options
    const loginOptions: LoginOptions = {
      headless: this.headless,
      username: this.username,
      password: this.password,
      proxy: this.proxy,
      ...options, // Allow overriding with method parameters
    };

    // Use adapter selector to login
    return await loginWithAdapter(loginOptions);
  }

  /**
   * Refresh OAuth token using refresh token (static method for backward compatibility)
   * 
   * Based on gppt's refresh token implementation.
   * This matches the token refresh flow used by get-pixivpy-token.
   * 
   * Reference: https://github.com/eggplants/get-pixivpy-token
   */
  static async refresh(refreshTokenValue: string): Promise<LoginInfo> {
    return refreshToken(refreshTokenValue);
  }
}

