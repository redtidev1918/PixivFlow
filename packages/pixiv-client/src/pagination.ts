import type { PaginationOptions } from './types';
import type { Paginated } from './models';

/**
 * Walk a Pixiv `next_url` page chain one page at a time. This never performs
 * unbounded auto-pagination: callers pass `limit`/`maxPages` and can abort.
 * The transport's global gate spaces the requests; there is no extra delay
 * parameter here.
 */
export async function paginate<T>(
  fetchPage: (cursor: string | null, signal?: AbortSignal) => Promise<{ items: T[]; next: string | null }>,
  options: PaginationOptions = {}
): Promise<Paginated<T>> {
  const items: T[] = [];
  const limit = options.limit;
  const maxPages = options.maxPages ?? (limit ? Math.ceil(limit / 30) + 5 : 10);
  let cursor = options.cursor ?? null;

  for (let page = 0; page < maxPages; page++) {
    if (options.signal?.aborted) break;
    const result = await fetchPage(cursor, options.signal);
    items.push(...result.items);
    options.onPage?.(page, items.length);
    cursor = result.next;
    if (!cursor || !result.items.length) break;
    if (limit !== undefined && items.length >= limit) break;
  }

  const sliced = limit !== undefined ? items.slice(0, limit) : items;
  const more = items.length > sliced.length || (cursor !== null && sliced.length === items.length);
  return { items: sliced, nextCursor: more ? cursor : null };
}

/**
 * Fetch exactly ONE page (the first page when no cursor is given).
 * Used by host applications that own their pagination loop (PixivFlow's
 * date-aware search stops early).
 */
export async function firstPage<T>(
  fetchPage: (cursor: string | null, signal?: AbortSignal) => Promise<{ items: T[]; next: string | null }>,
  cursor?: string | null,
  signal?: AbortSignal
): Promise<Paginated<T>> {
  const result = await fetchPage(cursor ?? null, signal);
  return { items: result.items, nextCursor: result.next };
}
