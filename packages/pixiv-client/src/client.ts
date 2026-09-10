import type { AccessTokenProvider } from './auth/types';
import { StaticTokenProvider } from './auth/types';
import { silentLogger, type KitLogger } from './logger';
import { RateLimitGate } from './rate-limit/RateLimitGate';
import { Transport } from './transport/transport';
import { IllustrationsApi } from './app-api/illustrations';
import { NovelsApi } from './app-api/novels';
import { TagsApi } from './app-api/tags';
import { MediaApi } from './app-api/media';
import { UsersApi } from './app-api/users';
import type {
  KitEventListener,
  PixivClientOptions,
  ProxyOptions,
  RateLimitOptions,
  RateLimitStatus,
} from './types';

/**
 * Single public entry point of the kit.
 *
 *   const pixiv = createPixivClient({ auth: new StaticTokenProvider(t) });
 *   const illust = await pixiv.illustrations.get(123);
 *
 * The client knows Pixiv only: no host config, no SQLite, no puppeteer.
 */
export class PixivClient {
  readonly illustrations: IllustrationsApi;
  readonly novels: NovelsApi;
  readonly tags: TagsApi;
  readonly media: MediaApi;
  readonly users: UsersApi;
  private readonly gate: RateLimitGate;
  private readonly logger: KitLogger;

  constructor(options: PixivClientOptions) {
    this.logger = options.logger ?? silentLogger;
    const emit = options.onEvent;
    this.gate = new RateLimitGate(options.rateLimit ?? {}, this.logger, emit);

    const proxy = options.proxy ? normalizeProxy(options.proxy) : undefined;

    const transport = new Transport({
      baseUrl: options.baseUrl ?? 'https://app-api.pixiv.net',
      userAgent: options.userAgent,
      timeoutMs: options.timeoutMs ?? 30_000,
      retries: options.retries ?? 2,
      proxy,
      auth: options.auth,
      gate: this.gate,
      logger: this.logger,
      emit,
      fetchImpl: options.fetchImpl,
      coalesce: options.coalesceRequests ?? true,
      sleep: options.sleep,
    });

    this.illustrations = new IllustrationsApi(transport);
    this.novels = new NovelsApi(transport);
    this.tags = new TagsApi(transport);
    this.media = new MediaApi(transport);
    this.users = new UsersApi(transport);
  }

  /** Health view for host doctor/health/monitor UIs (no credentials). */
  getRateLimitStatus(): Promise<RateLimitStatus> {
    return this.gate.getStatus();
  }

  /** Advanced: the shared gate, for hosts that need to inject state/inspect. */
  getRateLimitGate(): RateLimitGate {
    return this.gate;
  }
}

function normalizeProxy(proxy: ProxyOptions): ProxyOptions {
  return { protocol: (proxy.protocol ?? 'http').toLowerCase() as ProxyOptions['protocol'], ...proxy };
}

export interface CreatePixivClientOptions extends PixivClientOptions {}

/** Convenience factory (also accepts a raw token string). */
export function createPixivClient(
  options: PixivClientOptions | { token: string; userAgent?: string; proxy?: ProxyOptions; rateLimit?: RateLimitOptions; logger?: KitLogger; onEvent?: KitEventListener }
): PixivClient {
  if ('token' in options) {
    const auth: AccessTokenProvider = new StaticTokenProvider(options.token);
    return new PixivClient({
      auth,
      userAgent: options.userAgent,
      proxy: options.proxy,
      rateLimit: options.rateLimit,
      logger: options.logger,
      onEvent: options.onEvent,
    });
  }
  return new PixivClient(options);
}
