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
 * Based on the gppt implementation:
 * https://github.com/eggplants/get-pixivpy-token
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { LoginInfo } from './terminal-login';
import axios from 'axios';

// Pixiv OAuth constants (from gppt/consts.py)
const USER_AGENT = 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)';
const AUTH_TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token';
const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT';
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj';
const REDIRECT_URI = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback';
const LOGIN_URL = 'https://app-api.pixiv.net/web/v1/login';

/**
 * Proxy configuration interface
 */
export interface ProxyConfig {
  enabled: boolean;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks4' | 'socks5';
  username?: string;
  password?: string;
}

/**
 * Build proxy URL from proxy configuration
 */
function buildProxyUrl(proxy: ProxyConfig): string {
  const { protocol, host, port, username, password } = proxy;
  let proxyUrl = `${protocol}://`;
  if (username && password) {
    proxyUrl += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
  }
  proxyUrl += `${host}:${port}`;
  return proxyUrl;
}

/**
 * Generate code verifier and challenge for PKCE
 * Based on gppt's PKCE implementation
 */
function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < 128; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate code challenge from verifier
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  // Use Node.js crypto for SHA256
  const crypto = await import('crypto');
  const hash = crypto.createHash('sha256').update(verifier).digest();
  // Base64 URL encoding
  return hash.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Login using Puppeteer (interactive mode)
 * Opens a browser window for user to manually log in
 */
export async function loginWithPuppeteerInteractive(proxy?: ProxyConfig): Promise<LoginInfo | null> {
  let browser: Browser | null = null;
  
  try {
    console.log('[!]: Using Puppeteer for login (interactive mode)...');
    console.log('[i]: A Chrome browser window will open shortly.');
    console.log('[i]: Please complete the login process in the browser window.');
    console.log('[i]: This may take a few minutes - please be patient.');
    
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // Build login URL with PKCE parameters
    const loginParams = new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      client: 'pixiv-android',
    });
    const loginUrl = `${LOGIN_URL}?${loginParams.toString()}`;
    
    // Launch browser
    const launchOptions: any = {
      headless: false, // Interactive mode - show browser
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    };
    
    // Add proxy if configured
    if (proxy && proxy.enabled) {
      const proxyUrl = buildProxyUrl(proxy);
      launchOptions.args.push(`--proxy-server=${proxyUrl}`);
      console.log(`[i]: Using proxy: ${proxyUrl}`);
    }
    
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to login page
    console.log('[i]: Opening Pixiv login page...');
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log('[!]: Please log in using the browser window.');
    console.log('[i]: Waiting for login to complete...');
    console.log('[i]: The browser will remain open until login is complete.');
    
    // Wait for redirect to callback URL (up to 5 minutes)
    const code = await waitForAuthCode(page, 300000);
    
    if (!code) {
      throw new Error('Failed to obtain authorization code. Login may have been cancelled or timed out.');
    }
    
    console.log('[+]: Authorization code obtained!');
    console.log('[i]: Exchanging code for access token...');
    
    // Exchange code for token
    const loginInfo = await exchangeCodeForToken(code, codeVerifier);
    
    console.log('[+]: Login successful!');
    
    // Close browser
    await browser.close();
    browser = null;
    
    return loginInfo;
  } catch (error) {
    console.error('[!]: Puppeteer login failed:', error);
    
    // Cleanup
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    return null;
  }
}

/**
 * Login using Puppeteer (headless mode)
 * Runs browser in background without visible window
 */
