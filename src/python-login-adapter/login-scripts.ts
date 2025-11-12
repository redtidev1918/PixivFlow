/**
 * Login Scripts
 * 
 * Python scripts for interactive and headless login
 */

import { ProxyConfig, buildProxyEnvVars } from './proxy';

/**
 * Generate Python script for interactive login
 */
export function generateInteractiveLoginScript(proxyEnvVars: string): string {
  return `
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
}

/**
 * Generate Python script for headless login
 */
export function generateHeadlessLoginScript(
  usernameBase64: string,
  passwordBase64: string,
  proxyEnvVars: string
): string {
  return `
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
}




























