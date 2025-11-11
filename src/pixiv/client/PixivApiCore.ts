import { URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ProxyAgent } from 'undici';
import { SocksProxyAgent } from 'socks-proxy-agent';
import axios, { AxiosInstance } from 'axios';
import { logger } from '../../logger';
import { NetworkError, is404Error } from '../../utils/errors';

export interface PixivApiCoreOptions {
  baseUrl?: string;
  userAgent?: string;
  defaultTimeoutMs?: number;
  maxRetries?: number;
  rateLimitPerSecond?: number;
  proxyUrl?: string;
  /**
   * Optional: Provide an access token for authenticated requests.
   * If provided, it will be attached as Authorization: Bearer <token>.
   */
  getAccessToken?: () => Promise<string> | string;
}

export interface PixivApiErrorBody {
  message?: string;
  reason?: string;
  errors?: unknown;
  status?: number;
}

export class PixivApiCore {
  private readonly baseUrl: string;
  private readonly userAgent: string | undefined;
  private readonly defaultTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly rateLimitPerSecond: number | undefined;
  private readonly proxyUrl: URL | undefined;
  private readonly getAccessToken?: () => Promise<string> | string;
  private readonly proxyAgent?: ProxyAgent;
  private readonly socksAgent?: SocksProxyAgent;
  private readonly useAxiosForProxy: boolean;
  private readonly axiosInstance?: AxiosInstance;

  constructor(options: PixivApiCoreOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://app-api.pixiv.net';
    this.userAgent = options.userAgent;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.rateLimitPerSecond = options.rateLimitPerSecond;
    this.proxyUrl = options.proxyUrl ? new URL(options.proxyUrl) : undefined;
    this.getAccessToken = options.getAccessToken;
    
    // Determine if we need to use axios for SOCKS proxy
    let useAxios = false;
    if (this.proxyUrl) {
      const protocol = this.proxyUrl.protocol.replace(':', '').toLowerCase();
      
      // Check if it's a SOCKS protocol
      if (protocol === 'socks4' || protocol === 'socks5' || protocol === 'socks') {
        // Use socks-proxy-agent for SOCKS protocols
        this.socksAgent = new SocksProxyAgent(this.proxyUrl.toString());
        useAxios = true;
        logger.info('SOCKS proxy enabled', {
          protocol,
          host: this.proxyUrl.hostname,
          port: this.proxyUrl.port,
        });
      } else if (protocol === 'http' || protocol === 'https') {
        // Use undici ProxyAgent for HTTP/HTTPS protocols
        this.proxyAgent = new ProxyAgent(this.proxyUrl.toString());
        logger.info('HTTP/HTTPS proxy enabled', {
          protocol,
          host: this.proxyUrl.hostname,
          port: this.proxyUrl.port,
        });
      } else {
        logger.warn('Unknown proxy protocol, attempting to use with undici ProxyAgent', {
          protocol,
          proxyUrl: this.proxyUrl.toString(),
        });
        try {
          this.proxyAgent = new ProxyAgent(this.proxyUrl.toString());
        } catch (error) {
          const errorMessage = `Failed to create ProxyAgent with protocol '${protocol}'. ` +
            `Supported protocols: 'http', 'https', 'socks4', 'socks5'.`;
          logger.error(errorMessage, {
            protocol,
            proxyUrl: this.proxyUrl.toString(),
            error: error instanceof Error ? error.message : String(error),
          });
          throw new Error(errorMessage);
        }
      }
    }
    
    this.useAxiosForProxy = useAxios;
    
    // Create axios instance for SOCKS proxy support
    if (useAxios && this.socksAgent) {
      this.axiosInstance = axios.create({
        httpAgent: this.socksAgent,
        httpsAgent: this.socksAgent,
        timeout: this.defaultTimeoutMs,
      });
    }
  }

