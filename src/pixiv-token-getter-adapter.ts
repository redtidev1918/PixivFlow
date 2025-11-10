/**
 * Pixiv Token Getter Adapter
 * 
 * This module provides login functionality using the pixiv-token-getter library.
 * It wraps the library to match the project's LoginInfo interface.
 * 
 * Library: https://github.com/zoidberg-xgd/pixiv-token-getter
 */

import { getTokenInteractive, getTokenHeadless, TokenInfo } from 'pixiv-token-getter';
import { LoginInfo } from './terminal-login';
import { ProxyConfig } from './puppeteer-login-adapter';

/**
 * Check if pixiv-token-getter is available
 */
export async function checkPixivTokenGetterAvailable(): Promise<boolean> {
  try {
    const { getTokenInteractive } = await import('pixiv-token-getter');
    return typeof getTokenInteractive === 'function';
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code;
    
    if (errorCode === 'MODULE_NOT_FOUND' || errorMessage.includes('Cannot find module')) {
      console.error('[PixivTokenGetter] Module not found. Please ensure pixiv-token-getter is installed:', errorMessage);
    } else {
      console.error('[PixivTokenGetter] Import failed:', errorMessage, errorCode);
    }
    
    return false;
  }
}

/**
 * Convert TokenInfo from pixiv-token-getter to LoginInfo format
 * Maps the user object to match the project's UserInfo interface
 */
function convertTokenInfoToLoginInfo(tokenInfo: TokenInfo): LoginInfo {
  // Map user object to match project's UserInfo interface
  // pixiv-token-getter returns a simpler user object, so we need to map it
  const user = tokenInfo.user;
  
  // Create UserInfo with required fields, using defaults for missing fields
  const mappedUser = {
    id: user.id || '',
    name: user.name || '',
    account: user.account || '',
    profile_image_urls: {
      px_16x16: '',
      px_50x50: '',
      px_170x170: '',
    },
    mail_address: '',
    is_premium: false,
    x_restrict: 0,
    is_mail_authorized: false,
    require_policy_agreement: false,
    // Include any additional fields from the original user object
    ...(user as any),
  };
  
  // If the original user object has profile_image_urls, use them
  if ((user as any).profile_image_urls) {
    mappedUser.profile_image_urls = (user as any).profile_image_urls;
  }
  
  // Map other fields if they exist
  if ((user as any).mail_address !== undefined) {
    mappedUser.mail_address = (user as any).mail_address;
  }
  if ((user as any).is_premium !== undefined) {
    mappedUser.is_premium = (user as any).is_premium;
  }
  if ((user as any).x_restrict !== undefined) {
    mappedUser.x_restrict = (user as any).x_restrict;
  }
  if ((user as any).is_mail_authorized !== undefined) {
    mappedUser.is_mail_authorized = (user as any).is_mail_authorized;
  }
  if ((user as any).require_policy_agreement !== undefined) {
    mappedUser.require_policy_agreement = (user as any).require_policy_agreement;
  }
  
  const oauthResponse = {
    access_token: tokenInfo.access_token,
    refresh_token: tokenInfo.refresh_token,
    expires_in: tokenInfo.expires_in,
    token_type: tokenInfo.token_type || 'bearer',
    scope: tokenInfo.scope || '',
    user: mappedUser,
  };
  
  return {
    ...oauthResponse,
    response: oauthResponse,
  };
}

/**
 * Login using pixiv-token-getter (interactive mode)
 * Opens a browser window for user to manually log in
 * 
 * Note: pixiv-token-getter doesn't support proxy configuration directly,
 * but we can pass it through if the library supports it in the future.
 */
export async function loginWithPixivTokenGetterInteractive(
  proxy?: ProxyConfig
): Promise<LoginInfo | null> {
  try {
    console.log('[!]: Using pixiv-token-getter for login (interactive mode)...');
    console.log('[i]: A browser window will open shortly.');
    console.log('[i]: Please complete the login process in the browser window.');
    
    // Note: pixiv-token-getter doesn't support proxy in its options yet
    // If proxy is needed, we might need to set environment variables or wait for library support
    if (proxy && proxy.enabled) {
      console.warn('[!]: Proxy configuration is not yet supported by pixiv-token-getter');
      console.warn('[!]: Proceeding without proxy...');
    }
    
    const tokenInfo = await getTokenInteractive({
      headless: false,
      timeout: 300000, // 5 minutes
      onBrowserOpen: () => {
        console.log('[i]: Browser opened, please complete login');
      },
      onPageReady: (page, url) => {
        console.log(`[i]: Login page ready: ${url}`);
      },
    });
    
    const loginInfo = convertTokenInfoToLoginInfo(tokenInfo);
    console.log('[+]: Login successful with pixiv-token-getter!');
    return loginInfo;
  } catch (error) {
    console.error('[!]: pixiv-token-getter interactive login failed:', error);
    return null;
  }
}

/**
 * Login using pixiv-token-getter (headless mode)
 * Runs browser in background without visible window
 */
export async function loginWithPixivTokenGetterHeadless(
  username: string,
  password: string,
  proxy?: ProxyConfig
): Promise<LoginInfo | null> {
  try {
    console.log('[!]: Using pixiv-token-getter for login (headless mode)...');
    
    // Validate inputs
    if (!username || username.trim() === '') {
      throw new Error('Username cannot be empty');
    }
    if (!password || password.trim() === '') {
      throw new Error('Password cannot be empty');
    }
    
    // Note: pixiv-token-getter doesn't support proxy in its options yet
    if (proxy && proxy.enabled) {
      console.warn('[!]: Proxy configuration is not yet supported by pixiv-token-getter');
      console.warn('[!]: Proceeding without proxy...');
    }
    
    const tokenInfo = await getTokenHeadless({
      username: username.trim(),
      password: password.trim(),
      timeout: 120000, // 2 minutes
    });
    
    const loginInfo = convertTokenInfoToLoginInfo(tokenInfo);
    console.log('[+]: Login successful with pixiv-token-getter!');
    return loginInfo;
  } catch (error) {
    console.error('[!]: pixiv-token-getter headless login failed:', error);
    
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

