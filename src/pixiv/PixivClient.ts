import { setTimeout as delay } from 'node:timers/promises';
import { ProxyAgent } from 'undici';

import { StandaloneConfig, TargetConfig } from '../config';
import { logger } from '../logger';
import { NetworkError, is404Error } from '../utils/errors';
import { parseDateRange as parseDateRangeUtil, isDateInRange as isDateInRangeUtil } from '../utils/date-utils';
import { parsePixivDate } from '../utils/pixiv-utils';
import { sortPixivItems } from '../utils/pixiv-sort';
import { PixivAuth } from './AuthClient';
import { IPixivClient } from '../interfaces/IPixivClient';
import type { PixivUser, PixivIllust, PixivNovel, PixivIllustPage, PixivNovelTextResponse } from './types';
import { PixivApiCore } from './client/PixivApiCore';
import { IllustService } from './client/IllustService';
import { NovelService } from './client/NovelService';
import { MediaDownloadService } from './client/MediaDownloadService';
import { SearchService } from './client/SearchService';

// Re-export types for backward compatibility
export type { PixivUser, PixivIllust, PixivNovel, PixivIllustPage, PixivNovelTextResponse } from './types';

export class PixivClient implements IPixivClient {
  private readonly baseUrl = 'https://app-api.pixiv.net/';
  private readonly proxyAgent?: ProxyAgent;
  private readonly apiCore: PixivApiCore;
  private readonly illustService: IllustService;
  private readonly novelService: NovelService;
  private readonly mediaService: MediaDownloadService;
  private readonly searchService: SearchService;

  constructor(private readonly auth: PixivAuth, private readonly config: StandaloneConfig) {
    // Setup proxy agent if configured
    // Note: This proxyAgent is currently unused as all requests go through PixivApiCore
    // Keeping it for potential future use or backward compatibility
    const proxy = this.config.network?.proxy;
    if (proxy?.enabled && proxy.host && proxy.port) {
      const protocol: string = proxy.protocol || 'http';
      
      const auth = proxy.username && proxy.password 
        ? `${proxy.username}:${proxy.password}@` 
        : '';
      const proxyUrl = `${protocol}://${auth}${proxy.host}:${proxy.port}`;
      
      // Only create ProxyAgent for HTTP/HTTPS protocols (SOCKS is handled by PixivApiCore)
      if (protocol === 'http' || protocol === 'https') {
        this.proxyAgent = new ProxyAgent(proxyUrl);
        logger.info('Proxy enabled', { 
          protocol, 
          host: proxy.host, 
          port: proxy.port 
        });
      } else if (protocol === 'socks4' || protocol === 'socks5' || protocol === 'socks') {
        // SOCKS proxy will be handled by PixivApiCore using socks-proxy-agent
        logger.info('SOCKS proxy configured (will be handled by PixivApiCore)', {
          protocol,
          host: proxy.host,
          port: proxy.port,
        });
      } else {
        logger.warn('Unknown proxy protocol, skipping ProxyAgent creation', {
          protocol,
          host: proxy.host,
          port: proxy.port,
        });
      }
    }

    // Initialize PixivApiCore for HTTP concerns (retry/timeout/rate-limit/proxy)
    const network = this.config.network ?? {};
    const proxyUrlStr = (() => {
      const p = this.config.network?.proxy;
      if (p?.enabled && p.host && p.port) {
        const protocol = p.protocol || 'http';
        const auth = p.username && p.password ? `${p.username}:${p.password}@` : '';
        return `${protocol}://${auth}${p.host}:${p.port}`;
      }
      return undefined;
    })();
    this.apiCore = new PixivApiCore({
      baseUrl: 'https://app-api.pixiv.net',
      userAgent: this.config.pixiv.userAgent,
      defaultTimeoutMs: network.timeoutMs ?? 30_000,
      maxRetries: network.retries ?? 10,
      rateLimitPerSecond: undefined,
      proxyUrl: proxyUrlStr,
      getAccessToken: () => this.auth.getAccessToken(),
    });

    // Initialize domain services
    this.illustService = new IllustService(this.apiCore);
    this.novelService = new NovelService(this.apiCore);
    this.mediaService = new MediaDownloadService(this.apiCore);
    this.searchService = new SearchService(this.apiCore);
  }

  /**
   * Safely parse date string to timestamp
   * Returns 0 for invalid dates to ensure consistent sorting
   * @deprecated Use parsePixivDate from pixiv-utils instead
   */
  private parseDate(dateString: string | undefined | null): number {
    return parsePixivDate(dateString);
  }

  /**
   * Parse date range from target config
   * Returns { startDate, endDate } as Date objects, or null if invalid
   * Validates that startDate <= endDate
   */
  private parseDateRange(target: TargetConfig): { startDate: Date | null; endDate: Date | null } | null {
    return parseDateRangeUtil(target.startDate, target.endDate);
  }

  /**
   * Check if item date is within the specified range
   * Handles invalid dates gracefully
   */
  private isDateInRange(itemDate: Date | null, startDate: Date | null, endDate: Date | null): boolean {
    return isDateInRangeUtil(itemDate, startDate, endDate);
  }



