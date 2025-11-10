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

import { spawn } from 'child_process';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { LoginInfo } from './terminal-login';

/**
 * Find Python executable path
 * Supports both regular Node.js and Electron environments
 */
async function findPythonExecutable(): Promise<string | null> {
  // List of possible Python executable names
  const pythonCommands = ['python3', 'python'];
  
  // In Electron, we might need to check system PATH
  // Try to find Python in common locations
  const commonPaths: string[] = [];
  
  if (process.platform === 'darwin') {
    // macOS common Python paths
    commonPaths.push(
      '/usr/local/bin/python3',
      '/opt/homebrew/bin/python3',
      '/usr/bin/python3',
      '/Library/Frameworks/Python.framework/Versions/3.*/bin/python3'
    );
  } else if (process.platform === 'win32') {
    // Windows common Python paths
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    commonPaths.push(
      path.join(localAppData, 'Programs', 'Python', 'Python3*', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python3*', 'python3.exe'),
      'C:\\Python3*\\python.exe',
      'C:\\Python3*\\python3.exe'
    );
  } else {
    // Linux common Python paths
    commonPaths.push(
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      '/opt/python3/bin/python3'
    );
  }
  
  // First, try commands from PATH
  for (const cmd of pythonCommands) {
    try {
      const result = await runCommand(cmd, ['--version']);
      if (result.success) {
        // Verify it's actually Python 3
        const version = result.stdout || '';
        if (version.includes('Python 3')) {
          return cmd;
        }
      }
    } catch {
      // Continue to next command
    }
  }
  
  // Then try common paths
  for (const pythonPath of commonPaths) {
    // Handle wildcards
    if (pythonPath.includes('*')) {
      // For wildcard paths, we'd need glob, but for now skip
      continue;
    }
    
    try {
      if (fs.existsSync(pythonPath)) {
        const result = await runCommand(pythonPath, ['--version']);
        if (result.success) {
          const version = result.stdout || '';
          if (version.includes('Python 3')) {
            return pythonPath;
          }
        }
      }
    } catch {
      // Continue to next path
    }
  }
  
  // Last resort: try to find Python using 'which' or 'where'
  try {
    let whichCmd: string;
    if (process.platform === 'win32') {
      whichCmd = 'where';
    } else {
      whichCmd = 'which';
    }
    
    for (const cmd of pythonCommands) {
      try {
        const result = execSync(`${whichCmd} ${cmd}`, { encoding: 'utf-8', stdio: 'pipe' });
        const pythonPath = result.trim().split('\n')[0];
        if (pythonPath && fs.existsSync(pythonPath)) {
          return pythonPath;
        }
      } catch {
        // Continue
      }
    }
  } catch {
    // Ignore errors
  }
  
  return null;
}

/**
 * Get Python executable path (cached)
 */
let cachedPythonPath: string | null = null;

async function getPythonExecutable(): Promise<string> {
  if (cachedPythonPath) {
    return cachedPythonPath;
  }
  
  const pythonPath = await findPythonExecutable();
  if (!pythonPath) {
    throw new Error(
      'Python 3 not found. Please install Python 3.9 or later:\n' +
      '  - macOS: brew install python3\n' +
      '  - Windows: Download from https://www.python.org/downloads/\n' +
      '  - Linux: sudo apt-get install python3 (Ubuntu/Debian) or sudo yum install python3 (RHEL/CentOS)'
    );
  }
  
  cachedPythonPath = pythonPath;
  return pythonPath;
}

/**
 * Check if Python and pip-installed gppt module are available
 */
export async function checkPythonGpptAvailable(): Promise<boolean> {
  try {
    // Check Python
    const pythonPath = await getPythonExecutable();
    const pythonCheck = await runCommand(pythonPath, ['--version']);
    if (!pythonCheck.success) {
      return false;
    }

    // Check if gppt module can be imported (from pip installation)
    const importScript = `
try:
    from gppt import GetPixivToken
    print("OK")
except ImportError as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`;
    const gpptCheck = await runPythonScript(importScript);
    return gpptCheck.success && gpptCheck.stdout.trim() === 'OK';
  } catch (error) {
    // If Python is not found, return false
    return false;
  }
}

/**
 * Install gppt using pip
 */
export async function installGppt(): Promise<boolean> {
  try {
    console.log('[!]: Installing gppt package via pip...');
    console.log('[i]: This may take a moment...');
    
    // Get Python executable path
    const pythonPath = await getPythonExecutable();
    
    // Try pip3 first, then pip, then python -m pip
    const pipCommands = ['pip3', 'pip'];
    let pipInstalled = false;
    
    for (const pipCmd of pipCommands) {
      const pipCheck = await runCommand(pipCmd, ['--version']);
      if (pipCheck.success) {
        const result = await runCommand(pipCmd, ['install', 'gppt']);
        if (result.success) {
          console.log('[+]: gppt installed successfully');
          pipInstalled = true;
          break;
        } else {
          console.error(`[!]: Failed to install gppt using ${pipCmd}:`, result.error);
        }
      }
    }
    
    // If pip commands failed, try python -m pip
    if (!pipInstalled) {
      try {
        const result = await runCommand(pythonPath, ['-m', 'pip', 'install', 'gppt']);
        if (result.success) {
          console.log('[+]: gppt installed successfully using python -m pip');
          pipInstalled = true;
        } else {
          console.error(`[!]: Failed to install gppt using ${pythonPath} -m pip:`, result.error);
        }
      } catch (error) {
        console.error('[!]: Failed to install gppt using python -m pip:', error);
      }
    }
    
    if (!pipInstalled) {
      console.error('[!]: Failed to install gppt. Please install manually:');
      console.error(`[!]: ${pythonPath} -m pip install gppt`);
      console.error('[!]: or');
      console.error('[!]: pip3 install gppt');
      return false;
    }
    
    // Verify installation
    const available = await checkPythonGpptAvailable();
    if (available) {
      console.log('[+]: gppt is ready to use');
      return true;
    } else {
      console.error('[!]: gppt was installed but cannot be imported');
      return false;
    }
  } catch (error) {
    console.error('[!]: Error installing gppt:', error);
    return false;
  }
}

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
    let proxyEnvVars = '';
    if (proxy && proxy.enabled) {
      const proxyUrl = buildProxyUrl(proxy);
      // Set proxy environment variables for Python script
      proxyEnvVars = `
import os
proxy_url = "${proxyUrl}"
os.environ['HTTPS_PROXY'] = proxy_url
os.environ['HTTP_PROXY'] = proxy_url
os.environ['ALL_PROXY'] = proxy_url
print(f"[DEBUG]: Proxy configured: {proxy_url}", file=sys.stderr)
`;
      console.log(`[i]: Using proxy: ${proxyUrl}`);
    }
    
    // Use a simple Python script to call gppt and output full JSON
    // Increase timeout for interactive mode since user needs to manually login
    // CRITICAL FIX: Explicitly set headless=False to ensure browser stays open
    // Also increase the internal timeout from 20 seconds to 5 minutes (300 seconds)
    const script = `
import json
import sys
import time
from gppt import GetPixivToken
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

${proxyEnvVars}

try:
    print("[i]: Initializing GetPixivToken (interactive mode)...", file=sys.stderr)
    # According to gppt API: GetPixivToken(headless=False, username=None, password=None)
    # For interactive mode, we don't pass username/password - user will login manually
    g = GetPixivToken(headless=False)
    
    # Monkey patch to increase timeout from default 20 seconds to 5 minutes (300 seconds)
    # This gives users more time to complete the login process
    # Based on gppt's internal implementation
    import types
    from gppt.consts import REDIRECT_URI
    original_wait_for_redirect = g._GetPixivToken__wait_for_redirect
    def patched_wait_for_redirect(self):
        WebDriverWait(self.driver, 300).until(EC.url_matches(f"^{REDIRECT_URI}"))
    g._GetPixivToken__wait_for_redirect = types.MethodType(patched_wait_for_redirect, g)
    print("[i]: Increased login timeout to 5 minutes (300 seconds)", file=sys.stderr)
    
    # Verify browser is actually running
    if hasattr(g, 'driver') and g.driver:
        try:
            # Check if browser window is accessible
            current_url = g.driver.current_url
            print(f"[DEBUG]: Browser initialized, current URL: {current_url}", file=sys.stderr)
        except Exception as browser_check_error:
            print(f"[WARNING]: Browser check failed: {browser_check_error}", file=sys.stderr)
            print("[WARNING]: Browser may have closed unexpectedly. Retrying...", file=sys.stderr)
            # Try to reinitialize if browser closed
            try:
                g = GetPixivToken(headless=False)
            except Exception as retry_error:
                print(f"ERROR: Failed to reinitialize browser: {retry_error}", file=sys.stderr)
                sys.exit(1)
    
    print("[!]: Chrome browser window opened. Please login manually in the browser.", file=sys.stderr)
    print("[i]: Waiting for you to complete login in the browser...", file=sys.stderr)
    print("[i]: This may take a few minutes. Please do not close the browser window.", file=sys.stderr)
    print("[i]: The browser will remain open until login is complete.", file=sys.stderr)
    
    # Call login() - according to gppt API: g.login(headless=None, username=None, password=None)
    # For interactive mode, we don't pass parameters - user will login manually
    res = g.login()
    
    # According to gppt, res is a dict with 'response' key containing the full OAuth response
    # But res itself also contains the token fields directly
    # We'll use res.response if available, otherwise use res directly
    response_data = res.response if hasattr(res, 'response') and res.response else res
    
    # Verify browser is still running after login attempt
    if hasattr(g, 'driver') and g.driver:
        try:
            # Keep browser open until we get the result
            if response_data:
                print("[+]: Login successful! Retrieving token...", file=sys.stderr)
                # Don't close browser immediately - ensure we have the result first
                time.sleep(0.5)  # Small delay to ensure all data is captured
                # Output the response in gppt format (same as gppt CLI output)
                print(json.dumps(response_data, indent=2))
                # Browser will be closed by gppt's cleanup, but we ensure data is captured first
            else:
                print("ERROR: Login returned None. Please try again.", file=sys.stderr)
                sys.exit(1)
        except Exception as post_login_error:
            print(f"[WARNING]: Post-login check failed: {post_login_error}", file=sys.stderr)
            # If we have a result despite the error, still try to return it
            if response_data:
                print("[+]: Login successful (despite warning)! Retrieving token...", file=sys.stderr)
                print(json.dumps(response_data, indent=2))
            else:
                raise
    else:
        # Browser closed unexpectedly, but check if we got a result before it closed
        if response_data:
            print("[+]: Login successful! Retrieving token...", file=sys.stderr)
            print(json.dumps(response_data, indent=2))
        else:
            print("ERROR: Browser closed before login completed. Please try again.", file=sys.stderr)
            sys.exit(1)
            
except KeyboardInterrupt:
    print("ERROR: Login interrupted by user", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"ERROR: {str(e)}", file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
finally:
    # Ensure browser cleanup happens properly
    try:
        if 'g' in locals() and hasattr(g, 'driver') and g.driver:
            # Let gppt handle cleanup, but ensure we don't close too early
            pass
    except:
        pass
`;

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
    let proxyEnvVars = '';
    let proxyUrl = '';
    if (proxy && proxy.enabled) {
      proxyUrl = buildProxyUrl(proxy);
      // Set proxy environment variables for Python script
      proxyEnvVars = `
import os
proxy_url = "${proxyUrl}"
os.environ['HTTPS_PROXY'] = proxy_url
os.environ['HTTP_PROXY'] = proxy_url
os.environ['ALL_PROXY'] = proxy_url
print(f"[DEBUG]: Proxy configured: {proxy_url}", file=sys.stderr)
`;
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
    
    const script = `
import json
import sys
import base64
import types
from gppt import GetPixivToken
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from gppt.consts import REDIRECT_URI

${proxyEnvVars}

try:
    # Decode base64-encoded username and password
    username = base64.b64decode('${usernameBase64}').decode('utf-8')
    password = base64.b64decode('${passwordBase64}').decode('utf-8')
    
    if not username or not password:
        print("ERROR: Username or password is empty", file=sys.stderr)
        print(json.dumps({"error": "Username or password is empty"}), file=sys.stdout)
        sys.exit(1)
    
    print(f"[DEBUG]: Starting login for user: {username[:3]}***", file=sys.stderr)
    
    # Check proxy configuration (check both uppercase and lowercase)
    import os
    from urllib.request import getproxies
    
    # Check all possible proxy environment variables
    all_proxy = os.environ.get('ALL_PROXY') or os.environ.get('all_proxy')
    https_proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    http_proxy = os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
    
    # Also check what getproxies() returns (used by gppt)
    detected_proxies = getproxies()
    
    proxy_env = all_proxy or https_proxy or http_proxy
    
    if proxy_env:
        print(f"[DEBUG]: Environment proxy variables found:", file=sys.stderr)
        if all_proxy:
            print(f"[DEBUG]:   ALL_PROXY/all_proxy: {all_proxy}", file=sys.stderr)
        if https_proxy:
            print(f"[DEBUG]:   HTTPS_PROXY/https_proxy: {https_proxy}", file=sys.stderr)
        if http_proxy:
            print(f"[DEBUG]:   HTTP_PROXY/http_proxy: {http_proxy}", file=sys.stderr)
        print(f"[DEBUG]: getproxies() detected: {detected_proxies}", file=sys.stderr)
        print(f"[DEBUG]: gppt will use: {detected_proxies.get('all') or detected_proxies.get('https') or detected_proxies.get('http') or 'none'}", file=sys.stderr)
    else:
        print("[DEBUG]: No proxy configured in environment variables.", file=sys.stderr)
        print("[DEBUG]: If login fails, set HTTPS_PROXY or ALL_PROXY environment variable.", file=sys.stderr)
    
    print("[DEBUG]: Initializing GetPixivToken (headless mode)...", file=sys.stderr)
    # According to gppt API: GetPixivToken(headless=True, username=username, password=password)
    g = GetPixivToken(headless=True, username=username, password=password)
    
    # Monkey patch to increase timeout from default 20 seconds to 2 minutes (120 seconds) for headless mode
    # Based on gppt's internal implementation
    original_wait_for_redirect = g._GetPixivToken__wait_for_redirect
    def patched_wait_for_redirect(self):
        WebDriverWait(self.driver, 120).until(EC.url_matches(f"^{REDIRECT_URI}"))
    g._GetPixivToken__wait_for_redirect = types.MethodType(patched_wait_for_redirect, g)
    print("[DEBUG]: Increased login timeout to 2 minutes (120 seconds) for headless mode", file=sys.stderr)
    
    print("[DEBUG]: GetPixivToken initialized, calling login()...", file=sys.stderr)
    print("[DEBUG]: This may take 20-30 seconds. Please wait...", file=sys.stderr)
    
    try:
        # According to gppt API: g.login(headless=None, username=None, password=None)
        # For headless mode with credentials, we can pass them here too, but they're already in constructor
        res = g.login()
        print("[DEBUG]: login() completed", file=sys.stderr)
        
        # According to gppt, res is a dict with 'response' key containing the full OAuth response
        # But res itself also contains the token fields directly
        # We'll use res.response if available, otherwise use res directly
        response_data = res.response if hasattr(res, 'response') and res.response else res
    except Exception as login_error:
        # Try to get more diagnostic information if available
        diagnostic_info = {}
        try:
            if hasattr(g, 'driver') and g.driver:
                try:
                    diagnostic_info['current_url'] = g.driver.current_url
                    diagnostic_info['page_title'] = g.driver.title
                except:
                    pass
        except:
            pass
        
        # Re-raise with diagnostic info if available
        if diagnostic_info:
            print(f"[DEBUG]: Diagnostic info: {diagnostic_info}", file=sys.stderr)
        raise login_error
    
    if response_data is None:
        print("ERROR: gppt.login() returned None", file=sys.stderr)
        print(json.dumps({"error": "gppt.login() returned None"}), file=sys.stdout)
        sys.exit(1)
    
    if not isinstance(response_data, dict):
        print(f"ERROR: gppt.login() returned unexpected type: {type(response_data)}", file=sys.stderr)
        print(json.dumps({"error": f"Unexpected return type: {type(response_data)}"}), file=sys.stdout)
        sys.exit(1)
    
    if 'access_token' not in response_data:
        print(f"ERROR: gppt.login() response missing access_token", file=sys.stderr)
        print(f"Response keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'N/A'}", file=sys.stderr)
        print(json.dumps({"error": "Response missing access_token", "keys": list(response_data.keys()) if isinstance(response_data, dict) else None}), file=sys.stdout)
        sys.exit(1)
    
    print("[+]: Success!", file=sys.stderr)
    # Output in gppt format (same as gppt CLI output)
    print(json.dumps(response_data, indent=2))
except json.JSONDecodeError as e:
    error_msg = f"JSON decode error: {str(e)}"
    print(error_msg, file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    print(json.dumps({"error": error_msg, "type": "JSONDecodeError", "details": str(e)}), file=sys.stdout)
    sys.exit(1)
except Exception as e:
    error_msg = f"ERROR: {str(e)}"
    print(error_msg, file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    
    # Provide additional context for common errors
    error_type = type(e).__name__
    error_str = str(e).lower()
    
    error_details = {
        "error": str(e),
        "type": error_type
    }
    
    # Add suggestions based on error type
    if "timeout" in error_str or "wait_for_redirect" in error_str:
        error_details["suggestion"] = "Login timeout. Possible causes: network issues, Pixiv restrictions, or incorrect credentials. Try using interactive mode or check proxy settings."
    elif "restricted" in error_str or "限制" in error_str:
        error_details["suggestion"] = "Login restricted by Pixiv. Try using interactive mode or wait before retrying."
    
    print(json.dumps(error_details), file=sys.stdout)
    sys.exit(1)
`;

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

/**
 * Convert gppt response to LoginInfo format
 * 
 * According to gppt API, the response structure is:
 * {
 *   "access_token": "...",
 *   "expires_in": 3600,
 *   "refresh_token": "...",
 *   "scope": "",
 *   "token_type": "bearer",
 *   "user": { ... }
 * }
 * 
 * Reference: https://github.com/eggplants/get-pixivpy-token
 */
function convertGpptResponseToLoginInfo(response: any): LoginInfo {
  // Handle both direct response and response.response format
  const data = response.response || response;
  
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    token_type: data.token_type || 'bearer',
    scope: data.scope || '',
    refresh_token: data.refresh_token,
    user: data.user,
    response: data, // Store the full response for reference
  };
}

/**
 * Run a Python script and return the result
 */
async function runPythonScript(script: string, timeoutMs: number = 120000): Promise<{
  success: boolean;
  stdout: string;
  stderr?: string;
  error?: string;
}> {
  return new Promise(async (resolve) => {
    // Add import sys at the beginning if not present
    const fullScript = script.includes('import sys') ? script : `import sys\n${script}`;
    
    // Get Python executable path
    let pythonPath: string;
    try {
      pythonPath = await getPythonExecutable();
    } catch (error) {
      resolve({
        success: false,
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    
    const python = spawn(pythonPath, ['-c', fullScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    // Set timeout with improved handling for interactive mode
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const timeoutMinutes = timeoutMs / 60000;
        const isInteractive = timeoutMs >= 300000; // 5 minutes or more
        
        // For interactive mode, use gentler termination to avoid closing browser abruptly
        if (isInteractive) {
          // First, try to gracefully terminate by sending SIGTERM
          // This gives Python script a chance to clean up browser properly
          python.kill('SIGTERM');
          
          // Wait a bit for graceful shutdown before force killing
          setTimeout(() => {
            try {
              // Only force kill if process is still running
              python.kill('SIGKILL');
            } catch (e) {
              // Process already terminated, ignore
            }
          }, 2000); // Give 2 seconds for graceful shutdown
        } else {
          // For non-interactive mode, terminate immediately
          python.kill('SIGTERM');
        }
        
        let errorMsg = `Python script timed out after ${timeoutMinutes} minutes.`;
        
        if (isInteractive) {
          errorMsg += `\n\nThis is interactive mode - you may need more time to complete login in the browser.\n` +
                     `Possible causes:\n` +
                     `  1. You haven't completed login in the browser window yet\n` +
                     `  2. Browser window was closed before login completed\n` +
                     `  3. Network connectivity issues (try setting HTTPS_PROXY)\n` +
                     `  4. Chrome/ChromeDriver not properly installed\n` +
                     `\nPlease try again and make sure to:\n` +
                     `  - Keep the browser window open until login is complete\n` +
                     `  - Complete the login process in the browser\n` +
                     `  - Wait for the "Login successful" message\n` +
                     `  - If browser is still open, you may need to close it manually`;
        } else {
          errorMsg += ` This may indicate:\n` +
                     `  1. Network connectivity issues (try setting HTTPS_PROXY)\n` +
                     `  2. Chrome/ChromeDriver not properly installed\n` +
                     `  3. Pixiv login page is slow to respond\n`;
        }
        
        errorMsg += `\nCheck the stderr output above for more details.`;
        
        resolve({
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim() || undefined,
          error: errorMsg,
        });
      }
    }, timeoutMs);

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      
      if (code === 0) {
        resolve({
          success: true,
          stdout: stdout.trim(),
          stderr: stderr.trim() || undefined,
        });
      } else {
        resolve({
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim() || undefined,
          error: stderr.trim() || `Process exited with code ${code}`,
        });
      }
    });

    python.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve({
        success: false,
        stdout: '',
        stderr: '',
        error: error.message,
      });
    });
  });
}

/**
 * Run a command and return the result
 */
async function runCommand(
  command: string,
  args: string[]
): Promise<{
  success: boolean;
  stdout?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          stdout: stdout.trim(),
        });
      } else {
        resolve({
          success: false,
          error: stderr.trim() || `Process exited with code ${code}`,
        });
      }
    });

    process.on('error', (error) => {
      resolve({
        success: false,
        error: error.message,
      });
    });
  });
}
