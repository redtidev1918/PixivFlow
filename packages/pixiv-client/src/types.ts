import type { AccessTokenProvider } from './auth/types';
import type { KitLogger } from './logger';

/** HTTP(S) or SOCKS proxy. The kit never rotates proxies on 429. */
export interface ProxyOptions {
  protocol?: 'http' | 'https' | 'socks' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface RateLimitOptions {
  /**
   * Minimum spacing between the START of two requests (pacing / slot size).
   * Conservative default: 1000 ms. Override per deployment.
   */
  minIntervalMs?: number;
  /** Random extra delay as a fraction of minIntervalMs, 0..0.5 recommended. */
  jitterRatio?: number;
  /** Cooldown after the FIRST 429 when no Retry-After hint is present. */
  initialCooldownMs?: number;
  /** Cooldown ceiling for the exponential 429 backoff. */
  maxCooldownMs?: number;
  /**
   * Number of consecutive successful responses required to decay the penalty
   * level by one (so one lucky response never clears a 429 penalty).
   */
  decaySuccesses?: number;
  /**
   * Penalty level (cooldown exponent) at which the circuit opens and fast
   * fails all requests until a half-open probe succeeds.
   */
  openThreshold?: number;
  /**
   * Persistence port. Default: in-memory. Hosts inject an SQLite/Redis/...
   * adapter so restarts do not forget an active Pixiv cooldown.
   */
  stateStore?: RateLimitStateStore;
  /** Logical key inside the state store (e.g. account id). Default 'default'. */
  scope?: string;
  /** Injectable clock (tests). */
  now?: () => number;
  /** Injectable sleeper (tests / cooperative shutdown). */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Injectable jitter RNG in [0,1) (tests). */
  random?: () => number;
}

/** Persisted gate state. All timestamps are epoch milliseconds. */
export interface RateLimitState {
  /** Earliest time the next request may start (pacing cursor). */
  nextAllowedAt: number;
  /** Cooldown imposed by the latest 429. */
  cooldownUntil: number;
  /** Exponential penalty level (0 = healthy). */
  penaltyLevel: number;
  /** Timestamp of the most recent 429. */
  last429At: number | null;
  /** Circuit state. */
  circuitState: 'closed' | 'open' | 'half_open';
  /** Consecutive successes counted toward penalty decay. */
  consecutiveSuccesses: number;
  updatedAt: number;
}

export interface RateLimitStatus {
  circuitState: RateLimitState['circuitState'];
  cooldownRemainingMs: number;
  penaltyLevel: number;
  last429At: number | null;
  nextAllowedInMs: number;
}

/**
 * Persistence port for the shared rate-limit gate.
 * The default implementation is process-local memory; hosts provide durable
 * adapters (e.g. SQLite). Must be safe to call concurrently.
 */
export interface RateLimitStateStore {
  load(scope: string): Promise<RateLimitState | null> | RateLimitState | null;
  save(scope: string, state: RateLimitState): Promise<void> | void;
}

export type KitEvent =
  | { type: 'request_start'; endpoint: string; method: string }
  | { type: 'request_success'; endpoint: string; status: number; elapsedMs: number }
  | { type: 'request_retry'; endpoint: string; attempt: number; waitMs: number; reason: string }
  | { type: 'rate_limited'; endpoint: string; retryAfterMs: number; penaltyLevel: number }
  | { type: 'cooldown_started'; until: number; penaltyLevel: number }
  | { type: 'circuit_opened'; until: number }
  | { type: 'circuit_half_open' }
  | { type: 'circuit_closed' }
  | { type: 'auth_refresh'; reason: 'expired' | 'unauthorized' };

export type KitEventListener = (event: KitEvent) => void;

export interface PixivClientOptions {
  /** REQUIRED: source of Bearer access tokens. */
  auth: AccessTokenProvider;
  /** App API base URL (default https://app-api.pixiv.net). */
  baseUrl?: string;
  /** Default User-Agent header. */
  userAgent?: string;
  /** Per-request timeout in ms (default 30000). Binary downloads may override. */
  timeoutMs?: number;
  /**
   * Retries for TRANSIENT failures only (network error / 5xx). 429 retries are
   * governed by the rate-limit gate, not this counter. Default 2 (3 attempts).
   */
  retries?: number;
  proxy?: ProxyOptions;
  rateLimit?: RateLimitOptions;
  /** Deduplicate identical in-flight GET requests (default true). */
  coalesceRequests?: boolean;
  logger?: KitLogger;
  /**
   * Injectable sleeper for transient retries (tests supply a fake clock; the
   * 429 gate sleeper is configured via rateLimit.sleep). Default: real timers.
   */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Structured network events. Never contains tokens/cookies/passwords. */
  onEvent?: KitEventListener;
  /**
   * Advanced: replace the HTTP executor (tests use a fake fetch). When set,
   * proxy settings are ignored.
   */
  fetchImpl?: FetchLike;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  /** Skip the Authorization header (www.pixiv.net ajax endpoints reject it). */
  skipAuth?: boolean;
  /** Omit the App-OS/App-Version mobile client headers (web endpoints). */
  skipAppHeaders?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Bypass in-flight coalescing for this request. */
  skipCoalesce?: boolean;
}

/** Minimal subset of the global Fetch contract the transport relies on. */
export type FetchLike = (url: string, init: RequestInit & { dispatcher?: unknown }) => Promise<ResponseLike>;

export interface ResponseLike {
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  ok: boolean;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface PaginationOptions {
  /** Max items to collect across pages. */
  limit?: number;
  /** Max pages to walk (safety cap). */
  maxPages?: number;
  /** Opaque cursor returned by a previous call. */
  cursor?: string | null;
  signal?: AbortSignal;
  /** Called with each page; the delay is still governed by the global gate. */
  onPage?: (pageIndex: number, collected: number) => void;
}
