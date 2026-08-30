import { PixivApiCore } from './PixivApiCore';
import type { PixivNovel, PixivUser, PixivNovelTextResponse } from '../types';
import { NetworkError } from '../../utils/errors';

/**
 * Service for novel related Pixiv API calls.
 */
export class NovelService {
  constructor(private readonly api: PixivApiCore) {}

  async getNovel(novelId: number): Promise<PixivNovel> {
    // Prefer v2, fallback logic should be applied by higher layer if needed
    const url = `/v2/novel/detail?novel_id=${encodeURIComponent(String(novelId))}`;
    const res = await this.api.request<{ novel: PixivNovel }>(url, { method: 'GET' });
    return res.novel;
  }

  async getNovelDetailWithTags(novelId: number): Promise<{
    novel: PixivNovel;
    tags: Array<{ name: string; translated_name?: string }>;
  }> {
    // Try v2 first
    let url = `/v2/novel/detail?novel_id=${encodeURIComponent(String(novelId))}`;
    try {
      const res = await this.api.request<{
        novel: PixivNovel & { tags?: Array<{ name: string; translated_name?: string }> };
      }>(url, { method: 'GET' });
      const tags = res.novel.tags ?? [];
      const { tags: _omit, ...novel } = res.novel as any;
      return { novel, tags };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Fallback to v1 if endpoint missing/404
      if (msg.includes('404') || msg.includes('end-point')) {
        url = `/v1/novel/detail?novel_id=${encodeURIComponent(String(novelId))}`;
        const res = await this.api.request<{
          novel: PixivNovel & { tags?: Array<{ name: string; translated_name?: string }> };
        }>(url, { method: 'GET' });
        const tags = res.novel.tags ?? [];
        const { tags: _omit, ...novel } = res.novel as any;
        return { novel, tags };
      }
      throw e;
    }
  }

  async getNovelDetail(novelId: number): Promise<PixivNovel> {
    // Try v2 first, then v1
    try {
      return await this.getNovel(novelId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('404') || msg.includes('end-point')) {
        const url = `/v1/novel/detail?novel_id=${encodeURIComponent(String(novelId))}`;
        const res = await this.api.request<{ novel: PixivNovel }>(url, { method: 'GET' });
        return res.novel;
      }
      throw e;
    }
  }

  async getNovelText(novelId: number, opts?: { userAgent?: string }): Promise<PixivNovelTextResponse> {
    const failures: string[] = [];

    // Primary: the same webview endpoint used by gallery-dl. The legacy
    // /v1/novel/text endpoint can return a successful response with an empty
    // body for some works, so HTTP success alone must not be treated as a
    // successful novel download.
    try {
      const webviewUrl = `/webview/v2/novel?id=${encodeURIComponent(String(novelId))}&viewer_version=20221031_ai`;
      const html = await this.api.request<string>(webviewUrl, {
        method: 'GET',
        responseType: 'text',
      });
      const marker = 'novel: ';
      const start = html.indexOf(marker);
      if (start !== -1) {
        const from = start + marker.length;
        const end = html.indexOf(',\n', from);
        if (end !== -1) {
          const parsed = JSON.parse(html.slice(from, end));
          const text = this.nonEmptyText(parsed?.text);
          if (text) return { novel_text: text };
        }
      }
      failures.push('webview returned no non-empty novel text');
    } catch (error) {
      failures.push(`webview (${this.errorMessage(error)})`);
    }

    // Fallback 1: legacy App API. Keep it for compatibility, but only accept a
    // genuinely non-empty novel_text value.
    const url = `/v1/novel/text?novel_id=${encodeURIComponent(String(novelId))}`;
    try {
      const response = await this.api.request<PixivNovelTextResponse>(url, { method: 'GET' });
      const text = this.nonEmptyText(response?.novel_text);
      if (text) return { novel_text: text };
      failures.push('app-api returned no non-empty novel_text');
    } catch (error) {
      failures.push(`app-api (${this.errorMessage(error)})`);
    }

    // Fallback 2: web ajax endpoint. This one must NOT carry the App Bearer
    // token (www.pixiv.net/ajax rejects it with a different payload), so we
    // send browser-like headers with skipAuth instead.
    const BROWSER_UA =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
    const ajaxUrl = `https://www.pixiv.net/ajax/novel/${novelId}`;
    try {
      const resp = await this.api.request<any>(ajaxUrl, {
        method: 'GET',
        headers: {
          Referer: 'https://www.pixiv.net/',
          'User-Agent': opts?.userAgent ?? BROWSER_UA,
        },
        skipAuth: true,
      });
      if (resp?.error) {
        throw new NetworkError(
          `ajax endpoint returned error: ${resp.message || 'unknown'}`,
          ajaxUrl
        );
      }
      const text = this.nonEmptyText(resp?.body?.content);
      if (text) return { novel_text: text };
      failures.push('web ajax returned no non-empty content');
    } catch (fallbackError) {
      failures.push(`web ajax (${this.errorMessage(fallbackError)})`);
    }

    throw new NetworkError(
      `novel text failed for ${novelId}: ${failures.join('; ')}`,
      ajaxUrl
    );
  }

