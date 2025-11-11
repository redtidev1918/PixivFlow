/**
 * Environment variable and environment detection utilities
 */

import { existsSync, readFileSync } from 'node:fs';
import { logger } from '../logger';
import { StandaloneConfig } from './types';
import { DEFAULT_CONFIG } from './defaults';

/**
 * Apply environment variable overrides to configuration
 */
export function applyEnvironmentOverrides(config: Partial<StandaloneConfig>): Partial<StandaloneConfig> {
  const overridden: Partial<StandaloneConfig> = { ...config };

  // Override Pixiv credentials from environment
  if (process.env.PIXIV_REFRESH_TOKEN) {
    if (!overridden.pixiv) {
      overridden.pixiv = {
        clientId: '',
        clientSecret: '',
        deviceToken: '',
        refreshToken: process.env.PIXIV_REFRESH_TOKEN,
        userAgent: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
      };
    } else {
      overridden.pixiv.refreshToken = process.env.PIXIV_REFRESH_TOKEN;
    }
  }
  if (process.env.PIXIV_CLIENT_ID) {
    if (!overridden.pixiv) {
      overridden.pixiv = {
        clientId: process.env.PIXIV_CLIENT_ID,
        clientSecret: '',
        deviceToken: '',
        refreshToken: '',
        userAgent: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
      };
    } else {
      overridden.pixiv.clientId = process.env.PIXIV_CLIENT_ID;
    }
  }
  if (process.env.PIXIV_CLIENT_SECRET) {
    if (!overridden.pixiv) {
      overridden.pixiv = {
        clientId: '',
        clientSecret: process.env.PIXIV_CLIENT_SECRET,
        deviceToken: '',
        refreshToken: '',
        userAgent: 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)',
      };
    } else {
      overridden.pixiv.clientSecret = process.env.PIXIV_CLIENT_SECRET;
    }
  }

  // Override storage paths
  if (process.env.PIXIV_DOWNLOAD_DIR) {
    if (!overridden.storage) {
      overridden.storage = {};
    }
    overridden.storage.downloadDirectory = process.env.PIXIV_DOWNLOAD_DIR;
  }
  if (process.env.PIXIV_DATABASE_PATH) {
    if (!overridden.storage) {
      overridden.storage = {};
    }
    overridden.storage.databasePath = process.env.PIXIV_DATABASE_PATH;
  }
  if (process.env.PIXIV_ILLUSTRATION_DIR) {
    if (!overridden.storage) {
      overridden.storage = {};
    }
    overridden.storage.illustrationDirectory = process.env.PIXIV_ILLUSTRATION_DIR;
  }
  if (process.env.PIXIV_NOVEL_DIR) {
    if (!overridden.storage) {
      overridden.storage = {};
    }
    overridden.storage.novelDirectory = process.env.PIXIV_NOVEL_DIR;
  }

  // Override log level
  if (process.env.PIXIV_LOG_LEVEL) {
    const logLevel = process.env.PIXIV_LOG_LEVEL.toLowerCase();
    if (['debug', 'info', 'warn', 'error'].includes(logLevel)) {
      overridden.logLevel = logLevel as 'debug' | 'info' | 'warn' | 'error';
    }
  }

  // Override scheduler enabled
  if (process.env.PIXIV_SCHEDULER_ENABLED !== undefined) {
    if (!overridden.scheduler) {
      overridden.scheduler = {
        enabled: process.env.PIXIV_SCHEDULER_ENABLED.toLowerCase() === 'true',
        cron: DEFAULT_CONFIG.scheduler.cron,
      };
    } else {
      overridden.scheduler.enabled = process.env.PIXIV_SCHEDULER_ENABLED.toLowerCase() === 'true';
    }
  }

  // Override proxy from environment variables
  // Priority: all_proxy > https_proxy > http_proxy
  const proxyUrl = process.env.all_proxy || process.env.ALL_PROXY || 
                   process.env.https_proxy || process.env.HTTPS_PROXY ||
                   process.env.http_proxy || process.env.HTTP_PROXY;
  
  if (proxyUrl && (!overridden.network?.proxy?.enabled)) {
    try {
      const url = new URL(proxyUrl);
      const protocol = url.protocol.replace(':', '').toLowerCase();
      
      // Map common protocols
      let mappedProtocol: 'http' | 'https' | 'socks4' | 'socks5' = 'http';
      if (protocol === 'socks5' || protocol === 'socks') {
        mappedProtocol = 'socks5';
      } else if (protocol === 'socks4') {
        mappedProtocol = 'socks4';
      } else if (protocol === 'https') {
        mappedProtocol = 'https';
      } else {
        mappedProtocol = 'http';
      }
      
      if (!overridden.network) {
        overridden.network = {};
      }
      
      overridden.network.proxy = {
        enabled: true,
        host: url.hostname,
        port: parseInt(url.port || (protocol.startsWith('socks') ? '1080' : '8080'), 10),
        protocol: mappedProtocol,
        username: url.username || undefined,
        password: url.password || undefined,
      };
      
      logger.info('Proxy configured from environment variable', {
        protocol: mappedProtocol,
        host: url.hostname,
        port: overridden.network.proxy.port,
        note: mappedProtocol === 'socks4' || mappedProtocol === 'socks5' 
          ? 'SOCKS proxy is supported via socks-proxy-agent'
          : undefined,
      });
    } catch (error) {
      logger.warn('Failed to parse proxy URL from environment variable', {
        proxyUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return overridden;
}

/**
 * Detect if running in Docker container
 */
export function isRunningInDocker(): boolean {
  // Method 1: Check for .dockerenv file (most reliable)
  if (existsSync('/.dockerenv')) {
    return true;
  }

  // Method 2: Check cgroup (Linux)
  try {
    if (existsSync('/proc/self/cgroup')) {
      const cgroup = readFileSync('/proc/self/cgroup', 'utf-8');
      if (cgroup.includes('docker') || cgroup.includes('containerd')) {
        return true;
      }
    }
  } catch {
    // Ignore errors
  }

  // Method 3: Check environment variable (set by docker-compose.yml)
  if (process.env.PIXIV_SKIP_AUTO_LOGIN === 'true' && process.env.NODE_ENV === 'production') {
    // This is a hint but not definitive
    // We'll use it as a secondary check
  }

  return false;
}

/**
 * Auto-adjust proxy configuration based on running environment
 * - If in Docker and proxy host is 127.0.0.1, change to host.docker.internal
 * - If in local environment and proxy host is host.docker.internal, change to 127.0.0.1
 */
export function adjustProxyForEnvironment(config: Partial<StandaloneConfig>): Partial<StandaloneConfig> {
  const adjusted = { ...config };
  const isDocker = isRunningInDocker();

  if (!adjusted.network?.proxy?.enabled || !adjusted.network.proxy.host) {
    return adjusted;
  }

  const proxy = adjusted.network.proxy;
  const currentHost = proxy.host;

  // If running in Docker and proxy points to localhost, change to host.docker.internal
  if (isDocker && (currentHost === '127.0.0.1' || currentHost === 'localhost')) {
    adjusted.network.proxy.host = 'host.docker.internal';
    logger.info('Auto-adjusted proxy host for Docker environment', {
      old: currentHost,
      new: 'host.docker.internal',
      port: proxy.port,
    });
  }
  // If running locally and proxy points to host.docker.internal, change to 127.0.0.1
  else if (!isDocker && currentHost === 'host.docker.internal') {
    adjusted.network.proxy.host = '127.0.0.1';
    logger.info('Auto-adjusted proxy host for local environment', {
      old: 'host.docker.internal',
      new: '127.0.0.1',
      port: proxy.port,
    });
  }

  return adjusted;
}















