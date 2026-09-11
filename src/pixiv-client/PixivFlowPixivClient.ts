import {
  PixivClient as KitPixivClient,
  RateLimitGate,
  type AccessTokenProvider,
  type KitLogger,
  type PixivIllust,
  type PixivNovel,
  type PixivNovelTextResponse,
  type PixivTag,
  type RateLimitStateStore,
} from '@redtidev/pixiv-client';

import type { StandaloneConfig, TargetConfig } from '../config';
import type { IPixivClient } from '../interfaces/IPixivClient';
import { asIllustRankingMode, asNovelRankingMode } from './query-mapper';
import { TargetSearchRunner } from './TargetSearchRunner';

export interface PixivFlowPixivClientOptions {
  auth: AccessTokenProvider;
  config: StandaloneConfig;
  logger?: KitLogger;
  /**
   * Persistent gate state (SQLite). When omitted the kit keeps state in
   * memory (process-local). PixivFlow wires an SQLite adapter so a deploy
   * restart does not forget an active Pixiv cooldown.
   */
  rateLimitStateStore?: RateLimitStateStore;
  /** Logical scope inside the state store (e.g. account/refresh-token id). */
  rateLimitScope?: string;
}

/**
 * Compatibility adapter: the PixivFlow-specific class that the whole product
 * already depends on ({@link IPixivClient}), now implemented entirely by
 * composing the independent kit.
 *
 * Responsibilities kept HERE (product): TargetConfig queries, tag search
 * options, inter-page requestDelay, UA selection, ranking date.
 * Responsibilities delegated to the kit: HTTP, auth headers, retries,
 * pacing, 429 cooldown, circuit breaker, coalescing, proxy, typed errors.
 */
export class PixivFlowPixivClient implements IPixivClient {
  private readonly kit: KitPixivClient;
  private readonly searchRunner: TargetSearchRunner;
  private readonly config: StandaloneConfig;

  constructor(options: PixivFlowPixivClientOptions) {
    this.config = options.config;
    const network = options.config.network ?? {};

    const proxy = options.config.network?.proxy;
    const proxyOptions = proxy?.enabled && proxy.host && proxy.port
      ? {
          protocol: (proxy.protocol ?? 'http').toLowerCase() as 'http' | 'https' | 'socks' | 'socks4' | 'socks5',
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password,
        }
      : undefined;

    // Backward-compatible operator override. New safe DEFAULT (1000ms pacing,
    // 60s initial cooldown) applies unless the deployment sets
    // network.requestPacingMs explicitly (including 0 to opt out of pacing).
    const networkExtra = network as { requestPacingMs?: number };
    const pacingConfigured = Object.prototype.hasOwnProperty.call(network, 'requestPacingMs');

    this.kit = new KitPixivClient({
      auth: options.auth,
      baseUrl: 'https://app-api.pixiv.net',
      userAgent: options.config.pixiv.userAgent,
      timeoutMs: network.timeoutMs ?? 30_000,
      retries: network.retries ?? 2,
      proxy: proxyOptions,
      rateLimit: {
        ...(pacingConfigured ? { minIntervalMs: networkExtra.requestPacingMs } : {}),
        stateStore: options.rateLimitStateStore,
        scope: options.rateLimitScope,
      },
      logger: options.logger,
    });
    this.searchRunner = new TargetSearchRunner(this.kit);
  }

  /** The underlying independent kit client (advanced/embedding use). */
  getKit(): KitPixivClient {
    return this.kit;
  }

  /** Shared 429 gate, exposed for doctor/health/monitor. */
  getRateLimiter(): RateLimitGate {
    return this.kit.getRateLimitGate();
  }

  getRateLimitStatus() {
    return this.kit.getRateLimitStatus();
  }

  // -- IPixivClient surface ---------------------------------------------------

  searchIllustrations(target: TargetConfig): Promise<PixivIllust[]> {
    return this.searchIllustrationsInternal(target);
  }

