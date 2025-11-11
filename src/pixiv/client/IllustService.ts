import { PixivApiCore } from './PixivApiCore';
import type { PixivIllust } from '../types';

/**
 * Service for illustration related Pixiv API calls.
 * Depends on PixivApiCore for HTTP concerns (retry, timeout, proxy, rate limit).
 */
export class IllustService {
  constructor(private readonly api: PixivApiCore) {}

  async getIllustration(illustId: number): Promise<PixivIllust> {
    const url = `/v1/illust/detail?illust_id=${encodeURIComponent(String(illustId))}`;
    const res = await this.api.request<{ illust: PixivIllust }>(url, { method: 'GET' });
    return res.illust;
  }

  async getIllustDetailWithTags(illustId: number): Promise<{
    illust: PixivIllust;
    tags: Array<{ name: string; translated_name?: string }>;
  }> {
    const url = `/v1/illust/detail?illust_id=${encodeURIComponent(String(illustId))}`;
    const res = await this.api.request<{
      illust: PixivIllust & { tags?: Array<{ name: string; translated_name?: string }> };
    }>(url, { method: 'GET' });
    const tags = res.illust.tags ?? [];
    const { tags: _omit, ...illust } = res.illust as any;
    return { illust, tags };
  }

  async getUserIllustrations(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<PixivIllust[]> {
    const params = new URLSearchParams({
      user_id: userId,
      type: 'illust',
      filter: 'for_ios',
    });
    if (options?.offset) params.set('offset', String(options.offset));
    let nextUrl: string | null = `/v1/user/illusts?${params.toString()}`;
    const results: PixivIllust[] = [];
    const limit = options?.limit ?? 30;

    while (nextUrl && results.length < limit) {
      // nextUrl may be a full URL from API, PixivApiCore can resolve it
      const res: { illusts: PixivIllust[]; next_url?: string | null } = await this.api.request<{
        illusts: PixivIllust[];
        next_url?: string | null;
      }>(nextUrl, { method: 'GET' });
      const illusts = res.illusts ?? [];
      const remaining = limit - results.length;
      results.push(...illusts.slice(0, remaining));
      nextUrl = res.next_url ?? null;
      if (illusts.length === 0) break;
    }

    return results.slice(0, limit);
  }

  async getRankingIllustrations(
    mode:
      | 'day'
      | 'week'
      | 'month'
      | 'day_male'
      | 'day_female'
      | 'week_original'
      | 'week_rookie'
      | 'day_r18'
      | 'day_male_r18'
      | 'day_female_r18'
      | 'week_r18'
      | 'week_r18g',
    date?: string,
    limit?: number
  ): Promise<PixivIllust[]> {
    const params = new URLSearchParams({
      mode,
      filter: 'for_ios',
    });
    if (date) params.set('date', date);

    let nextUrl: string | null = `/v1/illust/ranking?${params.toString()}`;
    const results: PixivIllust[] = [];

    while (nextUrl && (!limit || results.length < limit)) {
      const res: { illusts: PixivIllust[]; next_url?: string | null } = await this.api.request<{
        illusts: PixivIllust[];
        next_url?: string | null;
      }>(nextUrl, { method: 'GET' });
      for (const item of res.illusts ?? []) {
        results.push(item);
        if (limit && results.length >= limit) break;
      }
      nextUrl = res.next_url ?? null;
    }
    return results;
  }
}