export async function loginWithPuppeteerHeadless(
  username: string,
  password: string,
  proxy?: ProxyConfig
): Promise<LoginInfo | null> {
  let browser: Browser | null = null;
  
  try {
    console.log('[!]: Using Puppeteer for login (headless mode - no browser window)...');
    
    // Validate inputs
    if (!username || username.trim() === '') {
      throw new Error('Username cannot be empty');
    }
    if (!password || password.trim() === '') {
      throw new Error('Password cannot be empty');
    }
    
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // Build login URL with PKCE parameters
    const loginParams = new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      client: 'pixiv-android',
    });
    const loginUrl = `${LOGIN_URL}?${loginParams.toString()}`;
    
    // Launch browser in headless mode
    const launchOptions: any = {
      headless: 'new', // Use new headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    };
    
    // Add proxy if configured
    if (proxy && proxy.enabled) {
      const proxyUrl = buildProxyUrl(proxy);
      launchOptions.args.push(`--proxy-server=${proxyUrl}`);
      console.log(`[i]: Using proxy: ${proxyUrl}`);
    }
    
    console.log('[i]: Starting headless browser...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to login page
    console.log('[i]: Navigating to login page...');
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for login form to load
    console.log('[i]: Waiting for login form...');
    await page.waitForSelector('input[type="text"], input[autocomplete="username"]', { timeout: 30000 });
    
    // Fill in credentials
    console.log('[i]: Filling in credentials...');
    
    // Try different selectors for username field
    const usernameSelectors = [
      'input[autocomplete="username"]',
      'input[type="text"]',
      'input[name="pixiv_id"]',
      '#LoginComponent input[type="text"]',
    ];
    
    let usernameField = null;
    for (const selector of usernameSelectors) {
      try {
        usernameField = await page.$(selector);
        if (usernameField) {
          await usernameField.type(username, { delay: 100 });
          console.log('[i]: Username entered');
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!usernameField) {
      throw new Error('Could not find username input field');
    }
    
    // Try different selectors for password field
    const passwordSelectors = [
      'input[autocomplete="current-password"]',
      'input[type="password"]',
      'input[name="password"]',
      '#LoginComponent input[type="password"]',
    ];
    
    let passwordField = null;
    for (const selector of passwordSelectors) {
      try {
        passwordField = await page.$(selector);
        if (passwordField) {
          await passwordField.type(password, { delay: 100 });
          console.log('[i]: Password entered');
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!passwordField) {
      throw new Error('Could not find password input field');
    }
    
    // Submit form
    console.log('[i]: Submitting login form...');
    
    // Try different selectors for submit button
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("ログイン")',
      'button:has-text("Log in")',
      '#LoginComponent button[type="submit"]',
    ];
    
    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const submitButton = await page.$(selector);
        if (submitButton) {
          await submitButton.click();
          submitted = true;
          console.log('[i]: Form submitted');
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!submitted) {
      // Try pressing Enter as fallback
      await passwordField.press('Enter');
      console.log('[i]: Form submitted (Enter key)');
    }
    
    // Wait for redirect to callback URL (up to 2 minutes for headless)
    console.log('[i]: Waiting for authentication...');
    const code = await waitForAuthCode(page, 120000);
    
    if (!code) {
      // Try to get error message from page
      const errorMessage = await page.evaluate(() => {
        // @ts-ignore - This code runs in browser context
        const errorElement = document.querySelector('.error-message, .alert, [class*="error"]');
        return errorElement ? errorElement.textContent : null;
      });
      
      if (errorMessage) {
        throw new Error(`Login failed: ${errorMessage}`);
      } else {
        throw new Error('Failed to obtain authorization code. Please check your credentials.');
      }
    }
    
    console.log('[+]: Authorization code obtained!');
    console.log('[i]: Exchanging code for access token...');
    
    // Exchange code for token
    const loginInfo = await exchangeCodeForToken(code, codeVerifier);
    
    console.log('[+]: Login successful!');
    
    // Close browser
    await browser.close();
    browser = null;
    
    return loginInfo;
  } catch (error) {
    console.error('[!]: Puppeteer headless login failed:', error);
    
    // Cleanup
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    // Provide helpful error messages
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStr = errorMsg.toLowerCase();
    
    if (errorStr.includes('timeout') || errorStr.includes('navigation')) {
      console.log('\n[诊断建议]:');
      console.log('1. 网络连接问题：检查网络连接，或设置代理');
      console.log('2. Pixiv 限制：尝试使用交互模式登录');
      console.log('3. 登录凭据：确认用户名和密码是否正确');
    } else if (errorStr.includes('credentials') || errorStr.includes('password')) {
      console.log('\n[诊断建议]:');
      console.log('1. 确认用户名和密码是否正确');
      console.log('2. 如果使用邮箱登录，确保邮箱格式正确');
      console.log('3. 尝试使用交互模式登录以查看详细错误');
    }
    
    return null;
  }
}

/**
 * Wait for authorization code from redirect URL
 */
async function waitForAuthCode(page: Page, timeoutMs: number): Promise<string | null> {
  try {
    // Wait for URL to change to redirect URI
    await page.waitForFunction(
      (redirectUri) => {
        // @ts-ignore - This code runs in browser context
        return window.location.href.startsWith(redirectUri);
      },
      { timeout: timeoutMs },
      REDIRECT_URI
    );
    
    // Extract code from URL
    const url = page.url();
    const urlObj = new URL(url);
    const code = urlObj.searchParams.get('code');
    
    return code;
  } catch (error) {
    // Timeout or other error
    return null;
  }
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<LoginInfo> {
  try {
    const response = await axios.post(
      AUTH_TOKEN_URL,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        include_policy: 'true',
        redirect_uri: REDIRECT_URI,
      }).toString(),
      {
        headers: {
          'user-agent': USER_AGENT,
          'app-os-version': '14.6',
          'app-os': 'ios',
          'content-type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000,
      }
    );
    
    const data = response.data;
    
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type || 'bearer',
      scope: data.scope || '',
      refresh_token: data.refresh_token,
      user: data.user,
      response: data,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Failed to exchange code for token: ${error.response.status} ${error.response.statusText}`);
    }
    throw new Error(`Failed to exchange code for token: ${error}`);
  }
}

/**
 * Check if Puppeteer is available
 * This should always return true since Puppeteer is a project dependency
 */
export async function checkPuppeteerAvailable(): Promise<boolean> {
  try {
    // Try to import puppeteer
    const puppeteer = await import('puppeteer');
    return true;
  } catch (error) {
    return false;
  }
}