  private searchIllustrationsInternal(target: TargetConfig, signal?: AbortSignal): Promise<PixivIllust[]> {
    const requestDelay = this.config.download?.requestDelay ?? 500;
    return this.searchRunner.searchIllustrations(target, requestDelay, signal);
  }

  searchNovels(target: TargetConfig): Promise<PixivNovel[]> {
    return this.searchNovelsInternal(target);
  }

  private searchNovelsInternal(target: TargetConfig, signal?: AbortSignal): Promise<PixivNovel[]> {
    const requestDelay = this.config.download?.requestDelay ?? 500;
    return this.searchRunner.searchNovels(target, requestDelay, signal);
  }

  getTagAutocomplete(seed: string, options: { signal?: AbortSignal } = {}): Promise<PixivTag[]> {
    return this.kit.tags.autocomplete(seed, options.signal);
  }

  searchIllustrationsForTags(
    seed: string,
    limit: number,
    options: { startDate?: string; endDate?: string; includeR18?: boolean; signal?: AbortSignal } = {}
  ): Promise<PixivIllust[]> {
    return this.searchIllustrationsInternal({
      type: 'illustration',
      tag: seed,
      searchTarget: 'partial_match_for_tags',
      sort: 'date_desc',
      limit,
      startDate: options.startDate,
      endDate: options.endDate,
      r18: options.includeR18,
    }, options.signal);
  }

  searchNovelsForTags(
    seed: string,
    limit: number,
    options: { startDate?: string; endDate?: string; includeR18?: boolean; signal?: AbortSignal } = {}
  ): Promise<PixivNovel[]> {
    return this.searchNovelsInternal({
      type: 'novel',
      tag: seed,
      searchTarget: 'partial_match_for_tags',
      sort: 'date_desc',
      limit,
      startDate: options.startDate,
      endDate: options.endDate,
      r18: options.includeR18,
    }, options.signal);
  }

  getIllustration(id: number): Promise<PixivIllust> {
    return this.kit.illustrations.get(id);
  }

  getNovel(id: number): Promise<PixivNovel> {
    return this.kit.novels.detailCompatible(id);
  }

  getUserIllustrations(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<PixivIllust[]> {
    return this.kit.illustrations.listByUser(userId, options);
  }

  getUserNovels(userId: string, options?: { limit?: number; offset?: number }): Promise<PixivNovel[]> {
    return this.kit.novels.listByUser(userId, options);
  }

  getRankingIllustrations(mode: string = 'day', date?: string, limit?: number): Promise<PixivIllust[]> {
    return this.kit.illustrations.ranking(asIllustRankingMode(mode), { date, limit });
  }

  getRankingNovels(mode: string = 'day', date?: string, limit?: number): Promise<PixivNovel[]> {
    return this.kit.novels.ranking(asNovelRankingMode(mode), { date, limit });
  }

  getIllustDetailWithTags(illustId: number) {
    return this.kit.illustrations.detailWithTags(illustId);
  }

  getNovelDetailWithTags(novelId: number) {
    return this.kit.novels.detailWithTags(novelId);
  }

  getIllustDetail(illustId: number): Promise<PixivIllust> {
    return this.kit.illustrations.detail(illustId);
  }

  getNovelDetail(novelId: number): Promise<PixivNovel> {
    return this.kit.novels.detailCompatible(novelId);
  }

  getNovelText(novelId: number): Promise<PixivNovelTextResponse> {
    return this.kit.novels.text(novelId, { browserUserAgent: this.config.pixiv.userAgent });
  }

  ugoiraMetadata(illustId: number) {
    return this.kit.illustrations.ugoiraMetadata(illustId);
  }

  getNovelSeries(seriesId: number): Promise<PixivNovel[]> {
    return this.kit.novels.listSeries(seriesId);
  }

  downloadImage(originalUrl: string): Promise<ArrayBuffer> {
    return this.kit.media.fetch(originalUrl, { referer: 'https://app-api.pixiv.net/' });
  }
}
