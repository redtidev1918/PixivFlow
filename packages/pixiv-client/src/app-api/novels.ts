import { PixivApiError, PixivNetworkError, PixivNotFoundError } from '../errors/errors';
import type { Transport } from '../transport/transport';
import type { PixivNovel, PixivNovelTextResponse, PixivUser, PixivTag, Paginated } from '../models';
import type { NovelRankingMode, NovelSearchOptions, OnePageResult, RankingOptions, UserWorksOptions } from './options';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

/** Novel endpoints of the Pixiv public App API (+ required webview fallback). */
export class NovelsApi {
  constructor(private readonly transport: Transport) {}

  /** Novel detail (v2 endpoint). */
  async get(id: number, signal?: AbortSignal): Promise<PixivNovel> {
    return this.detail(id, signal);
  }

  async detail(id: number, signal?: AbortSignal): Promise<PixivNovel> {
    const res = await this.transport.request<{ novel: PixivNovel }>(
      `/v2/novel/detail?novel_id=${encodeURIComponent(String(id))}`,
      { method: 'GET', signal }
    );
    return res.novel;
  }

  /**
   * Detail + tags. v2 is primary; v1 is a CAPABILITY fallback for works whose
   * v2 endpoint is missing (404/'end-point' responses), not a 429 workaround.
   */
  async detailWithTags(id: number, signal?: AbortSignal): Promise<{ novel: PixivNovel; tags: PixivTag[] }> {
    try {
      const res = await this.transport.request<{ novel: PixivNovel & { tags?: PixivTag[] } }>(
        `/v2/novel/detail?novel_id=${encodeURIComponent(String(id))}`,
        { method: 'GET', signal }
      );
      return this.splitTags(res.novel);
    } catch (e) {
      if (!this.isMissingEndpoint(e)) throw e;
      const res = await this.transport.request<{ novel: PixivNovel & { tags?: PixivTag[] } }>(
        `/v1/novel/detail?novel_id=${encodeURIComponent(String(id))}`,
        { method: 'GET', signal }
      );
      return this.splitTags(res.novel);
    }
  }

  /** v2 with v1 capability fallback (matches legacy behavior). */
  async detailCompatible(id: number, signal?: AbortSignal): Promise<PixivNovel> {
    try {
      return await this.detail(id, signal);
    } catch (e) {
      if (!this.isMissingEndpoint(e)) throw e;
      const res = await this.transport.request<{ novel: PixivNovel }>(
        `/v1/novel/detail?novel_id=${encodeURIComponent(String(id))}`,
        { method: 'GET', signal }
      );
      return res.novel;
    }
  }

  async userWorksPage(userId: string, cursor: string | null, options: UserWorksOptions = {}): Promise<OnePageResult<PixivNovel>> {
    let url: string;
    if (cursor) {
      url = cursor;
    } else {
      const params = new URLSearchParams({ user_id: userId, filter: 'for_ios' });
      if (options.offset) params.set('offset', String(options.offset));
      url = `/v1/user/novels?${params.toString()}`;
    }
    const res = await this.transport.request<{ novels: PixivNovel[]; next_url?: string | null }>(url, {
      method: 'GET',
      signal: options.signal,
    });
    return { items: res.novels ?? [], next: res.next_url ?? null };
  }

  async listByUser(userId: string, options: UserWorksOptions = {}): Promise<PixivNovel[]> {
    const limit = options.limit ?? 30;
    const out: PixivNovel[] = [];
    let cursor: string | null = null;
    do {
      const page = await this.userWorksPage(userId, cursor, options);
      out.push(...page.items.slice(0, limit - out.length));
      cursor = page.next;
      if (!page.items.length) break;
    } while (cursor && out.length < limit);
    return out.slice(0, limit);
  }

  async rankingPage(mode: NovelRankingMode, cursor: string | null, options: RankingOptions = {}): Promise<OnePageResult<PixivNovel>> {
    let url: string;
    if (cursor) {
      url = cursor;
    } else {
      const params = new URLSearchParams({ mode });
      if (options.date) params.set('date', options.date);
      url = `/v1/novel/ranking?${params.toString()}`;
    }
    const res = await this.transport.request<{ novels: PixivNovel[]; next_url?: string | null }>(url, {
      method: 'GET',
      signal: options.signal,
    });
    return { items: res.novels ?? [], next: res.next_url ?? null };
  }

  async ranking(mode: NovelRankingMode, options: RankingOptions = {}): Promise<PixivNovel[]> {
    const limit = options.limit;
    const out: PixivNovel[] = [];
    let cursor: string | null = null;
    do {
      const page = await this.rankingPage(mode, cursor, options);
      out.push(...page.items);
      cursor = page.next;
      if (!page.items.length) break;
    } while (cursor && (limit === undefined || out.length < limit));
    return limit !== undefined ? out.slice(0, limit) : out;
  }

  async searchPage(options: NovelSearchOptions, cursor: string | null = null): Promise<OnePageResult<PixivNovel>> {
    let url: string;
    if (cursor) {
      url = cursor;
    } else {
      const paramsObj: Record<string, string> = {
        word: options.word,
        search_target: options.searchTarget ?? 'partial_match_for_tags',
      };
      if (!options.includeR18) paramsObj.filter = 'for_ios';
      const params = new URLSearchParams(paramsObj);
      params.set('sort', options.sort ?? 'date_desc');
      if (options.startDate) params.set('start_date', options.startDate);
      if (options.endDate) params.set('end_date', options.endDate);
      url = `/v1/search/novel?${params.toString()}`;
    }
    const res = await this.transport.request<{ novels: PixivNovel[]; next_url?: string | null }>(url, {
      method: 'GET',
      signal: options.signal,
    });
    return { items: res.novels ?? [], next: res.next_url ?? null };
  }

