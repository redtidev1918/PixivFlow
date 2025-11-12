/**
 * Headless login using Puppeteer
 * Runs browser in background without visible window
 */

import puppeteer, { Browser } from 'puppeteer';
import { LoginInfo } from '../terminal-login';
import { ProxyConfig, buildProxyUrl } from './proxy';
import { generateCodeVerifier, generateCodeChallenge } from './pkce';
import { LOGIN_URL } from './constants';
import { isElectronEnvironment } from './environment';
import { waitForAuthCode } from './auth-code';
import { exchangeCodeForToken } from './token-exchange';

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
    
    // Try to launch browser
    try {
      browser = await puppeteer.launch(launchOptions);
    } catch (launchError: any) {
      const errorMsg = launchError?.message || String(launchError);
      
      // Check if we're in Electron environment
      if (isElectronEnvironment()) {
        console.error('[!]: Puppeteer cannot launch browser in Electron environment');
        console.error('[!]: Error:', errorMsg);
        console.error('[!]: In Electron apps, headless mode is not supported');
        throw new Error(
          'Puppeteer cannot launch browser in Electron environment. ' +
          'Headless mode is not supported in Electron apps. ' +
          'Please use Electron\'s built-in login window or Python gppt instead. ' +
          `Original error: ${errorMsg}`
        );
      }
      
      // For non-Electron environments, throw the original error
      throw launchError;
    }
    
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














































