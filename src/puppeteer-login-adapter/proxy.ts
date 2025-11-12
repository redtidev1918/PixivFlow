/**
 * Proxy configuration for Puppeteer login adapter
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
















































