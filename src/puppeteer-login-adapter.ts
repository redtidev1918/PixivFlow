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
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
      ignoreHTTPSErrors: true,
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
    
    // Set extra headers to avoid detection
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });
    
    // Navigate to login page
    console.log('[i]: Opening Pixiv login page...');
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (error) {
      // If networkidle2 times out, try with domcontentloaded
      console.log('[i]: Retrying with domcontentloaded...');
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    
    console.log('[!]: Please log in using the browser window.');
    console.log('[i]: Waiting for login to complete...');
    console.log('[i]: The browser will remain open until login is complete.');
    console.log('[i]: After logging in, Pixiv will redirect to a callback URL.');
    console.log('[i]: The browser window will close automatically once login is successful.');
    
    // Wait for redirect to callback URL (up to 5 minutes)
    const code = await waitForAuthCode(page, 300000);
    
    if (!code) {
      // Check if we're on a page that might indicate login completed
      const currentUrl = page.url();
      console.log(`[!]: Current page URL: ${currentUrl}`);
      
      // Try to extract code from current URL one more time
      try {
        const urlObj = new URL(currentUrl);
        const codeFromUrl = urlObj.searchParams.get('code');
        if (codeFromUrl) {
          console.log('[+]: Found authorization code in current URL!');
          const loginInfo = await exchangeCodeForToken(codeFromUrl, codeVerifier);
          console.log('[+]: Login successful!');
          await browser.close();
          browser = null;
          return loginInfo;
        }
      } catch (e) {
        // URL parsing failed, continue with error
      }
      
      throw new Error('Failed to obtain authorization code. Login may have been cancelled or timed out. Please try again.');
    }
    
    console.log('[+]: Authorization code obtained!');
    console.log('[i]: Exchanging code for access token...');
    
    // Exchange code for token
    const loginInfo = await exchangeCodeForToken(code, codeVerifier);
    
    console.log('[+]: Login successful!');
    console.log('[i]: Closing browser window...');
    
    // Close browser
    try {
      await browser.close();
      browser = null;
    } catch (e) {
      console.warn('[!]: Warning: Failed to close browser, but login was successful');
    }
    
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
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
      ignoreHTTPSErrors: true,
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
    
    // Set extra headers to avoid detection
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });
    
    // Navigate to login page
    console.log('[i]: Navigating to login page...');
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (error) {
      // If networkidle2 times out, try with domcontentloaded
      console.log('[i]: Retrying with domcontentloaded...');
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    
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
  return new Promise((resolve) => {
    let resolved = false;
    let pollInterval: NodeJS.Timeout | null = null;
    
    // Cleanup function to ensure all listeners are removed
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      try {
        page.off('response', onResponse);
        page.off('framenavigated', onFrameNavigated);
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        console.log('[!]: Timeout waiting for authorization code');
        resolve(null);
      }
    }, timeoutMs);

    // Function to check and extract code from URL
    const checkUrlForCode = (url: string): string | null => {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        if (code) {
          console.log('[+]: Found authorization code in URL');
          return code;
        }
      } catch (e) {
        // Invalid URL, ignore
      }
      return null;
    };

    // Check current URL immediately
    try {
      const currentUrl = page.url();
      const currentCode = checkUrlForCode(currentUrl);
      if (currentCode) {
        cleanup();
        clearTimeout(timeout);
        resolve(currentCode);
        return;
      }
    } catch (e) {
      // Continue with listeners if immediate check fails
    }

    // Listen for navigation events
    const onResponse = async (response: any) => {
      if (resolved) return;
      
      try {
        const url = response.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // Ignore errors
      }
    };

    const onFrameNavigated = async (frame: any) => {
      if (resolved || frame !== page.mainFrame()) return;
      
      try {
        const url = frame.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // Ignore errors
      }
    };

    // Also poll the URL periodically as a fallback
    pollInterval = setInterval(async () => {
      if (resolved) {
        if (pollInterval) {
          clearInterval(pollInterval);
        }
        return;
      }

      try {
        const url = page.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // Ignore errors
      }
    }, 1000); // Check every second

    // Set up listeners
    page.on('response', onResponse);
    page.on('framenavigated', onFrameNavigated);

    // Also wait for the specific redirect URI as before (for compatibility)
    // Use a shorter timeout for waitForFunction to avoid conflicts
    const waitForFunctionTimeout = Math.min(timeoutMs, 60000);
    page.waitForFunction(
      () => {
        // @ts-ignore - This code runs in browser context
        const url = window.location.href;
        // Check if URL contains code parameter
        try {
          return new URL(url).searchParams.has('code');
        } catch {
          return false;
        }
      },
      { timeout: waitForFunctionTimeout }
    ).then(() => {
      if (!resolved) {
        try {
          const url = page.url();
          const code = checkUrlForCode(url);
          if (code) {
            cleanup();
            clearTimeout(timeout);
            resolve(code);
          }
        } catch (e) {
          // If we reach here but no code found, continue waiting
        }
      }
    }).catch(() => {
      // Timeout or error - will be handled by the main timeout
      // Don't resolve here, let the main timeout handle it
    });
  });
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
    // Use dynamic import to handle cases where module might not be available
    const puppeteer = await import('puppeteer');
    
    // Verify that puppeteer has the expected exports
    if (!puppeteer || typeof puppeteer.launch !== 'function') {
      console.warn('[Puppeteer] Module imported but missing expected exports');
      return false;
    }
    
    // In Electron environments, we might not be able to launch a separate browser
    // So we just check if the module can be imported and has the expected API
    // The actual browser launch will be tested during login
    return true;
  } catch (error: any) {
    // Log the error for debugging
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code;
    
    // Check if it's a module not found error
    if (errorCode === 'MODULE_NOT_FOUND' || errorMessage.includes('Cannot find module')) {
      console.error('[Puppeteer] Module not found. Please ensure puppeteer is installed:', errorMessage);
    } else {
      console.error('[Puppeteer] Import failed:', errorMessage, errorCode);
    }
    
    return false;
  }
}