  // Minimal request method signature; implementation will be added during wiring.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request<T = any>(path: string, init?: RequestInit): Promise<T> {
    const url = this.resolveUrl(path);
    let lastError: unknown;
    // maxRetries is the number of retries, so total attempts = maxRetries + 1 (initial attempt)
    const maxAttempts = Math.max(1, this.maxRetries + 1);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.defaultTimeoutMs);
        try {
          const headers: Record<string, string> = {
            ...(this.userAgent ? { 'User-Agent': this.userAgent } : {}),
            Referer: 'https://app-api.pixiv.net/',
            ...(init?.headers as Record<string, string> | undefined),
          };
          // Authorization header
          if (this.getAccessToken) {
            const token = await Promise.resolve(this.getAccessToken());
            if (token) {
              headers.Authorization = `Bearer ${token}`;
            }
          }

          // Basic client-side rate limiting
          const waitMs = this.calculateRateLimitWaitTime();
          if (waitMs > 0) {
            await delay(waitMs);
          }

          let res: Response;
          if (this.useAxiosForProxy && this.axiosInstance) {
            // Use axios for SOCKS proxy
            const axiosResponse = await this.axiosInstance.request({
              url,
              method: (init?.method as any) || 'GET',
              headers,
              data: init?.body,
              signal: controller.signal,
              responseType: 'json',
            });
            // Convert axios response to fetch-like Response
            res = new Response(JSON.stringify(axiosResponse.data), {
              status: axiosResponse.status,
              statusText: axiosResponse.statusText,
              headers: axiosResponse.headers as any,
            }) as unknown as Response;
          } else {
            // Use undici fetch for HTTP/HTTPS proxy or no proxy
            const fetchOptions: RequestInit = {
              ...init,
              headers,
              signal: controller.signal,
            };
            if (this.proxyAgent) {
              (fetchOptions as any).dispatcher = this.proxyAgent;
            }
            res = await fetch(url, fetchOptions) as unknown as Response;
          }

          return await this.processResponse<T>(res, url, attempt);
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;

        // Do not retry 404
        if (is404Error(error)) {
          throw error;
        }

        // If last attempt, throw
        if (attempt >= maxAttempts - 1) {
          throw error;
        }

        const wait = this.backoffWaitMs(error, attempt);
        
        // Extract detailed error information
        const errorInfo: Record<string, unknown> = {
          url,
          attempt: attempt + 1,
          maxAttempts,
          waitSec: Math.round(wait / 1000),
        };
        
        if (error instanceof Error) {
          errorInfo.error = error.message;
          errorInfo.errorType = error.name;
          errorInfo.errorCode = (error as any).code;
          // Include cause if available
          if (error.cause instanceof Error) {
            errorInfo.cause = error.cause.message;
            errorInfo.causeType = error.cause.name;
            errorInfo.causeCode = (error.cause as any).code;
          }
          // For AbortError (timeout), add timeout info
          if (error.name === 'AbortError') {
            errorInfo.reason = 'Request timeout';
            errorInfo.timeoutMs = this.defaultTimeoutMs;
          }
        } else {
          errorInfo.error = String(error);
        }
        
        logger.warn('PixivApiCore request failed, will retry', errorInfo);
        await delay(wait);
      }
    }

    // Should not reach here
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new NetworkError(`Request to ${url} failed: ${message}`, url, lastError instanceof Error ? lastError : undefined);
  }

  async downloadBinary(pathOrUrl: string, init?: RequestInit): Promise<ArrayBuffer> {
    const url = this.resolveUrl(pathOrUrl);
    let lastError: unknown;
    // maxRetries is the number of retries, so total attempts = maxRetries + 1 (initial attempt)
    const maxAttempts = Math.max(1, this.maxRetries + 1);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.defaultTimeoutMs);
        try {
          const headers: Record<string, string> = {
            ...(this.userAgent ? { 'User-Agent': this.userAgent } : {}),
            Referer: 'https://app-api.pixiv.net/',
            ...(init?.headers as Record<string, string> | undefined),
          };
          if (this.getAccessToken) {
            const token = await Promise.resolve(this.getAccessToken());
            if (token) {
              headers.Authorization = `Bearer ${token}`;
            }
          }

          const waitMs = this.calculateRateLimitWaitTime();
          if (waitMs > 0) {
            await delay(waitMs);
          }

          if (this.useAxiosForProxy && this.axiosInstance) {
            // Use axios for SOCKS proxy
            const axiosResponse = await this.axiosInstance.request({
              url,
              method: (init?.method as any) || 'GET',
              headers,
              data: init?.body,
              signal: controller.signal,
              responseType: 'arraybuffer',
            });
            
            if (axiosResponse.status < 200 || axiosResponse.status >= 300) {
              const body = typeof axiosResponse.data === 'string' 
                ? axiosResponse.data 
                : Buffer.from(axiosResponse.data).toString('utf-8');
              throw new NetworkError(
                `Pixiv API binary error: ${axiosResponse.status} ${axiosResponse.statusText}${body ? ` - ${body}` : ''}`,
                url
              );
            }
            
            return axiosResponse.data as ArrayBuffer;
          } else {
            // Use undici fetch for HTTP/HTTPS proxy or no proxy
            const fetchOptions: RequestInit = {
              method: 'GET',
              ...init,
              headers,
              signal: controller.signal,
            };
            if (this.proxyAgent) {
              (fetchOptions as any).dispatcher = this.proxyAgent;
            }

            const res = await fetch(url, fetchOptions) as unknown as Response;
            if (!res.ok) {
              const body = await this.tryReadText(res);
              throw new NetworkError(
                `Pixiv API binary error: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`,
                url
              );
            }
            return await res.arrayBuffer();
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
        if (is404Error(error)) {
          throw error;
        }
        if (attempt >= maxAttempts - 1) {
          throw error;
        }
        const wait = this.backoffWaitMs(error, attempt);
        
        // Extract detailed error information
        const errorInfo: Record<string, unknown> = {
          url,
          attempt: attempt + 1,
          maxAttempts,
          waitSec: Math.round(wait / 1000),
        };
        
        if (error instanceof Error) {
          errorInfo.error = error.message;
          errorInfo.errorType = error.name;
          errorInfo.errorCode = (error as any).code;
          // Include cause if available
          if (error.cause instanceof Error) {
            errorInfo.cause = error.cause.message;
            errorInfo.causeType = error.cause.name;
            errorInfo.causeCode = (error.cause as any).code;
          }
          // For AbortError (timeout), add timeout info
          if (error.name === 'AbortError') {
            errorInfo.reason = 'Request timeout';
            errorInfo.timeoutMs = this.defaultTimeoutMs;
          }
        } else {
          errorInfo.error = String(error);
        }
        
        logger.warn('PixivApiCore binary download failed, will retry', errorInfo);
        await delay(wait);
      }
    }

    // Provide detailed error message for final failure
    let errorMessage = `Binary download from ${url} failed after ${maxAttempts} attempts`;
    if (lastError instanceof Error) {
      errorMessage += `: ${lastError.message}`;
      if (lastError.name === 'AbortError') {
        errorMessage += ` (timeout after ${this.defaultTimeoutMs}ms)`;
      }
      const errorCode = (lastError as any).code;
      if (errorCode) {
        errorMessage += ` [${errorCode}]`;
      }
    } else {
      errorMessage += `: ${String(lastError)}`;
    }
    throw new NetworkError(errorMessage, url, lastError instanceof Error ? lastError : undefined);
  }

  calculateRateLimitWaitTime(): number {
    if (!this.rateLimitPerSecond || this.rateLimitPerSecond <= 0) return 0;
    return Math.ceil(1000 / this.rateLimitPerSecond);
  }

  async processResponse<T>(response: Response, url: string, attempt: number): Promise<T> {
    // 401: likely token issue
    if (response.status === 401) {
      const body = await this.tryReadText(response);
      throw new NetworkError(
        `Pixiv API error: 401 Unauthorized${body ? ` - ${body}` : ''}`,
        url
      );
    }

    // 404: not found, do not retry
    if (response.status === 404) {
      const body = await this.tryReadText(response);
      throw new NetworkError(
        `Pixiv API error: 404 Not Found${body ? ` - ${body}` : ''}`,
        url
      );
    }

    // 429: rate limited
    if (response.status === 429) {
      const body = await this.tryReadText(response);
      const retryAfter = response.headers.get('Retry-After');
      const explicitWaitMs = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, 60_000) : undefined;
      throw new NetworkError(
        `Pixiv API error: 429 Rate Limit${body ? ` - ${body}` : ''}`,
        url,
        undefined,
        { isRateLimit: true, waitTime: explicitWaitMs ?? this.exponentialBackoffMs(attempt) }
      );
    }

    if (!response.ok) {
      const body = await this.tryReadText(response);
      throw new NetworkError(
        `Pixiv API error: ${response.status} ${response.statusText}${body ? ` - ${body}` : ''}`,
        url
      );
    }

    return (await response.json()) as T;
  }

  private resolveUrl(pathOrUrl: string): string {
    try {
      // If it's already an absolute URL, return as is
      const maybeUrl = new URL(pathOrUrl);
      return maybeUrl.toString();
    } catch {
      // Not a full URL, resolve against base
      const withLeadingSlash = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
      return new URL(withLeadingSlash, this.baseUrl).toString();
    }
  }

  private exponentialBackoffMs(attempt: number): number {
    // 1s, 2s, 4s, 8s ... capped at 10 minutes
    return Math.min(1000 * Math.pow(2, attempt), 600_000);
    }

  private backoffWaitMs(error: unknown, attempt: number): number {
    const isRateLimit = error instanceof NetworkError && error.isRateLimit === true;
    if (isRateLimit) {
      const wait = (error as NetworkError).waitTime ?? this.exponentialBackoffMs(attempt);
      return wait;
    }
    return Math.min(1000 * (attempt + 1), 5000);
  }

  private async tryReadText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }
}
