import { setTimeout as delay } from 'node:timers/promises';
import type {
  PixivClient as KitPixivClient,
  PixivIllust,
  PixivNovel,
  IllustSearchOptions,
  NovelSearchOptions,
} from '@redtidev/pixiv-client';

import { logger } from '../logger';
import { parseDateRange } from '../utils/date-utils';
import { isDateInRange } from '../utils/date-utils';
import { sortPixivItems } from '../utils/pixiv-sort';
import { throwIfAborted } from '../utils/errors';
import type { TargetConfig } from '../config';
import { mapTargetToIllustQuery, mapTargetToNovelQuery } from './query-mapper';

/**
 * Host-side replacement for the old in-kit SearchService: drives the kit's
 * per-page API with PixivFlow-specific date-aware pagination, early stop,
 * tag-OR merging, over-fetch and final sorting. Nothing here belongs in the
 * reusable kit (all of it is TargetConfig/product behavior).
 */
export class TargetSearchRunner {
  constructor(private readonly kit: KitPixivClient) {}

  async searchIllustrations(
    target: TargetConfig,
    requestDelayMs: number,
    signal?: AbortSignal
  ): Promise<PixivIllust[]> {
    if (target.tagRelation === 'or') {
      return this.mergeTagUnion(target, requestDelayMs, (t, tag, d) =>
        this.searchSingleIllust(t, tag, d, signal), signal);
    }
    return this.searchSingleIllust(target, target.tag!, requestDelayMs, signal);
  }

  async searchNovels(
    target: TargetConfig,
    requestDelayMs: number,
    signal?: AbortSignal
  ): Promise<PixivNovel[]> {
    if (target.tagRelation === 'or') {
      return this.mergeTagUnion(target, requestDelayMs, (t, tag, d) =>
        this.searchSingleNovel(t, tag, d, signal), signal);
    }
    return this.searchSingleNovel(target, target.tag!, requestDelayMs, signal);
  }

