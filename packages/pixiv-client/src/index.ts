/**
 * @redtidev/pixiv-client — independent Pixiv App-API client kit.
 *
 * Small, stable public surface. Consumers must import from the package root;
 * transport/rate-limit internals are exported as named members for advanced
 * embedding (custom state stores, health UIs, test doubles) but the
 * service-level API (PixivClient) is what stays semver-stable.
 */

export { PixivClient, createPixivClient } from './client';
export type { CreatePixivClientOptions } from './client';

export { StaticTokenProvider, isRefreshable } from './auth/types';
export type { AccessTokenProvider, RefreshableAccessTokenProvider } from './auth/types';

export {
  RateLimitGate,
  MemoryRateLimitStateStore,
  DEFAULT_RATE_LIMIT,
  parseRetryAfter,
} from './rate-limit/RateLimitGate';
export { Transport } from './transport/transport';
export type { TransportConfig } from './transport/transport';
export { paginate, firstPage } from './pagination';

export {
  IllustrationsApi,
  NovelsApi,
  TagsApi,
  MediaApi,
  UsersApi,
} from './app-api/exports';

export type {
  IllustSearchOptions,
  NovelSearchOptions,
  RankingOptions,
  UserWorksOptions,
  IllustRankingMode,
  NovelRankingMode,
  SearchSort,
  SearchTarget,
  OnePageResult,
} from './app-api/options';

export type {
  PixivUser,
  PixivTag,
  PixivIllust,
  PixivIllustPage,
  PixivNovel,
  PixivNovelTextResponse,
  UgoiraFrame,
  UgoiraMetadata,
  Paginated,
  PixivListResponse,
} from './models';

export type {
  PixivClientOptions,
  ProxyOptions,
  RateLimitOptions,
  RateLimitState,
  RateLimitStateStore,
  RateLimitStatus,
  RequestOptions,
  PaginationOptions,
  KitEvent,
  KitEventListener,
  FetchLike,
  ResponseLike,
} from './types';
export { silentLogger } from './logger';
export type { KitLogger } from './logger';

export {
  PixivError,
  PixivHttpError,
  PixivNetworkError,
  PixivTimeoutError,
  PixivRateLimitError,
  PixivAuthenticationError,
  PixivForbiddenError,
  PixivNotFoundError,
  PixivServerError,
  PixivCircuitOpenError,
  PixivAbortError,
  PixivApiError,
  isPixivError,
} from './errors/errors';
export type { PixivErrorDetails } from './errors/errors';
