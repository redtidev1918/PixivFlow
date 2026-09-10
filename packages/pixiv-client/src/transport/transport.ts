import { ProxyAgent } from 'undici';
import { SocksProxyAgent } from 'socks-proxy-agent';
import axios, { type AxiosInstance } from 'axios';

import { isRefreshable, type AccessTokenProvider } from '../auth/types';
import {
  PixivAbortError,
  PixivAuthenticationError,
  PixivCircuitOpenError,
  PixivForbiddenError,
  PixivHttpError,
  PixivNetworkError,
  PixivNotFoundError,
  PixivRateLimitError,
  PixivServerError,
  PixivTimeoutError,
} from '../errors/errors';
import type { KitLogger } from '../logger';
import { RateLimitGate } from '../rate-limit/RateLimitGate';
import type {
  FetchLike,
  KitEventListener,
  ProxyOptions,
  RequestOptions,
  ResponseLike,
} from '../types';

export interface TransportConfig {
  baseUrl: string;
  userAgent?: string;
  timeoutMs: number;
  retries: number;
  proxy?: ProxyOptions;
  auth: AccessTokenProvider;
  gate: RateLimitGate;
  logger?: KitLogger;
  emit?: KitEventListener;
  fetchImpl?: FetchLike;
  coalesce: boolean;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const APP_HEADERS = {
  'App-OS': 'ios',
  'App-OS-Version': '14.6',
  'App-Version': '7.13.3',
};


function proxyUrl(p: ProxyOptions): string {
  const protocol = (p.protocol ?? 'http').toLowerCase();
  const auth = p.username && p.password
    ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@`
    : '';
  return `${protocol}://${auth}${p.host}:${p.port}`;
}

interface RawResult {
  status: number;
  statusText: string;
  body: string;
  headers: { get(name: string): string | null };
}

/**
 * The ONE HTTP path for every Pixiv call: headers, Bearer auth, timeout,
 * proxy, response classification, transient retry and the shared 429 gate all
 * live here. Services only build URLs and decode payloads.
 */
export class Transport {
  private readonly baseUrl: string;
  private readonly userAgent?: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly proxy?: ProxyOptions;
  private readonly auth: AccessTokenProvider;
  private readonly gate: RateLimitGate;
  private readonly logger?: KitLogger;
  private readonly emit?: KitEventListener;
  private readonly fetchImpl: FetchLike;
  private readonly coalesce: boolean;
  private readonly sleeper: (ms: number, signal?: AbortSignal) => Promise<void>;

  private readonly httpDispatcher?: ProxyAgent;
  private readonly axiosInstance?: AxiosInstance;
  private readonly inFlight = new Map<string, Promise<RawResult>>();

