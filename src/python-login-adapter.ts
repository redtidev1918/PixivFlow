/**
 * Python gppt Login Adapter
 * 
 * This module provides login functionality using the pip-installed gppt package.
 * It uses the gppt package installed via `pip install gppt`.
 * 
 * Requirements:
 * - Python 3.9+
 * - gppt package installed via pip: `pip install gppt`
 * - Chrome browser and ChromeDriver for Selenium
 * 
 * Based on get-pixivpy-token (gppt) implementation:
 * https://github.com/eggplants/get-pixivpy-token
 * 
 * Usage example from gppt:
 * ```python
 * from gppt import GetPixivToken
 * 
 * g = GetPixivToken(headless=False, username=None, password=None)
 * res = g.login(headless=None, username=None, password=None)
 * # res.response contains: access_token, refresh_token, expires_in, user, etc.
 * ```
 */

import { LoginInfo } from './terminal-login';
import { checkPythonGpptAvailable, installGppt, runPythonScript } from './python-login-adapter/python-environment';
import { ProxyConfig, buildProxyEnvVars, buildProxyUrl } from './python-login-adapter/proxy';
import { generateInteractiveLoginScript, generateHeadlessLoginScript } from './python-login-adapter/login-scripts';
import { convertGpptResponseToLoginInfo } from './python-login-adapter/response-converter';

// Re-export for backward compatibility
export { ProxyConfig, checkPythonGpptAvailable, installGppt };

/**
 * Login using Python gppt (interactive terminal mode)
 * 
 * Note: Even though this is called "terminal login", gppt uses Selenium to automate
 * a browser for the login process. This function will open a visible Chrome browser
 * window where you need to manually log in. If you want to avoid opening a browser
 * window, use loginWithGpptHeadless() with username and password instead.
 * 
 * Uses gppt's login-interactive command
 */
export async function loginWithGpptInteractive(proxy?: ProxyConfig): Promise<LoginInfo | null> {
  try {
    console.log('[!]: Using Python gppt for login (interactive mode)...');
    console.log('[i]: A Chrome browser window will open shortly.');
    console.log('[i]: Please complete the login process in the browser window.');
    console.log('[i]: This may take a few minutes - please be patient.');
    console.log('[i]: To avoid opening browser, use headless mode with --username and --password');
    
    // Build proxy environment variables if proxy is configured
    const proxyEnvVars = buildProxyEnvVars(proxy);
    if (proxy && proxy.enabled) {
      const proxyUrl = buildProxyUrl(proxy);
      console.log(`[i]: Using proxy: ${proxyUrl}`);
    }
    
    // Generate and run interactive login script
    const script = generateInteractiveLoginScript(proxyEnvVars);
    
    // Use longer timeout for interactive mode (5 minutes) since user needs to manually login
    const result = await runPythonScript(script, 300000);
    
    // Print stderr messages (info/warnings)
    if (result.stderr) {
      const stderrLines = result.stderr.trim().split('\n');
      for (const line of stderrLines) {
        if (line && !line.includes('ERROR:')) {
          console.log(`[i]: ${line}`);
        }
      }
    }
    
    if (!result.success) {
      throw new Error(result.error || 'gppt login failed');
    }

    if (!result.stdout || result.stdout.trim() === '') {
      throw new Error('No response from gppt login');
    }

    const response = JSON.parse(result.stdout);
    return convertGpptResponseToLoginInfo(response);
  } catch (error) {
    console.error('[!]: Python gppt login failed:', error);
    return null;
  }
}

/**
 * Login using Python gppt (headless mode)
 * 
 * This mode runs the browser in the background (headless) without opening
 * a visible window. Requires username and password to be provided.
 * 
 * Uses gppt's login-headless command with username and password
 */