  /**
   * Search illustrations using target config
   * Implements IPixivClient interface
   */
  public async searchIllustrations(target: TargetConfig): Promise<PixivIllust[]> {
    const requestDelay = this.config.download?.requestDelay ?? 3000;
    return this.searchService.searchIllustrations(target, requestDelay);
  }

  /**
   * Get current user information
   * Implements IPixivClient interface
   */
  public async getUser(): Promise<PixivUser> {
    const url = this.createRequestUrl('v1/user/profile', {});
    logger.debug('Fetching user profile');
    try {
      const response = await this.request<{ user_profile: { user: PixivUser } }>(url, { method: 'GET' });
      return response.user_profile.user;
    } catch (error) {
      logger.error('Failed to get user profile', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get illustration details by ID
   * Implements IPixivClient interface
   */
  public async getIllustration(id: number): Promise<PixivIllust> {
    return this.illustService.getIllustration(id);
  }

  /**
   * Get novel details by ID
   * Implements IPixivClient interface
   */
  public async getNovel(id: number): Promise<PixivNovel> {
    return this.getNovelDetail(id);
  }

  /**
   * Get user illustrations
   * Implements IPixivClient interface
   */
  public async getUserIllustrations(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<PixivIllust[]> {
    return this.illustService.getUserIllustrations(userId, options);
  }

  /**
   * Get user novels
   * Implements IPixivClient interface
   */
  public async getUserNovels(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<PixivNovel[]> {
    return this.novelService.getUserNovels(userId, options);
  }
  
  /**
   * Search illustrations for a single tag (internal method)
   */
  // Search implementation moved to SearchService

  /**
   * Search novels using target config
   * Implements IPixivClient interface
   */
  public async searchNovels(target: TargetConfig): Promise<PixivNovel[]> {
    const requestDelay = this.config.download?.requestDelay ?? 3000;
    return this.searchService.searchNovels(target, requestDelay);
  }
  
  /**
   * Search novels for a single tag (internal method)
   */
  // Search implementation moved to SearchService

  /**
   * Get ranking illustrations
   * @param mode Ranking mode (day, week, month, etc.)
   * @param date Date in YYYY-MM-DD format (optional, defaults to today)
   * @param limit Maximum number of results
   */
  public async getRankingIllustrations(
    mode: string = 'day',
    date?: string,
    limit?: number
  ): Promise<PixivIllust[]> {
    return this.illustService.getRankingIllustrations(
      mode as any,
      date,
      limit
    );
  }

  /**
   * Get ranking novels
   * @param mode Ranking mode (day, week, month, etc.)
   * @param date Date in YYYY-MM-DD format (optional, defaults to today)
   * @param limit Maximum number of results
   */
  public async getRankingNovels(
    mode: string = 'day',
    date?: string,
    limit?: number
  ): Promise<PixivNovel[]> {
    return this.novelService.getRankingNovels(
      mode as any,
      date,
      limit
    );
  }

  /**
   * Get illustration detail with tags for filtering
   */
  public async getIllustDetailWithTags(illustId: number): Promise<{
    illust: PixivIllust;
    tags: Array<{ name: string; translated_name?: string }>;
  }> {
    return this.illustService.getIllustDetailWithTags(illustId);
  }

  /**
   * Get novel detail with tags for filtering
   */
  public async getNovelDetailWithTags(novelId: number): Promise<{
    novel: PixivNovel;
    tags: Array<{ name: string; translated_name?: string }>;
  }> {
    return this.novelService.getNovelDetailWithTags(novelId);
  }

  public async getIllustDetail(illustId: number): Promise<PixivIllust> {
    return this.illustService.getIllustration(illustId);
  }

  public async getNovelDetail(novelId: number): Promise<PixivNovel> {
    return this.novelService.getNovelDetail(novelId);
  }

  /**
   * Get novel text content
   * Implements IPixivClient interface
   */
  public async getNovelText(novelId: number): Promise<PixivNovelTextResponse> {
    return this.novelService.getNovelText(novelId, { userAgent: this.config.pixiv.userAgent });
  }

  /**
   * Get all novels in a series
   */
  public async getNovelSeries(seriesId: number): Promise<PixivNovel[]> {
    return this.novelService.getNovelSeries(seriesId);
  }

  public async downloadImage(originalUrl: string): Promise<ArrayBuffer> {
    return this.mediaService.downloadImage(originalUrl, this.config.pixiv.userAgent);
  }

  // fetchBinary is removed; MediaDownloadService handles binary downloads

  private createRequestUrl(path: string, params: Record<string, string>): string {
    const url = new URL(path, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
    return url.toString();
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    // Preserve existing headers (App-OS info) while delegating to ApiCore
    const headers: Record<string, string> = {
      'App-OS': 'ios',
      'App-OS-Version': '14.6',
      'App-Version': '7.13.3',
      Referer: 'https://app-api.pixiv.net/',
      ...(init.headers as Record<string, string> | undefined),
    };
    return this.apiCore.request<T>(url, { ...init, headers });
  }
}

