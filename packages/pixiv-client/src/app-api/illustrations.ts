import type { Transport } from '../transport/transport';
import type { PixivIllust, PixivTag, UgoiraMetadata, Paginated } from '../models';
import type { IllustRankingMode, IllustSearchOptions, OnePageResult, RankingOptions, UserWorksOptions } from './options';

/** Illustration endpoints of the Pixiv public App API. */
export class IllustrationsApi {
  constructor(private readonly transport: Transport) {}

  get(id: number, signal?: AbortSignal): Promise<PixivIllust> {
    return this.detail(id, signal);
  }

  async detail(id: number, signal?: AbortSignal): Promise<PixivIllust> {
    const res = await this.transport.request<{ illust: PixivIllust }>(
      `/v1/illust/detail?illust_id=${encodeURIComponent(String(id))}`,
      { method: 'GET', signal }
    );
    return res.illust;
  }

  async detailWithTags(id: number, signal?: AbortSignal): Promise<{
    illust: PixivIllust;
    tags: PixivTag[];
  }> {
    const res = await this.transport.request<{ illust: PixivIllust & { tags?: PixivTag[] } }>(
      `/v1/illust/detail?illust_id=${encodeURIComponent(String(id))}`,
      { method: 'GET', signal }
    );
    const tags = res.illust.tags ?? [];
    const { tags: _omit, ...illust } = res.illust as PixivIllust & { tags?: PixivTag[] };
    return { illust, tags };
  }

  /** One user-works page (type=illust). Use {@link listByUser} for walking. */
  async userWorksPage(userId: string, cursor: string | null, options: UserWorksOptions = {}): Promise<OnePageResult<PixivIllust>> {
    let url: string;
    if (cursor) {
      url = cursor;
    } else {
      const params = new URLSearchParams({ user_id: userId, type: 'illust', filter: 'for_ios' });
      if (options.offset) params.set('offset', String(options.offset));
      url = `/v1/user/illusts?${params.toString()}`;
    }
    const res = await this.transport.request<{ illusts: PixivIllust[]; next_url?: string | null }>(url, {
      method: 'GET',
      signal: options.signal,
    });
    return { items: res.illusts ?? [], next: res.next_url ?? null };
  }

  /** User illustrations, walking next_url up to `limit` (default 30). */
  async listByUser(userId: string, options: UserWorksOptions = {}): Promise<PixivIllust[]> {
    const limit = options.limit ?? 30;
    const out: PixivIllust[] = [];
    let cursor: string | null = null;
    do {
      const page = await this.userWorksPage(userId, cursor, options);
      out.push(...page.items);
      cursor = page.next;
      if (!page.items.length) break;
    } while (cursor && out.length < limit);
    return out.slice(0, limit);
  }

  async rankingPage(mode: IllustRankingMode, cursor: string | null, options: RankingOptions = {}): Promise<OnePageResult<PixivIllust>> {
    let url: string;
    if (cursor) {
      url = cursor;
    } else {
      const params = new URLSearchParams({ mode, filter: 'for_ios' });
      if (options.date) params.set('date', options.date);
      url = `/v1/illust/ranking?${params.toString()}`;
    }
    const res = await this.transport.request<{ illusts: PixivIllust[]; next_url?: string | null }>(url, {
      method: 'GET',
      signal: options.signal,
    });
    return { items: res.illusts ?? [], next: res.next_url ?? null };
  }

  async ranking(mode: IllustRankingMode, options: RankingOptions = {}): Promise<PixivIllust[]> {
    const limit = options.limit;
    const out: PixivIllust[] = [];
    let cursor: string | null = null;
    do {
      const page = await this.rankingPage(mode, cursor, options);
      out.push(...page.items);
      cursor = page.next;
      if (!page.items.length) break;
    } while (cursor && (limit === undefined || out.length < limit));
    return limit !== undefined ? out.slice(0, limit) : out;
  }

  /** One illustration search page. PixivFlow uses this for date-aware paging. */
  async searchPage(options: IllustSearchOptions, cursor: string | null = null): Promise<OnePageResult<PixivIllust>> {
    let url: string;
    if (cursor) {
      url = cursor;
    } else {
      const paramsObj: Record<string, string> = {
        word: options.word,
        search_target: options.searchTarget ?? 'partial_match_for_tags',
        include_translated_tag_results: options.includeTranslatedTagResults === false ? 'false' : 'true',
      };
      if (!options.includeR18) paramsObj.filter = 'for_ios';
      const params = new URLSearchParams(paramsObj);
      params.set('sort', options.sort ?? 'date_desc');
      if (options.startDate) params.set('start_date', options.startDate);
      if (options.endDate) params.set('end_date', options.endDate);
      url = `/v1/search/illust?${params.toString()}`;
    }
    const res = await this.transport.request<{ illusts: PixivIllust[]; next_url?: string | null }>(url, {
      method: 'GET',
      signal: options.signal,
    });
    return { items: res.illusts ?? [], next: res.next_url ?? null };
  }

  /**
   * Search illustrations, walking next_url up to `limit` (default 30).
   * NOTE: hosts that must stop early on a date boundary or merge tag unions
   * should call {@link searchPage} in their own loop (PixivFlow does).
   */
  async search(options: IllustSearchOptions): Promise<Paginated<PixivIllust>> {
    const limit = options.limit ?? 30;
    const out: PixivIllust[] = [];
    let cursor: string | null = options.cursor ?? null;
    do {
      const page = await this.searchPage(options, cursor);
      out.push(...page.items);
      cursor = page.next;
      if (!page.items.length) break;
    } while (cursor && out.length < limit);
    return { items: out.slice(0, limit), nextCursor: cursor };
  }

  async ugoiraMetadata(illustId: number, signal?: AbortSignal): Promise<UgoiraMetadata> {
    const res = await this.transport.request<{ ugoira_metadata: UgoiraMetadata }>(
      `/v1/ugoira/metadata?illust_id=${encodeURIComponent(String(illustId))}`,
      { method: 'GET', signal }
    );
    return res.ugoira_metadata;
  }
}