export async function loginWithGpptHeadless(
  username: string,
  password: string,
  proxy?: ProxyConfig
): Promise<LoginInfo | null> {
  try {
    console.log('[!]: Using Python gppt for login (headless mode - no browser window)...');
    
    // Build proxy environment variables if proxy is configured
    let proxyEnvVars = buildProxyEnvVars(proxy);
    if (proxy && proxy.enabled) {
      const proxyUrl = buildProxyUrl(proxy);
      console.log(`[i]: Using proxy: ${proxyUrl}`);
    } else {
      // Check for proxy configuration in environment (check both uppercase and lowercase)
      const allProxy = process.env.ALL_PROXY || process.env.all_proxy;
      const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
      const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
      const hasProxy = allProxy || httpsProxy || httpProxy;
      
      if (hasProxy) {
        console.log('[i]: Proxy configuration detected from environment:');
        if (allProxy) console.log(`[i]:   ALL_PROXY/all_proxy: ${allProxy}`);
        if (httpsProxy) console.log(`[i]:   HTTPS_PROXY/https_proxy: ${httpsProxy}`);
        if (httpProxy) console.log(`[i]:   HTTP_PROXY/http_proxy: ${httpProxy}`);
        console.log('[i]: Python script will verify proxy detection...');
      } else {
        console.log('[i]: No proxy detected. If login is slow or fails, try setting proxy:');
        console.log('[i]:   export HTTPS_PROXY=http://your-proxy:port');
        console.log('[i]:   or');
        console.log('[i]:   export ALL_PROXY=http://your-proxy:port');
        console.log('[i]:   (Note: Both uppercase and lowercase variable names are supported)');
      }
    }
    
    // Validate inputs
    if (!username || username.trim() === '') {
      throw new Error('Username cannot be empty');
    }
    if (!password || password.trim() === '') {
      throw new Error('Password cannot be empty');
    }
    
    // Use base64 encoding to safely pass strings to Python script
    // This avoids all escaping issues with special characters
    const usernameBase64 = Buffer.from(username, 'utf-8').toString('base64');
    const passwordBase64 = Buffer.from(password, 'utf-8').toString('base64');
    
    // Generate and run headless login script
    const script = generateHeadlessLoginScript(usernameBase64, passwordBase64, proxyEnvVars);
    const result = await runPythonScript(script);
    
    // Print stderr messages (info/warnings) - but show errors too
    if (result.stderr) {
      const stderrLines = result.stderr.trim().split('\n');
      for (const line of stderrLines) {
        if (line) {
          if (line.includes('ERROR:')) {
            console.error(`[!]: ${line}`);
          } else {
            console.log(`[i]: ${line}`);
          }
        }
      }
    }
    
    if (!result.success) {
      const errorMsg = result.error || result.stderr || 'gppt login failed';
      
      // Check for specific error types and provide helpful suggestions
      const errorStr = errorMsg.toLowerCase();
      let suggestions = '';
      
      if (errorStr.includes('timeout') || errorStr.includes('wait_for_redirect')) {
        suggestions = '\n\n[诊断建议]:\n' +
          '1. 网络连接问题：检查网络连接是否正常，或尝试设置代理\n' +
          '   export HTTPS_PROXY=http://your-proxy:port\n' +
          '2. Pixiv 限制：可能被 Pixiv 限制，尝试：\n' +
          '   - 等待一段时间后重试\n' +
          '   - 使用交互模式（非无头模式）进行登录\n' +
          '   - 检查账户是否被限制\n' +
          '3. 登录凭据：确认用户名和密码是否正确\n' +
          '4. Chrome/Selenium：确保 Chrome 浏览器和 ChromeDriver 已正确安装';
      } else if (errorStr.includes('proxy')) {
        suggestions = '\n\n[诊断建议]:\n' +
          '1. 检查代理设置是否正确\n' +
          '2. 如果不需要代理，取消代理设置：unset HTTPS_PROXY ALL_PROXY HTTP_PROXY';
      } else if (errorStr.includes('restricted') || errorStr.includes('限制')) {
        suggestions = '\n\n[诊断建议]:\n' +
          '1. Pixiv 可能检测到自动化登录，建议：\n' +
          '   - 使用交互模式（会打开浏览器窗口）\n' +
          '   - 等待一段时间后重试\n' +
          '   - 检查账户状态';
      }
      
      throw new Error(errorMsg + suggestions);
    }

    if (!result.stdout || result.stdout.trim() === '') {
      const errorDetails = result.stderr ? `\nPython stderr: ${result.stderr}` : '';
      throw new Error(`No response from gppt login${errorDetails}`);
    }

    try {
      const response = JSON.parse(result.stdout);
      
      // Check if the response is an error object
      if (response && typeof response === 'object' && 'error' in response) {
        const errorDetails = result.stderr ? `\nPython stderr: ${result.stderr}` : '';
        const errorMsg = response.error as string;
        
        // Use suggestion from Python script if available, otherwise generate one
        let suggestions = '';
        if (response.suggestion) {
          suggestions = `\n\n[建议]: ${response.suggestion}`;
        } else {
          // Provide suggestions based on error type
          const errorStr = errorMsg.toLowerCase();
          
          if (errorStr.includes('timeout') || errorStr.includes('wait_for_redirect')) {
            suggestions = '\n\n[诊断建议]:\n' +
              '1. 网络连接问题：检查网络连接，或设置代理\n' +
              '2. Pixiv 限制：尝试使用交互模式登录\n' +
              '3. 登录凭据：确认用户名和密码是否正确';
          }
        }
        
        throw new Error(`gppt login error: ${errorMsg}${suggestions}${errorDetails}`);
      }
      
      return convertGpptResponseToLoginInfo(response);
    } catch (parseError) {
      const errorDetails = result.stderr ? `\nPython stderr: ${result.stderr}` : '';
      throw new Error(`Failed to parse gppt response: ${parseError}\nstdout: ${result.stdout.substring(0, 200)}${errorDetails}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[!]: Python gppt login failed:', errorMessage);
    
    // Provide fallback suggestion
    console.log('\n[i]: 提示：如果无头模式失败，可以尝试交互模式：');
    console.log('[i]:   不使用 --headless 参数，或使用 --interactive 参数');
    console.log('[i]:   交互模式会打开浏览器窗口，需要手动登录');
    
    return null;
  }
}
