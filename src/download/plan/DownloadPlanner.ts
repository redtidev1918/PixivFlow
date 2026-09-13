import type { TargetConfig } from '../../config';
import type { PixivIllust, PixivNovel } from '@redtidev/pixiv-client';
import { parseDateRange, isDateInRange } from '../../utils/date-utils';
import { isAIIllustration } from '../../utils/ai-detection';
import { logger } from '../../logger';
import type { IDatabase } from '../../interfaces/IDatabase';
import type { CandidateSkip } from '../../scheduler/TargetOutcome';

export type DownloadItem = PixivIllust | PixivNovel;

interface FilterResult<T extends DownloadItem> {
  items: T[];
  filteredOut: number;
  originalCount: number;
}

export interface PlannedDownload<T extends DownloadItem> {
  queue: T[];
  mode: 'sequential' | 'random';
  limit: number;
  /**
   * Maximum candidates this plan may ATTEMPT. Always `queue.length`, so the
   * bound is enforced structurally: the pipeline cannot scan further than the
   * window it was handed. Reported in the terminal outcome as "scanning N".
   */
  scanBound: number;
  filteredOut: number;
  deduplicated: number;
  alreadyDownloaded: number;
  availableCount: number;
  originalCount: number;
  /**
   * Candidates the planner itself dropped BEFORE the download attempt —
   * already in download history, already CONFIRMED delivered to this target, or
   * already handled per durable history. They are skips, not failures, and are
   * reported in the terminal outcome so "skipping Y candidates" includes the
   * ones that never had to be downloaded.
   */
  prefiltered: CandidateSkip[];
  random?: {
    maxAttempts: number;
  };
}

/**
 * Default candidate-scan window. Five candidates is enough to survive a few
 * already-delivered works on a ranking page without turning one slot into a
 * long crawl; the operator can raise it per target or globally.
 */
export const DEFAULT_CANDIDATE_SCAN_LIMIT = 5;

/** Hard ceiling on the scan so a misconfigured value cannot become a crawl. */
export const MAX_CANDIDATE_SCAN_LIMIT = 100;

/**
 * Resolve the candidate-scan bound for one target: per-target override, then
 * the global `download.candidateScanLimit`, then the default. Clamped so a bad
 * value degrades to a working bound instead of disabling the bound.
 */
export function resolveCandidateScanLimit(
  target: TargetConfig,
  fallback?: number
): number {
  const configured = target.candidateScanLimit ?? fallback ?? DEFAULT_CANDIDATE_SCAN_LIMIT;
  if (!Number.isFinite(configured)) return DEFAULT_CANDIDATE_SCAN_LIMIT;
  return Math.min(Math.max(Math.trunc(configured), 1), MAX_CANDIDATE_SCAN_LIMIT);
}

/**
 * Centralizes planning logic (filtering, deduplication, already-downloaded detection, random selection).
 */
export interface DeliveryDedupeSource {
  /** Returns the subset of ids already CONFIRMED delivered to this target. */
  deliveredIds?(deliveryTarget: string, workType: 'illustration' | 'novel', ids: string[]): Set<string>;
  /**
   * Returns the subset of ids already SUBMITTED for this target — delivered OR
   * still awaiting a review answer. Candidate selection prefers this over
   * `deliveredIds`: a work whose review submission is pending is already in the
   * human queue, so selecting it again would submit it twice.
   */
  submittedIds?(deliveryTarget: string, workType: 'illustration' | 'novel', ids: string[]): Set<string>;
  /**
   * Works this bot has already handled ANYWHERE — durable history owned by a
   * control plane, supplied by the caller.
   *
   * This is what makes a disposable runner safe: its local database starts empty,
   * so without external history it re-selects works that were delivered weeks ago
   * and the run silently produces nothing new. Unlike `deliveredIds` it does not
   * depend on a local delivery target existing.
   */
  processedIds?(workType: 'illustration' | 'novel', ids: string[]): Set<string>;
}

export class DownloadPlanner {
  constructor(
    private readonly database: IDatabase,
    private readonly deliveryDedupe?: DeliveryDedupeSource,
    /**
     * Global candidate-scan bound (`download.candidateScanLimit`). A per-target
     * `candidateScanLimit` overrides it.
     */
    private readonly defaultCandidateScanLimit?: number
  ) {}

