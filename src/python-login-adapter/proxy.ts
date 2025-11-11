/**
 * Proxy Configuration
 * 
 * Handles proxy configuration for Python login adapter
 */

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
export function buildProxyUrl(proxy: ProxyConfig): string {
  const { protocol, host, port, username, password } = proxy;
  let proxyUrl = `${protocol}://`;
  if (username && password) {
    proxyUrl += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
  }
  proxyUrl += `${host}:${port}`;
  return proxyUrl;
}

/**
 * Build proxy environment variables string for Python script
 */
export function buildProxyEnvVars(proxy?: ProxyConfig): string {
  if (!proxy || !proxy.enabled) {
    return '';
  }

  const proxyUrl = buildProxyUrl(proxy);
  return `
import os
proxy_url = "${proxyUrl}"
os.environ['HTTPS_PROXY'] = proxy_url
os.environ['HTTP_PROXY'] = proxy_url
os.environ['ALL_PROXY'] = proxy_url
print(f"[DEBUG]: Proxy configured: {proxy_url}", file=sys.stderr)
`;
}