  async search(options: NovelSearchOptions): Promise<Paginated<PixivNovel>> {
    const limit = options.limit ?? 30;
    const out: PixivNovel[] = [];
    let cursor: string | null = options.cursor ?? null;
    do {
      const page = await this.searchPage(options, cursor);
      out.push(...page.items);
      cursor = page.next;
      if (!page.items.length) break;
    } while (cursor && out.length < limit);
    return { items: out.slice(0, limit), nextCursor: cursor };
  }

  async listSeries(seriesId: number, signal?: AbortSignal): Promise<PixivNovel[]> {
    type SeriesEntry = { id: number; title: string; user: PixivUser; create_date: string };
    type SeriesResponse = {
      novel_series_detail?: { series_content?: SeriesEntry[] };
      series_content?: SeriesEntry[];
      novels?: PixivNovel[];
      next_url?: string | null;
    };
    let currentUrl: string = `/v1/novel/series?series_id=${encodeURIComponent(String(seriesId))}`;
    const out: PixivNovel[] = [];
    for (;;) {
      const res: SeriesResponse = await this.transport.request<SeriesResponse>(currentUrl, { method: 'GET', signal });

      const content = res.novel_series_detail?.series_content ?? res.series_content;
      if (content) {
        for (const c of content) out.push({ id: c.id, title: c.title, user: c.user, create_date: c.create_date });
      } else if (Array.isArray(res.novels)) {
        out.push(...res.novels);
      } else {
        throw new PixivApiError('Unexpected response structure from novel series API.', {
          endpoint: currentUrl,
        });
      }
      if (!res.next_url) break;
      currentUrl = res.next_url;
    }
    return out;
  }

  /**
   * Novel text with the proven three-tier fallback chain:
   * webview v2 (gallery-dl style) -> legacy app-api v1 -> www.pixiv.net ajax.
   * Only a genuinely non-empty body counts as success.
   * These are ENDPOINT CAPABILITY fallbacks, never 429 rotation.
   */
  async text(novelId: number, options: { browserUserAgent?: string; signal?: AbortSignal } = {}): Promise<PixivNovelTextResponse> {
    const failures: string[] = [];

    try {
      const html = await this.transport.requestText(
        `/webview/v2/novel?id=${encodeURIComponent(String(novelId))}&viewer_version=20221031_ai`,
        { method: 'GET', signal: options.signal }
      );
      const marker = 'novel: ';
      const start = html.indexOf(marker);
      if (start !== -1) {
        const from = start + marker.length;
        const end = html.indexOf(',\n', from);
        if (end !== -1) {
          const parsed = JSON.parse(html.slice(from, end)) as { text?: unknown };
          const text = this.nonEmptyText(parsed?.text);
          if (text) return { novel_text: text };
        }
      }
      failures.push('webview returned no non-empty novel text');
    } catch (error) {
      failures.push(`webview (${this.messageOf(error)})`);
    }

    try {
      const res = await this.transport.request<PixivNovelTextResponse>(
        `/v1/novel/text?novel_id=${encodeURIComponent(String(novelId))}`,
        { method: 'GET', signal: options.signal }
      );
      const text = this.nonEmptyText(res?.novel_text);
      if (text) return { novel_text: text };
      failures.push('app-api returned no non-empty novel_text');
    } catch (error) {
      failures.push(`app-api (${this.messageOf(error)})`);
    }

    // www.pixiv.net rejects the App Bearer token -> skipAuth + browser headers.
    const ajaxUrl = `https://www.pixiv.net/ajax/novel/${novelId}`;
    try {
      const resp = await this.transport.request<{ error?: boolean; message?: string; body?: { content?: unknown } }>(ajaxUrl, {
        method: 'GET',
        headers: {
          Referer: 'https://www.pixiv.net/',
          'User-Agent': options.browserUserAgent ?? BROWSER_UA,
        },
        skipAuth: true,
        skipAppHeaders: true,
        signal: options.signal,
      });
      if (resp?.error) {
        throw new PixivNetworkError(`ajax endpoint returned error: ${resp.message || 'unknown'}`, { endpoint: ajaxUrl });
      }
      const text = this.nonEmptyText(resp?.body?.content);
      if (text) return { novel_text: text };
      failures.push('web ajax returned no non-empty content');
    } catch (error) {
      failures.push(`web ajax (${this.messageOf(error)})`);
    }

    throw new PixivApiError(`novel text failed for ${novelId}: ${failures.join('; ')}`, { endpoint: ajaxUrl });
  }

  private splitTags(novel: PixivNovel & { tags?: PixivTag[] }): { novel: PixivNovel; tags: PixivTag[] } {
    const tags = novel.tags ?? [];
    const { tags: _omit, ...rest } = novel;
    return { novel: rest as PixivNovel, tags };
  }

  private isMissingEndpoint(e: unknown): boolean {
    return e instanceof PixivNotFoundError || (e instanceof Error && /end-point/.test(e.message));
  }

  private nonEmptyText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