  private async mergeTagUnion<T extends PixivIllust | PixivNovel>(
    target: TargetConfig,
    requestDelayMs: number,
    runOne: (target: TargetConfig, tag: string, delayMs: number) => Promise<T[]>,
    signal?: AbortSignal
  ): Promise<T[]> {
    const tags = target.tag!.split(/\s+/).map((t) => t.trim()).filter(Boolean);
    if (tags.length <= 1) return runOne(target, target.tag!, requestDelayMs);

    const seen = new Set<string>();
    const merged: T[] = [];
    for (let i = 0; i < tags.length; i++) {
      throwIfAborted(signal, 'search cancelled');
      const part = await runOne(target, tags[i], requestDelayMs);
      for (const item of part) {
        const key = String(item.id);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(item);
        }
      }
      if (target.limit && merged.length >= target.limit) break;
      if (i < tags.length - 1 && requestDelayMs > 0) await delay(requestDelayMs, undefined, { signal });
    }
    const sorted = sortPixivItems(merged, target.sort);
    return target.limit ? sorted.slice(0, target.limit) : sorted;
  }

  private async searchSingleIllust(
    target: TargetConfig,
    tag: string,
    requestDelayMs: number,
    signal?: AbortSignal
  ): Promise<PixivIllust[]> {
    return this.searchWithPagination<PixivIllust, IllustSearchOptions>(
      target,
      tag,
      requestDelayMs,
      (options) => this.kit.illustrations.searchPage(options),
      (t, g) => mapTargetToIllustQuery({ ...t, tag: g }),
      signal
    );
  }

  private async searchSingleNovel(
    target: TargetConfig,
    tag: string,
    requestDelayMs: number,
    signal?: AbortSignal
  ): Promise<PixivNovel[]> {
    return this.searchWithPagination<PixivNovel, NovelSearchOptions>(
      target,
      tag,
      requestDelayMs,
      (options) => this.kit.novels.searchPage(options),
      (t, g) => mapTargetToNovelQuery({ ...t, tag: g }),
      signal
    );
  }

  /**
   * Date-aware pagination. Mirrors the legacy SearchService semantics:
   * - parse/validate the configured date range;
   * - over-fetch when a limit + date filter would otherwise truncate too early;
   * - stop paging once date_desc/date_asc walks past the range boundary;
   * - post-filter popular_desc results by the date range;
   * - final stable sort + target.limit slice.
   */
  private async searchWithPagination<T extends PixivIllust | PixivNovel, O extends IllustSearchOptions | NovelSearchOptions>(
    target: TargetConfig,
    tag: string,
    requestDelayMs: number,
    fetchPage: (options: O) => Promise<{ items: T[]; next: string | null }>,
    buildBase: (t: TargetConfig, tag: string) => O,
    signal?: AbortSignal
  ): Promise<T[]> {
    const fetchOne = fetchPage as (options: IllustSearchOptions | NovelSearchOptions) => Promise<{ items: T[]; next: string | null }>;
    logger.debug('Searching Pixiv', {
      tag,
      sort: target.sort,
      searchTarget: target.searchTarget,
      startDate: target.startDate,
      endDate: target.endDate,
    });

    const parsed = parseDateRange(target.startDate, target.endDate);
    if (parsed === null && (target.startDate || target.endDate)) {
      logger.warn('Invalid date range specified, returning empty results', {
        startDate: target.startDate,
        endDate: target.endDate,
      });
      return [];
    }
    const startDate = parsed?.startDate ?? null;
    const endDate = parsed?.endDate ?? null;

    const sortMode = target.sort || 'date_desc';
    const hasDateFilter = !!(startDate || endDate);
    const fetchLimit = this.calculateFetchLimit(target.limit, sortMode, hasDateFilter);

    const base = buildBase({ ...target, tag }, tag);

    const results: T[] = [];
    let cursor: string | null = null;
    let pageCount = 0;
    let shouldStop = false;

    while ((!fetchLimit || results.length < fetchLimit) && !shouldStop) {
      throwIfAborted(signal, 'search cancelled');
      pageCount++;
      // Dates are intentionally filtered CLIENT-side below (legacy behavior;
      // PixivFlow needs the early-stop walk on create_date).
      const page = await fetchOne({
        word: base.word,
        sort: base.sort,
        searchTarget: base.searchTarget,
        includeR18: base.includeR18,
        cursor,
        // Threaded into the kit transport, which combines it with its per-request
        // timeout and honours it in retry back-off. Without this the pager could
        // stay blocked in a single hung request for the rest of the run.
        signal,
      });
      cursor = page.next;

      for (const item of page.items) {
        const decision = this.filterItemByDate(item, target, startDate, endDate, sortMode);
        if (decision.shouldStop) {
          shouldStop = true;
          break;
        }
        if (decision.shouldInclude) {
          results.push(item);
          if (fetchLimit && results.length >= fetchLimit) break;
        }
      }

      if (cursor && requestDelayMs > 0 && !shouldStop) {
        logger.debug(
          `Tag "${tag}" page ${pageCount}: total collected ${results.length}, waiting ${requestDelayMs}ms...`
        );
        await delay(requestDelayMs, undefined, { signal });
      }
      if (!cursor) break;
    }

    let finalResults = results;
    if (sortMode === 'popular_desc' && hasDateFilter && results.length > 0) {
      const valid = results.filter((item) => {
        if (!item.create_date) return false;
        const d = new Date(item.create_date);
        return !isNaN(d.getTime()) && isDateInRange(d, startDate, endDate);
      });
      finalResults = valid;
    }

    const sorted = sortPixivItems(finalResults, target.sort);
    return target.limit ? sorted.slice(0, target.limit) : sorted;
  }

  private filterItemByDate<T extends PixivIllust | PixivNovel>(
    item: T,
    target: TargetConfig,
    startDate: Date | null,
    endDate: Date | null,
    sortMode: string
  ): { shouldInclude: boolean; shouldStop: boolean } {
    const itemDate = item.create_date ? new Date(item.create_date) : null;
    if (!itemDate || isNaN(itemDate.getTime())) {
      if (!startDate && !endDate) return { shouldInclude: true, shouldStop: false };
      logger.debug(`Skipping item ${item.id} with invalid date ${item.create_date}`);
      return { shouldInclude: false, shouldStop: false };
    }

    const inRange = isDateInRange(itemDate, startDate, endDate);

    if (sortMode === 'date_desc' && !inRange) {
      if (endDate && itemDate > endDate) {
        return { shouldInclude: false, shouldStop: false };
      }
      if (startDate && itemDate < startDate) {
        logger.debug(`Stopping search: item ${item.id} before startDate ${target.startDate}`);
        return { shouldInclude: false, shouldStop: true };
      }
    }
    if (sortMode === 'date_asc' && !inRange) {
      if (startDate && itemDate < startDate) return { shouldInclude: false, shouldStop: false };
      if (endDate && itemDate > endDate) {
        logger.debug(`Stopping search: item ${item.id} after endDate ${target.endDate}`);
        return { shouldInclude: false, shouldStop: true };
      }
    }
    if (sortMode === 'popular_desc' && !inRange) {
      return { shouldInclude: false, shouldStop: false };
    }
    return { shouldInclude: inRange || (!startDate && !endDate), shouldStop: false };
  }

  private calculateFetchLimit(
    limit: number | undefined,
    sortMode: string,
    hasDateFilter: boolean
  ): number | undefined {
    if (!limit) return undefined;
    if (limit < 50) {
      return Math.max(limit * (sortMode === 'popular_desc' && hasDateFilter ? 10 : 5), 100);
    }
    return Math.max(limit * (sortMode === 'popular_desc' && hasDateFilter ? 3 : 2), 200);
  }
}
