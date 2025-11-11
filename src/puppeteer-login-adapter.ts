/**
 * Puppeteer-based Pixiv Login Adapter
 * 
 * This module provides login functionality using Puppeteer (Node.js native).
 * It completely replaces the Python gppt dependency, eliminating the need
 * for users to install Python or any external dependencies.
 * 
 * Benefits:
 * - No Python dependency required
 * - Smaller application bundle size
 * - Better integration with Node.js/Electron
 * - Easier to maintain and debug
 * 
 * Based on the gppt (get-pixivpy-token) implementation:
 * https://github.com/eggplants/get-pixivpy-token
 * 
 * The implementation follows the same OAuth 2.0 PKCE flow as gppt:
 * 1. Generate code_verifier and code_challenge
 * 2. Navigate to Pixiv login page with PKCE parameters
 * 3. Wait for user to complete login (interactive) or auto-fill credentials (headless)
 * 4. Extract authorization code from redirect URL
 * 5. Exchange authorization code for access_token and refresh_token
 */

import { LoginInfo } from './terminal-login';
import { ProxyConfig } from './puppeteer-login-adapter/proxy';
import { loginWithPuppeteerInteractive } from './puppeteer-login-adapter/login-interactive';
import { loginWithPuppeteerHeadless } from './puppeteer-login-adapter/login-headless';
import { checkPuppeteerAvailable } from './puppeteer-login-adapter/environment';

// Re-export for backward compatibility
export { ProxyConfig } from './puppeteer-login-adapter/proxy';
export { loginWithPuppeteerInteractive, loginWithPuppeteerHeadless, checkPuppeteerAvailable };
