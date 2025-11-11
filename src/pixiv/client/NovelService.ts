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
    // Primary: v1 API
    const url = `/v1/novel/text?novel_id=${encodeURIComponent(String(novelId))}`;
    try {
      return await this.api.request<PixivNovelTextResponse>(url, { method: 'GET' });
    } catch (e) {
      // Fallback: ajax endpoint
      try {
        const ajaxUrl = `https://www.pixiv.net/ajax/novel/${novelId}`;
        const headers: Record<string, string> = {
          Referer: 'https://www.pixiv.net/',
          ...(opts?.userAgent ? { 'User-Agent': opts.userAgent } : {}),
        };
        // We intentionally call request<T> to reuse auth/proxy/timeout
        const resp = await this.api.request<any>(ajaxUrl, {
          method: 'GET',
          headers,
        });
        if (resp?.body?.content) {
          return { novel_text: resp.body.content };
        }
        throw new NetworkError('Unexpected ajax novel response structure', ajaxUrl);
      } catch (e2) {
        throw e2;
      }
    }
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