  constructor(cfg: TransportConfig) {
    this.baseUrl = cfg.baseUrl;
    this.userAgent = cfg.userAgent;
    this.timeoutMs = cfg.timeoutMs;
    this.retries = cfg.retries;
    this.proxy = cfg.proxy;
    this.auth = cfg.auth;
    this.gate = cfg.gate;
    this.logger = cfg.logger;
    this.emit = cfg.emit;
    this.coalesce = cfg.coalesce;
    this.sleeper =
      cfg.sleep ??
      ((ms: number, signal?: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          // Referenced on purpose: an unref'd retry/backoff timer would let a
          // short-lived CLI/script process exit instead of completing the retry.
          const t = setTimeout(resolve, ms);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            },
            { once: true }
          );
        }));

    if (cfg.fetchImpl) {
      this.fetchImpl = cfg.fetchImpl;
    } else if (cfg.proxy) {
      const protocol = (cfg.proxy.protocol ?? 'http').toLowerCase();
      const url = proxyUrl(cfg.proxy);
      if (protocol === 'socks' || protocol === 'socks4' || protocol === 'socks5') {
        // undici fetch has no native SOCKS support; axios + socks agent only.
        const socks = new SocksProxyAgent(url);
        this.axiosInstance = axios.create({ httpAgent: socks, httpsAgent: socks, timeout: this.timeoutMs });
        this.fetchImpl = (u, init) => this.axiosFetch(u, init);
      } else {
        this.httpDispatcher = new ProxyAgent(url);
        this.fetchImpl = (u, init) => fetch(u, { ...init, dispatcher: this.httpDispatcher } as never) as Promise<ResponseLike>;
      }
    } else {
      this.fetchImpl = (u, init) => fetch(u, init as never) as Promise<ResponseLike>;
    }
  }

  // -- public API ------------------------------------------------------------

  resolveUrl(pathOrUrl: string): string {
    try {
      return new URL(pathOrUrl).toString();
    } catch {
      const withSlash = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
      return new URL(withSlash, this.baseUrl).toString();
    }
  }

  /** JSON request (also covers plain-text via {@link requestText}). */
  async request<T>(pathOrUrl: string, options: RequestOptions = {}): Promise<T> {
    const raw = await this.send(pathOrUrl, options);
    return JSON.parse(raw.body) as T;
  }

  /** Plain-text request (webview HTML endpoints). */
  async requestText(pathOrUrl: string, options: RequestOptions = {}): Promise<string> {
    return (await this.send(pathOrUrl, options)).body;
  }

  /** Binary fetch for media. Coalesced, gated, typed errors, same proxy stack. */
  async fetchBinary(pathOrUrl: string, options: RequestOptions = {}): Promise<ArrayBuffer> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const url = this.resolveUrl(pathOrUrl);
    const started = Date.now();
    this.emit?.({ type: 'request_start', endpoint: url, method: options.method ?? 'GET' });

    for (let attempt = 0; ; attempt++) {
      const { signal, cancel } = this.withTimeout(timeoutMs, options.signal);
      try {
        await this.gate.acquire(options.signal);
        const buf = await this.executeBinary(url, { ...options, signal });
        this.emit?.({ type: 'request_success', endpoint: url, status: 200, elapsedMs: Date.now() - started });
        await this.gate.reportSuccess();
        return buf;
      } catch (e) {
        const decision = await this.classifyFailure(e, attempt, url, 'GET', !!options.signal?.aborted);
        if (decision.action === 'throw') throw decision.error;
        await this.waitRetry(decision.waitMs, options.signal);
      } finally {
        cancel();
      }
    }
  }

  // -- core send with retry --------------------------------------------------

  private send(pathOrUrl: string, options: RequestOptions): Promise<RawResult> {
    const url = this.resolveUrl(pathOrUrl);
    if (this.coalesce && (options.method ?? 'GET') === 'GET' && !options.skipCoalesce) {
      const key = this.coalesceKey(url, options);
      const existing = this.inFlight.get(key);
      if (existing) return existing;
      const promise = this.executeWithRetry(url, options).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, promise);
      return promise;
    }
    return this.executeWithRetry(url, options);
  }

  private coalesceKey(url: string, options: RequestOptions): string {
    // Auth header intentionally excluded: same resource, same token scope.
    return `${options.method ?? 'GET'} ${url}`;
  }

  private async executeWithRetry(url: string, options: RequestOptions): Promise<RawResult> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const started = Date.now();
    let forceRefresh = false;

    for (let attempt = 0; ; attempt++) {
      const { signal, cancel } = this.withTimeout(timeoutMs, options.signal);
      try {
        const { probe } = await this.gate.acquire(options.signal);
        this.emit?.({ type: 'request_start', endpoint: url, method: options.method ?? 'GET' });
        const result = await this.executeOnce(url, { ...options, signal }, forceRefresh);
        const classified = this.classifyStatus(result, url);
        if (classified.kind === 'ok') {
          this.emit?.({ type: 'request_success', endpoint: url, status: result.status, elapsedMs: Date.now() - started });
          await this.gate.reportSuccess();
          return result;
        }

        const decision = await this.handleBadStatus(classified, result, url, attempt, probe);
        if (decision.action === 'throw') throw decision.error;

        if (decision.action === 'refresh') {
          forceRefresh = true;
          this.emit?.({ type: 'auth_refresh', reason: 'unauthorized' });
          continue;
        }
        await this.waitRetry(decision.waitMs, options.signal);
      } catch (e) {
        const decision = await this.classifyFailure(e, attempt, url, options.method ?? 'GET', !!options.signal?.aborted);
        if (decision.action === 'throw') throw decision.error;
        await this.waitRetry(decision.waitMs, options.signal);
      } finally {
        cancel();
      }
    }
  }

  // -- execution backends ----------------------------------------------------

  private async executeOnce(
    url: string,
    options: RequestOptions,
    forceRefresh: boolean
  ): Promise<RawResult> {
    const headers: Record<string, string> = {
      ...(options.skipAppHeaders ? {} : APP_HEADERS),
      ...(this.userAgent ? { 'User-Agent': this.userAgent } : {}),
      Referer: 'https://app-api.pixiv.net/',
      ...options.headers,
    };

    if (!options.skipAuth) {
      const token = forceRefresh && isRefreshable(this.auth)
        ? await this.auth.refreshAccessToken(options.signal)
        : await this.auth.getAccessToken(options.signal);
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await this.fetchImpl(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
      signal: options.signal,
    });
    const body = await this.safeText(res);
    return { status: res.status, statusText: res.statusText, body, headers: res.headers };
  }

  private async executeBinary(url: string, options: RequestOptions): Promise<ArrayBuffer> {
    const headers: Record<string, string> = {
      ...(options.skipAppHeaders ? {} : APP_HEADERS),
      ...(this.userAgent ? { 'User-Agent': this.userAgent } : {}),
      Referer: 'https://app-api.pixiv.net/',
      ...options.headers,
    };
    if (!options.skipAuth) {
      const token = await this.auth.getAccessToken(options.signal);
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const res = await this.fetchImpl(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
      signal: options.signal,
    });
    if (!res.ok) {
      const body = await this.safeText(res);
      throw this.statusError(res.status, res.statusText, body, url);
    }
    return res.arrayBuffer();
  }

  /** SOCKS backend: adapt an axios response to the fetch-like shape. */
  private async axiosFetch(url: string, init: RequestInit): Promise<ResponseLike> {
    const response = await this.axiosInstance!.request({
      url,
      method: (init.method as string) ?? 'GET',
      headers: init.headers as Record<string, string>,
      data: init.body,
      signal: init.signal ?? undefined,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: (d) => d,
    });
    const headers = new Map<string, string>();
    for (const [k, v] of Object.entries(response.headers ?? {})) {
      if (typeof v === 'string') headers.set(k.toLowerCase(), v);
    }
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.status >= 200 && response.status < 300,
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
      json: async () => JSON.parse(body),
      text: async () => body,
      arrayBuffer: async () => {
        const buf = await this.axiosInstance!.request({
          url,
          method: (init.method as string) ?? 'GET',
          headers: init.headers as Record<string, string>,
          data: init.body,
          signal: init.signal ?? undefined,
          validateStatus: () => true,
          responseType: 'arraybuffer',
        });
        return buf.data as ArrayBuffer;
      },
    };
  }

  // -- classification & retry decisions -------------------------------------

  private classifyStatus(result: RawResult, url: string): { kind: 'ok' } | { kind: 'error'; error: PixivHttpError } {
    if (result.status >= 200 && result.status < 300) return { kind: 'ok' };
    return { kind: 'error', error: this.statusError(result.status, result.statusText, result.body, url) };
  }

  private statusError(status: number, statusText: string, body: string, url: string): PixivHttpError {
    const snippet = body ? ` - ${body.slice(0, 200)}` : '';
    const base = { status, endpoint: url, body, retryAfterMs: undefined as number | undefined };
    switch (status) {
      case 400:
        return new PixivHttpError(`Pixiv API error: 400 Bad Request${snippet}`, { ...base, retryable: false });
      case 401:
        return new PixivAuthenticationError(`Pixiv API error: 401 Unauthorized${snippet}`, base);
      case 403:
        return new PixivForbiddenError(`Pixiv API error: 403 Forbidden${snippet}`, base);
      case 404:
        return new PixivNotFoundError(`Pixiv API error: 404 Not Found${snippet}`, base);
      case 429:
        return new PixivRateLimitError(`Pixiv API error: 429 Rate Limit${snippet}`, base);
      default:
        if (status >= 500) return new PixivServerError(`Pixiv API error: ${status} ${statusText}${snippet}`, base);
        return new PixivHttpError(`Pixiv API error: ${status} ${statusText}${snippet}`, { ...base, retryable: false });
    }
  }

  private async handleBadStatus(
    classified: { kind: 'error'; error: PixivHttpError },
    result: RawResult,
    url: string,
    attempt: number,
    probe: boolean
  ): Promise<
    | { action: 'throw'; error: PixivHttpError }
    | { action: 'retry'; waitMs: number }
    | { action: 'refresh' }
  > {
    const error = classified.error;

    if (error instanceof PixivAuthenticationError) {
      // One refresh-and-retry, once per call.
      if (attempt === 0 && isRefreshable(this.auth)) return { action: 'refresh' };
      return { action: 'throw', error };
    }

    if (error instanceof PixivRateLimitError) {
      const retryAfter = result.headers.get('Retry-After');
      const { waitMs, circuitOpened } = await this.gate.reportRateLimited(retryAfter);
      Object.assign(error as object, { retryAfterMs: waitMs });
      if (probe) await this.gate.reportProbeFailure(waitMs);
      // OPEN past the retry budget: fail fast and let the durable scheduler
      // own the wait instead of blocking one process turn for many minutes.
      if (circuitOpened || attempt >= this.retries) {
        return { action: 'throw', error };
      }
      this.emit?.({ type: 'request_retry', endpoint: url, attempt: attempt + 1, waitMs, reason: 'rate_limited' });
      return { action: 'retry', waitMs };
    }

    if (error instanceof PixivServerError) {
      if (probe) await this.gate.reportProbeFailure(this.linearBackoffMs(attempt));
      if (attempt >= this.retries) return { action: 'throw', error };
      const waitMs = this.linearBackoffMs(attempt);
      this.emit?.({ type: 'request_retry', endpoint: url, attempt: attempt + 1, waitMs, reason: 'server_error' });
      return { action: 'retry', waitMs };
    }

    // 400/403/404 and any other 4xx: never retry.
    return { action: 'throw', error };
  }

  private async classifyFailure(
    e: unknown,
    attempt: number,
    url: string,
    _method: string,
    callerAborted = false
  ): Promise<
    | { action: 'throw'; error: unknown }
    | { action: 'retry'; waitMs: number }
  > {
    // Typed kit errors are terminal by construction (already classified).
    if (e instanceof PixivHttpError) return { action: 'throw', error: e };
    if (e instanceof PixivCircuitOpenError) return { action: 'throw', error: e };
    if (e instanceof PixivAbortError) {
      return { action: 'throw', error: e };
    }

    // AbortError from fetch/axios: distinguish our own timeout abort from a
    // caller-provided signal abort. The internal timeout controller has NO
    // external signal, so callerAborted cleanly separates the two cases
    // (undici/axios attach different reasons; do not rely on their internals).
    if (e instanceof Error && e.name === 'AbortError') {
      const reason = (e as { cause?: unknown }).cause;
      const isOurTimeout =
        !callerAborted ||
        (reason instanceof Error && reason.message === '__pixiv_timeout__');
      if (isOurTimeout) {
        return this.maybeTransientRetry(
          new PixivTimeoutError(`Request timeout after ${this.timeoutMs}ms`, { endpoint: url, cause: e, code: 'timeout' }),
          attempt,
          url
        );
      }
      return { action: 'throw', error: new PixivAbortError('Request aborted', { cause: e, endpoint: url }) };
    }

    if (e instanceof PixivTimeoutError) {
      return this.maybeTransientRetry(e, attempt, url);
    }

    // Everything else from the network stack (ECONNRESET, ENOTFOUND, proxy
    // failure, socket hang up, ...) is transient up to the retry budget.
    const network = new PixivNetworkError(
      `Pixiv network error: ${e instanceof Error ? e.message : String(e)}`,
      { endpoint: url, cause: e, code: (e as { code?: string })?.code ?? 'network_error' }
    );
    return this.maybeTransientRetry(network, attempt, url);
  }

  private maybeTransientRetry(
    error: PixivTimeoutError | PixivNetworkError | PixivAbortError,
    attempt: number,
    url: string
  ): { action: 'throw'; error: unknown } | { action: 'retry'; waitMs: number } {
    if (attempt >= this.retries) return { action: 'throw', error };
    const waitMs = this.linearBackoffMs(attempt);
    this.emit?.({ type: 'request_retry', endpoint: url, attempt: attempt + 1, waitMs, reason: 'network' });
    return { action: 'retry', waitMs };
  }

  private linearBackoffMs(attempt: number): number {
    return Math.min(1000 * (attempt + 1), 5000);
  }

  private async waitRetry(waitMs: number, signal?: AbortSignal): Promise<void> {
    if (waitMs <= 0) return;
    try {
      await this.sleeper(waitMs, signal);
    } catch (e) {
      throw new PixivAbortError('aborted while waiting to retry', { cause: e });
    }
  }

  // -- helpers ---------------------------------------------------------------

  private withTimeout(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
    if (external) return { signal: external, cancel: () => {} };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('__pixiv_timeout__')), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    return {
      signal: controller.signal,
      cancel: () => {
        clearTimeout(timer);
      },
    };
  }

  private async safeText(res: ResponseLike): Promise<string> {
    try {
      return await res.text();
    } catch {
      return '';
    }
  }
}
