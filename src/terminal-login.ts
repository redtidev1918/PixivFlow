/**
 * Terminal Login Module for PixivFlow
 * 
 * This module provides terminal-based authentication for Pixiv.
 * It supports both interactive and headless login modes.
 * 
 * Login methods (in order of preference):
 * 1. pixiv-token-getter - Specialized library (recommended)
 * 2. Puppeteer - Node.js native, no external dependencies
 * 3. Python gppt - Fallback option
 * 
 * Based on get-pixivpy-token (gppt) implementation:
 * https://github.com/eggplants/get-pixivpy-token
 */

// Re-export types
export type {
  LoginInfo,
  LoginCredentials,
  UserInfo,
  OAuthResponse,
  ProfileImageURLs,
} from './terminal-login/types';
export { PixivLoginFailedError } from './terminal-login/types';

// Re-export ProxyConfig
export type { ProxyConfig } from './terminal-login/adapter-selector';

// Re-export main classes and functions
export { TerminalLogin } from './terminal-login/terminal-login';
export { PixivTerminalAuth } from './terminal-login/pixiv-terminal-auth';
export { printAuthTokenResponse } from './terminal-login/output';
export { refreshToken } from './terminal-login/token-refresh';