  planDownloads<T extends DownloadItem>(
    items: T[],
    target: TargetConfig,
    itemType: 'illustration' | 'novel'
  ): PlannedDownload<T> {
    const filtered = this.filterItems(items, target, itemType);
    const { items: deduplicatedItems, removed } = this.deduplicate(filtered.items);
    /**
     * Candidates dropped before any download attempt. Reported as explicit
     * skips so the terminal outcome can say "skipping Y candidates" instead of
     * claiming a run produced nothing for no stated reason.
     */
    const prefiltered: CandidateSkip[] = [];
    const ruleFiltered = new Set(deduplicatedItems.map((item) => String(item.id)));
    for (const item of items) {
      const id = String(item.id);
      if (!ruleFiltered.has(id)) {
        // Excluded by the target's own rules (bookmarks/date/AI) — or a
        // repeated id inside the page. Both are candidate-level skips.
        prefiltered.push({ code: 'filtered', workId: id, reason: 'excluded by target filters (bookmarks/date/AI)' });
      }
    }

    const itemIds = deduplicatedItems.map((item) => String(item.id));
    const downloadedIds =
      itemIds.length > 0 ? this.database.getDownloadedIds(itemIds, itemType) : new Set<string>();
    let available = deduplicatedItems.filter((item) => !downloadedIds.has(String(item.id)));
    const alreadyDownloadedCount = deduplicatedItems.length - available.length;
    for (const item of deduplicatedItems) {
      const id = String(item.id);
      if (downloadedIds.has(id)) {
        prefiltered.push({ code: 'duplicate', workId: id, reason: 'already in download history' });
      }
    }

    // DELIVERY dedupe (pre-lock, distinct from download dedupe): skip works
    // already SUBMITTED for THIS target — confirmed delivered, or still awaiting
    // a review answer — so ranking falls through to the next valid candidate
    // instead of selecting a historical duplicate. `submittedIds` is preferred
    // because a pending review submission is already in the human queue.
    // Best-effort only: downstream reconciliation remains the final safety net.
    const deliveryTarget = target.delivery?.target?.trim();
    const submittedQuery =
      this.deliveryDedupe?.submittedIds ?? this.deliveryDedupe?.deliveredIds;
    let deliveryDuplicateCount = 0;
    if (
      deliveryTarget &&
      submittedQuery &&
      typeof (this.database as { deliveries?: unknown }).deliveries === 'object'
    ) {
      try {
        const taken = submittedQuery.call(
          this.deliveryDedupe,
          deliveryTarget,
          itemType,
          available.map((item) => String(item.id))
        );
        const before = available.length;
        for (const item of available) {
          const id = String(item.id);
          if (taken.has(id)) {
            prefiltered.push({
              code: 'duplicate',
              workId: id,
              reason: `already submitted to ${deliveryTarget} (delivery ledger)`,
            });
          }
        }
        available = available.filter((item) => !taken.has(String(item.id)));
        deliveryDuplicateCount = before - available.length;
        if (deliveryDuplicateCount > 0) {
          logger.info(`Delivery dedupe skipped ${deliveryDuplicateCount} already-submitted ${itemType}(s) for ${deliveryTarget}`);
        }
      } catch (error) {
        logger.warn('Delivery dedupe preflight failed; continuing (downstream net remains)', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // DURABLE duplicate history (independent of any local delivery target): a
    // disposable runner must not re-select work this bot already handled.
    const processedSource = this.deliveryDedupe?.processedIds;
    if (processedSource && available.length > 0) {
      try {
        const processed = processedSource(itemType, available.map((item) => String(item.id)));
        const before = available.length;
        for (const item of available) {
          const id = String(item.id);
          if (processed.has(id)) {
            prefiltered.push({ code: 'duplicate', workId: id, reason: 'already handled (durable history)' });
          }
        }
        available = available.filter((item) => !processed.has(String(item.id)));
        const skipped = before - available.length;
        if (skipped > 0) {
          logger.info(`Durable history skipped ${skipped} already-processed ${itemType}(s)`);
        }
      } catch (error) {
        logger.warn('Durable duplicate history lookup failed; continuing', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const limit = target.limit && target.limit > 0 ? target.limit : 10;
    // How many candidates this run may ATTEMPT. Distinct from `limit`, which is
    // how many it may PRODUCE. A scheduled one-post-per-slot target has
    // `limit: 1`, so keying the candidate window off `limit` alone handed the
    // pipeline exactly one candidate: the first duplicate ended the slot with
    // nothing submitted. Never below `limit`, so a multi-work target can still
    // fill its own limit.
    const scanBound = Math.max(limit, resolveCandidateScanLimit(target, this.defaultCandidateScanLimit));

    if (target.random) {
      const shuffled = this.shuffle(available);
      // Historical 50-attempt random pool, unless the operator set an explicit
      // bound — in which case that bound is the contract.
      const attemptPool = target.candidateScanLimit !== undefined ? scanBound : 50;
      const maxAttempts = Math.min(shuffled.length, Math.max(limit, attemptPool));
      const queue = shuffled.slice(0, maxAttempts);
      return {
        queue,
        mode: 'random',
        limit,
        scanBound: queue.length,
        filteredOut: filtered.filteredOut,
        deduplicated: removed,
        alreadyDownloaded: alreadyDownloadedCount,
        availableCount: available.length,
        originalCount: filtered.originalCount,
        prefiltered,
        random: { maxAttempts },
      };
    }

    // How many candidates the run may ATTEMPT:
    //   window = clamp(candidateScanLimit, lower = limit, upper = pool)
    // where `pool` is what the operator asked to consider — the whole page for a
    // plain search/ranking target, and a deliberately deeper pool for full-text
    // novel language filtering or topic discovery. `candidateScanLimit` is the
    // hard cap; it is never exceeded, and it is never allowed below `limit`
    // because a multi-work target must still be able to fill its own limit.
    const pool = itemType === 'novel' && target.languageFilter
      ? Math.max(limit, Math.min(target.languageCandidateLimit ?? 20, 100))
      : target.mode === 'topic'
        ? Math.max(limit, 20)
        : available.length;
    const windowSize = Math.max(limit, Math.min(pool, scanBound));
    const queue = available.slice(0, Math.min(available.length, windowSize));
    if (queue.length > limit) {
      logger.info(
        `Candidate scan window: up to ${queue.length} candidate(s) to fill ${limit} slot(s) ` +
          `(bound ${scanBound}, pool ${pool}, ${available.length} available)`
      );
    }

    return {
      queue,
      mode: 'sequential',
      limit,
      scanBound: queue.length,
      filteredOut: filtered.filteredOut,
      deduplicated: removed,
      alreadyDownloaded: alreadyDownloadedCount,
      availableCount: available.length,
      originalCount: filtered.originalCount,
      prefiltered,
    };
  }

  private filterItems<T extends DownloadItem>(
    items: T[],
    target: TargetConfig,
    itemType: 'illustration' | 'novel'
  ): FilterResult<T> {
    let filtered = [...items];
    const originalCount = filtered.length;

    if (target.minBookmarks !== undefined) {
      const beforeCount = filtered.length;
      filtered = filtered.filter((item) => {
        const bookmarks = (item as any).total_bookmarks ?? (item as any).bookmark_count ?? 0;
        return bookmarks >= target.minBookmarks!;
      });
      if (filtered.length < beforeCount) {
        logger.info(
          `Filtered by minBookmarks (>= ${target.minBookmarks}): ${beforeCount} -> ${filtered.length} ${itemType}(s)`
        );
      }
    }

    if (target.startDate || target.endDate) {
      const beforeCount = filtered.length;
      const dateRange = parseDateRange(target.startDate, target.endDate);

      if (dateRange === null) {
        logger.warn('Invalid date range in DownloadPlanner.filterItems, skipping date filter', {
          startDate: target.startDate,
          endDate: target.endDate,
        });
      } else {
        const { startDate, endDate } = dateRange;
        filtered = filtered.filter((item) => {
          if (!item.create_date) return false;
          const itemDate = new Date(item.create_date);
          if (!itemDate || isNaN(itemDate.getTime())) return false;
          return isDateInRange(itemDate, startDate, endDate);
        });

        if (filtered.length < beforeCount) {
          const dateRangeStr = [target.startDate || 'unlimited', target.endDate || 'unlimited'].join(' ~ ');
          logger.info(
            `Filtered by date range (${dateRangeStr}): ${beforeCount} -> ${filtered.length} ${itemType}(s)`
          );
        }
      }
    }

    if (itemType === 'illustration' && target.excludeAI === true) {
      const beforeCount = filtered.length;
      // Official Pixiv flag (`illust_ai_type === 2`) or explicit AI tags
      // (生成AI / AI生成 / Generative AI ...) — tag matching also catches
      // works whose AI classification field is missing or not yet set.
      filtered = filtered.filter((item) => !isAIIllustration(item));
      if (filtered.length < beforeCount) {
        logger.info(`Excluded ${beforeCount - filtered.length} Pixiv AI-generated illustration(s)`);
      }
    }

    if (filtered.length < originalCount) {
      logger.info(
        `Total filtering: ${originalCount} -> ${filtered.length} ${itemType}(s) after applying all filters`
      );
    }

    return {
      items: filtered,
      filteredOut: originalCount - filtered.length,
      originalCount,
    };
  }

  private deduplicate<T extends DownloadItem>(items: T[]): { items: T[]; removed: number } {
    if (items.length === 0) {
      return { items, removed: 0 };
    }

    const seen = new Set<string>();
    const deduplicated: T[] = [];
    for (const item of items) {
      const key = String(item.id);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduplicated.push(item);
    }

    const removed = items.length - deduplicated.length;
    if (removed > 0) {
      logger.debug(`Deduplicated ${removed} duplicate item(s) before planning`);
    }
    return { items: deduplicated, removed };
  }

  private shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}