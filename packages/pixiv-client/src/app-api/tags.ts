import type { Transport } from '../transport/transport';
import type { PixivTag } from '../models';

/** Tag autocomplete endpoint used for tag discovery. */
export class TagsApi {
  constructor(private readonly transport: Transport) {}

  async autocomplete(word: string, signal?: AbortSignal): Promise<PixivTag[]> {
    const params = new URLSearchParams({
      word,
      merge_plain_keyword_results: 'true',
    });
    const response = await this.transport.request<{
      tags?: PixivTag[];
      search_auto_complete_keywords?: string[];
    }>(`/v2/search/autocomplete?${params.toString()}`, { method: 'GET', signal });

    if (Array.isArray(response.tags)) return response.tags;
    return (response.search_auto_complete_keywords ?? []).map((name) => ({ name }));
  }
}
