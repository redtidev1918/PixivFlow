/**
 * Interactive login using Puppeteer
 * Opens a browser window for user to manually log in
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
    
    // Try to launch browser
    try {
      browser = await puppeteer.launch(launchOptions);
    } catch (launchError: any) {
      const errorMsg = launchError?.message || String(launchError);
      
      // Check if we're in Electron environment
      if (isElectronEnvironment()) {
        console.error('[!]: Puppeteer cannot launch browser in Electron environment');
        console.error('[!]: Error:', errorMsg);
        console.error('[!]: In Electron apps, please use the Electron login window instead');
        console.error('[!]: If you\'re using the Electron app, the login window should open automatically');
        throw new Error(
          'Puppeteer cannot launch browser in Electron environment. ' +
          'Please use Electron\'s built-in login window. ' +
          'If you\'re calling this from the backend API in an Electron app, ' +
          'the frontend should use the Electron login window instead. ' +
          `Original error: ${errorMsg}`
        );
      }
      
      // For non-Electron environments, throw the original error
      throw launchError;
    }
    
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
