  private nonEmptyText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async getUserNovels(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<PixivNovel[]> {
    const params = new URLSearchParams({
      user_id: userId,
      filter: 'for_ios',
    });
    if (options?.offset) params.set('offset', String(options.offset));
    let nextUrl: string | null = `/v1/user/novels?${params.toString()}`;
    const results: PixivNovel[] = [];
    const limit = options?.limit ?? 30;

    while (nextUrl && results.length < limit) {
      const responseData: { novels: PixivNovel[]; next_url?: string | null } =
        await this.api.request<{ novels: PixivNovel[]; next_url?: string | null }>(
          nextUrl as string,
          { method: 'GET' }
        );
      const novels = responseData.novels ?? [];
      const remaining = limit - results.length;
      results.push(...novels.slice(0, remaining));
      nextUrl = responseData.next_url ?? null;
      if (novels.length === 0) break;
    }

    return results.slice(0, limit);
  }

  async getRankingNovels(
    mode:
      | 'day'
      | 'week'
      | 'month'
      | 'day_male'
      | 'day_female'
      | 'day_r18'
      | 'day_male_r18'
      | 'day_female_r18'
      | 'week_r18'
      | 'week_r18g',
    date?: string,
    limit?: number
  ): Promise<PixivNovel[]> {
    const params = new URLSearchParams({
      mode,
    });
    if (date) params.set('date', date);

    let nextUrl: string | null = `/v1/novel/ranking?${params.toString()}`;
    const results: PixivNovel[] = [];

    while (nextUrl && (!limit || results.length < limit)) {
      const responseData: { novels: PixivNovel[]; next_url?: string | null } =
        await this.api.request<{ novels: PixivNovel[]; next_url?: string | null }>(
          nextUrl as string,
          { method: 'GET' }
        );
      for (const item of responseData.novels ?? []) {
        results.push(item);
        if (limit && results.length >= limit) break;
      }
      nextUrl = responseData.next_url ?? null;
    }
    return results;
  }

  async getNovelSeries(seriesId: number): Promise<PixivNovel[]> {
    let nextUrl = `/v1/novel/series?series_id=${encodeURIComponent(String(seriesId))}`;
    const results: PixivNovel[] = [];

    while (nextUrl) {
      const res = await this.api.request<any>(nextUrl, { method: 'GET' });
      let seriesContent: Array<{ id: number; title: string; user: PixivUser; create_date: string }> =
        [];

      if (res.novel_series_detail?.series_content) {
        seriesContent = res.novel_series_detail.series_content;
      } else if (res.series_content) {
        seriesContent = res.series_content;
      } else if (Array.isArray(res.novels)) {
        seriesContent = res.novels;
      } else {
        throw new Error(`Unexpected response structure from novel series API.`);
      }

      for (const content of seriesContent) {
        results.push({
          id: content.id,
          title: content.title,
          user: content.user,
          create_date: content.create_date,
        });
      }

      nextUrl = res.next_url ?? null;
    }

    return results;
  }
}
