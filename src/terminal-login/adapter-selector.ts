/**
 * Login adapter selector
 * Handles selecting and using the appropriate login adapter
 */

import {
  checkPixivTokenGetterAvailable,
  loginWithPixivTokenGetterInteractive,
  loginWithPixivTokenGetterHeadless,
} from '../pixiv-token-getter-adapter';
import {
  checkPuppeteerAvailable,
  loginWithPuppeteerInteractive,
  loginWithPuppeteerHeadless,
  ProxyConfig as PuppeteerProxyConfig,
} from '../puppeteer-login-adapter';
import {
  checkPythonGpptAvailable,
  installGppt,
  loginWithGpptInteractive,
  loginWithGpptHeadless,
} from '../python-login-adapter';
import { LoginInfo, PixivLoginFailedError } from './types';

export type ProxyConfig = PuppeteerProxyConfig;

export interface LoginOptions {
  headless?: boolean;
  username?: string;
  password?: string;
  proxy?: ProxyConfig;
  forcePython?: boolean; // Force use of Python gppt instead of other methods
  forcePuppeteer?: boolean; // Force use of Puppeteer instead of pixiv-token-getter
  forceTokenGetter?: boolean; // Force use of pixiv-token-getter only, no fallback
}

/**
 * Login using the appropriate adapter
 * Tries methods in this order:
 * 1. pixiv-token-getter (specialized library, recommended)
 * 2. Puppeteer (Node.js native, no external dependencies)
 * 3. Python gppt (fallback)
 */
export async function loginWithAdapter(options: LoginOptions): Promise<LoginInfo> {
  const { headless, username, password, proxy } = options;

  // Try pixiv-token-getter first (unless forcePython or forcePuppeteer is set)
  // If forceTokenGetter is set, only use pixiv-token-getter and throw error if it fails
  if (!options.forcePython && !options.forcePuppeteer) {
    const tokenGetterAvailable = await checkPixivTokenGetterAvailable();
    
    if (tokenGetterAvailable) {
      console.log('[i]: Using pixiv-token-getter for login (recommended)...');
      
      try {
        let result: LoginInfo | null = null;
        
        if (headless && username && password) {
          result = await loginWithPixivTokenGetterHeadless(username, password, proxy);
        } else {
          result = await loginWithPixivTokenGetterInteractive(proxy);
        }
        
        if (result) {
          console.log('[+]: Login successful with pixiv-token-getter!');
          return result;
        }
      } catch (error) {
        console.error('[!]: pixiv-token-getter login failed:', error);
        
        // If forceTokenGetter is set, throw error instead of falling back
        if (options.forceTokenGetter) {
          throw new PixivLoginFailedError(
            `pixiv-token-getter login failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        
        console.log('[i]: Falling back to Puppeteer...');
      }
    } else {
      // If forceTokenGetter is set and it's not available, throw error
      if (options.forceTokenGetter) {
        throw new PixivLoginFailedError(
          'pixiv-token-getter is not available. Please ensure pixiv-token-getter package is installed.'
        );
      }
      
      console.log('[i]: pixiv-token-getter not available, will try Puppeteer...');
    }
  }
  
  // If forceTokenGetter is set, we should not reach here (should have returned or thrown)
  if (options.forceTokenGetter) {
    throw new PixivLoginFailedError(
      'pixiv-token-getter login failed and forceTokenGetter is set. No fallback allowed.'
    );
  }

  // Try Puppeteer next (unless forcePython is set)
  if (!options.forcePython) {
    const puppeteerAvailable = await checkPuppeteerAvailable();
    
    if (puppeteerAvailable) {
      console.log('[i]: Using Puppeteer (Node.js native) for login - no Python required!');
      
      try {
        let result: LoginInfo | null = null;
        
        if (headless && username && password) {
          result = await loginWithPuppeteerHeadless(username, password, proxy);
        } else {
          result = await loginWithPuppeteerInteractive(proxy);
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
  
  if (headless && username && password) {
    try {
      pythonResult = await loginWithGpptHeadless(username, password, proxy);
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
    pythonResult = await loginWithGpptInteractive(proxy);
  }
  
  if (pythonResult) {
    console.log('[+]: Login successful with Python gppt!');
    return pythonResult;
  } else {
    const errorMsg = headless && username && password
      ? 'Headless login failed. Try interactive mode (remove --headless flag) or check your credentials/proxy settings.'
      : 'Interactive login failed. Please check your network connection and try again.';
    throw new Error(errorMsg);
  }
}
















































