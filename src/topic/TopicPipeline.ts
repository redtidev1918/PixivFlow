import { setTimeout as delay } from 'node:timers/promises';

import { logger } from '../logger';
import { calculatePopularityScore } from '../utils/pixiv-utils';
import { isAIIllustration } from '../utils/ai-detection';
import { PaginationError, rethrowIfCancelled, throwIfAborted } from '../utils/errors';
import type { TargetConfig } from '../config';
import type { TopicResolver } from './TopicResolver';
import type {
  RelatedTagMode,
  TopicCandidate,
  TopicClient,
  TopicCollectOptions,
  TopicContentType,
  TopicDiscoveryOptions,
  WorkLike,
} from './types';

const COLLECT_DEFAULTS = { maxPerTag: 40, maxCandidates: 250, minMetadataScore: 0.35 };

/** Small, platform-level tags that are never evidence of topic membership. */
const STOP_TAGS = new Set([
  'r-18', 'r-18g', 'r-15', 'original', 'オリジナル', '創作', '女の子', '男の子',
  'イラスト', '漫画', 'manga', 'illustration', 'artwork', '落書き', 'らくがき',
  '1000users入り', '5000users入り', '10000users入り', '500users入り', '100users入り',
  'pixiv', 'commission', 'skeb', '依頼絵', '仕事絵',
]);

export interface TopicSelection {
  candidates: TopicCandidate[];
  selected: TopicCandidate[];
  resolvedTagCount: number;
  /**
   * Tags actually searched for the day. Under `relatedTags: 'always'` this is
   * the whole resolved space; under the seed-first modes it is the seed tag and
   * only the related tags that were really needed (§topic-recall).
   */
  searchedTags?: string[];
  rawCount: number;
  dedupedCount: number;
  acceptedCount: number;
  aiExcludedCount: number;
  /** Works seen more than once across the topic tag space (recorded, dropped). */
  duplicateRemovedCount: number;
}

/**
 * Resolves a topic to a tag space, collects that day's works across the tags,
 * filters by lightweight metadata relevance and ranks by local popularity, then
 * returns only the chosen full work objects for the existing download pipeline.
 * Serial, bounded, low-memory: the retained set is `limit` items; the pool is
 * capped at maxCandidates and released after selection.
 */
export class TopicPipeline {
  constructor(
    private readonly client: TopicClient,
    private readonly resolver: TopicResolver,
    private readonly requestDelayMs = 500,
    /**
     * Run-scoped cancellation. Candidate acquisition is the longest stretch of
     * network work in a run, so it must observe the same abort as the download
     * pipeline; otherwise a cancelled run keeps searching tags and can never
     * settle, which is what let a timed-out run hold its slot lease forever.
     */
    private readonly signal?: AbortSignal
  ) {}

  async selectWorks<T extends WorkLike>(
    target: TargetConfig,
    contentType: TopicContentType,
    day: string,
    limit: number,
    discovery: TopicDiscoveryOptions,
    collect: TopicCollectOptions
  ): Promise<{ works: T[]; selection: TopicSelection }> {
    const topic = (target.topic ?? '').trim();
    const { space } = await this.resolver.resolve(topic, contentType, discovery);
    const tagScores = new Map(space.tags.map((t) => [this.key(t.name), t.score]));

    const maxPerTag = this.bound(collect.maxPerTag, COLLECT_DEFAULTS.maxPerTag, 5, 100);
    const maxCandidates = this.bound(collect.maxCandidates, COLLECT_DEFAULTS.maxCandidates, 20, 500);
    const minMetadataScore = collect.minMetadataScore ?? COLLECT_DEFAULTS.minMetadataScore;
    const includeR18 = discovery.includeR18 === true;
    // An unknown mode (hand-written config bypassing validation) falls back to
    // the historical behaviour rather than silently narrowing recall.
    const requestedMode = discovery.relatedTags;
    const relatedMode: RelatedTagMode =
      requestedMode === 'when_seed_insufficient' || requestedMode === 'never' ? requestedMode : 'always';

    const byId = new Map<number, { work: T; candidate: TopicCandidate }>();
    let rawCount = 0;
    let aiExcludedCount = 0;
    let duplicateRemovedCount = 0;
    const tagNames = space.tags.map((t) => t.name);
    const seedKey = this.key(topic);
    const seedTags = tagNames.filter((name) => this.key(name) === seedKey);
    const relatedTags = tagNames.filter((name) => this.key(name) !== seedKey);
    const searchedTags: string[] = [];

    const collectTag = async (tag: string): Promise<void> => {
      // Cancellation is checked between tags, so a cancelled run stops issuing
      // new searches even when the aborted request itself had already returned.
      throwIfAborted(this.signal, 'topic collection cancelled');
      searchedTags.push(tag);
      const works = await this.searchDay<T>(contentType, tag, day, maxPerTag, includeR18);
      rawCount += works.length;
      for (const work of works) {
        if (contentType === 'illustration' && target.excludeAI === true && isAIIllustration(work)) {
          aiExcludedCount += 1;
          continue;
        }
        if (byId.has(work.id)) {
          duplicateRemovedCount += 1;
          continue;
        }
        byId.set(work.id, { work, candidate: this.toCandidate(work, contentType) });
        if (byId.size >= maxCandidates) break;
      }
      logger.debug('[TopicCollector] type=' + contentType + ' tag=' + tag + ' day=' + day + ' fetched=' + works.length + ' pool=' + byId.size);
    };

    const runTags = async (names: string[]): Promise<void> => {
      for (let i = 0; i < names.length; i++) {
        if (byId.size >= maxCandidates) break;
        await collectTag(names[i]);
        if (i < names.length - 1 && this.requestDelayMs > 0) await delay(this.requestDelayMs);
      }
    };

    // §topic-recall: a resolved tag space is a hierarchy, not a bag of
    // interchangeable tags. 'always' keeps the historical behaviour — every
    // resolved tag is a recall channel for the day. The seed-first modes search
    // the topic tag the operator actually asked for and only walk the related
    // channel when that cannot fill the target, so a second high-weight tag
    // (丸吞) cannot take the only slot of a 西瓜肚 target.
    if (seedTags.length === 0 || relatedMode === 'always') {
      // No seed tag in the space (hand-written space): keep walking everything
      // rather than returning nothing.
      await runTags(seedTags.length === 0 ? tagNames : [...seedTags, ...relatedTags]);
    } else {
      await runTags(seedTags);
      const seedAccepted = this.acceptedWorks(byId, seedKey, tagScores, minMetadataScore, limit, contentType).length;
      if (relatedMode === 'never') {
        logger.info('[TopicRecall] mode=never tag=' + topic + ' day=' + day + ' accepted=' + seedAccepted);
      } else if (seedAccepted < limit) {
        logger.info('[TopicRecall] mode=when_seed_insufficient tag=' + topic + ' seedAccepted=' + seedAccepted + '/' + limit + ' relatedTags=' + relatedTags.length + '; expanding');
        await runTags(relatedTags);
      } else {
        logger.info('[TopicRecall] mode=when_seed_insufficient tag=' + topic + ' seedAccepted=' + seedAccepted + '/' + limit + '; related tags not searched');
      }
    }

    const dedupedCount = byId.size;
    logger.info('[TopicCollector] type=' + contentType + ' raw=' + rawCount + ' deduplicated=' + dedupedCount + ' aiExcluded=' + aiExcludedCount + ' searchedTags=' + searchedTags.length);

    const accepted = this.acceptedWorks(byId, seedKey, tagScores, minMetadataScore, limit, contentType);
    const chosen = this.topByPopularity(accepted, limit, relatedMode === 'always' ? undefined : seedKey);
    const selected = chosen.map((e) => e.candidate);
    logger.info('[MetadataTopicFilter] accepted=' + accepted.length);
    if (selected[0]) {
      logger.info('[PopularityRanker] selected=' + selected[0].id + ' popularity=' + selected[0].popularity.toFixed(1) + ' meta=' + selected[0].metadataScore.toFixed(2) + ' title=' + selected[0].title);
    }

    return {
      works: chosen.map((e) => e.work),
      selection: {
        candidates: [...byId.values()].map((e) => e.candidate),
        selected,
        resolvedTagCount: space.tags.length,
        searchedTags,
        rawCount,
        dedupedCount,
        acceptedCount: accepted.length,
        aiExcludedCount,
        duplicateRemovedCount,
      },
    };
  }

  private async searchDay<T extends WorkLike>(
    contentType: TopicContentType,
    tag: string,
    day: string,
    limit: number,
    includeR18: boolean
  ): Promise<T[]> {
    try {
      const opts = { startDate: day, endDate: day, includeR18, signal: this.signal };
      const works = contentType === 'illustration'
        ? await this.client.searchIllustrationsForTags(tag, limit, opts)
        : await this.client.searchNovelsForTags(tag, limit, opts);
      // Date is already enforced server-side + pager stop; keep a cheap guard.
      return works.filter((w) => this.onDay(w.create_date, day)) as unknown as T[];
    } catch (error) {
      // A cancellation must not be degraded into "no results for this tag": that
      // would silently continue the cancelled run across the remaining tags.
      rethrowIfCancelled(error, this.signal);
      // A broken pager contract must not degrade either: reporting "no works
      // today" would hide the failure and let the run claim success.
      if (error instanceof PaginationError) throw error;
      logger.warn('[TopicCollector] search failed tag=' + tag + ' type=' + contentType + ': ' + (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  private toCandidate(work: WorkLike, type: TopicContentType): TopicCandidate {
    const popularity = calculatePopularityScore(work as never);
    return {
      id: work.id,
      type,
      title: work.title ?? '',
      caption: work.caption ?? '',
      tags: (work.tags ?? []).map((t) => t.name).filter(Boolean),
      bookmarks: Number(work.total_bookmarks ?? work.bookmark_count ?? 0) || 0,
      views: Number(work.total_view ?? work.view_count ?? 0) || 0,
      popularity,
      metadataScore: 0,
      ...(work.illust_ai_type !== undefined ? { aiType: work.illust_ai_type } : {}),
    };
  }

  /**
   * Applies the metadata gate to everything collected so far. When nothing at
   * all clears the threshold but the seed tag is present, the seed-tag works are
   * kept anyway: a sparse day must stay usable instead of reporting "no
   * candidates" for a topic that visibly has works. Extracted from selection so
   * the seed pass can be evaluated before deciding whether the related channel
   * is needed at all (§topic-recall).
   */
  private acceptedWorks<T extends WorkLike>(
    byId: Map<number, { work: T; candidate: TopicCandidate }>,
    seedKey: string,
    tagScores: Map<string, number>,
    minMetadataScore: number,
    limit: number,
    contentType: TopicContentType
  ): Array<{ work: T; candidate: TopicCandidate }> {
    const accepted: Array<{ work: T; candidate: TopicCandidate }> = [];
    for (const entry of byId.values()) {
      entry.candidate.metadataScore = this.metadataScore(entry.candidate, seedKey, tagScores);
      if (entry.candidate.metadataScore >= minMetadataScore) accepted.push(entry);
    }
    if (accepted.length === 0 && byId.size > 0) {
      const fallback = [...byId.values()]
        .filter((e) => e.candidate.tags.some((t) => this.key(t) === seedKey))
        .sort((a, b) => b.candidate.popularity - a.candidate.popularity);
      accepted.push(...fallback.slice(0, Math.max(limit, 1)));
      logger.warn('[MetadataTopicFilter] type=' + contentType + ' none above threshold ' + minMetadataScore + '; kept ' + accepted.length + ' seed-tag fallback');
    }
    return accepted;
  }

  /**
   * Lightweight metadata relevance. Tags dominate (Pixiv's own taxonomy);
   * title/caption add smaller boosts. The seed tag is strong evidence.
   * No text model — case/symbol-insensitive substring matching only.
   */
  private metadataScore(candidate: TopicCandidate, seedKey: string, tagScores: Map<string, number>): number {
    let seedHit = false;
    let relatedSum = 0;
    let relatedHits = 0;
    for (const tag of candidate.tags) {
      const k = this.key(tag);
      if (STOP_TAGS.has(k)) continue;
      if (k === seedKey) { seedHit = true; continue; }
      const related = tagScores.get(k);
      if (related !== undefined) { relatedSum += Math.min(related, 0.6); relatedHits += 1; }
    }
    const hayTitle = this.normalize(candidate.title);
    const hayCaption = this.normalize(candidate.caption);
    const titleSeed = !!seedKey && hayTitle.includes(seedKey);
    const captionSeed = !!seedKey && hayCaption.includes(seedKey);

    if (seedHit) {
      // Core topic work: the seed tag itself is the strongest evidence.
      let score = 1.0 + Math.min(relatedSum, 0.5);
      if (titleSeed) score += 0.4;
      return score;
    }
    // No seed tag: the work must show several independent related tags (or a
    // high-weight one plus text) to count as on-topic. A single marginal tag
    // deliberately does NOT clear the bar, so a hugely popular tangential work
    // cannot crowd out core topic works.
    let score = 0;
    const strongRelated = [...tagScores.entries()].some(([k, w]) => w >= 0.6 && candidate.tags.some((t) => this.key(t) === k));
    if (titleSeed) score += 0.8;
    if (captionSeed) score += 0.4;
    if (strongRelated) score += 0.5;
    score += Math.min(relatedSum, 0.6) * (relatedHits >= 2 ? 1 : 0.5);
    return score;
  }


  /**
   * Ranking is PURELY by local popularity (calculatePopularityScore). Metadata
   * relevance is only a gate: once a work clears minMetadataScore it is accepted
   * as on-topic, and the choice between accepted works is decided by popularity
   * alone. A work with a higher metadata score does NOT outrank a more popular
   * accepted work.
   *
   * `seedKey` adds a single tier in front of that popularity order and is only
   * passed by the seed-first recall modes (§topic-recall): when related tags
   * were reached as a fallback, a work that actually carries the topic tag must
   * outrank a related-only work, and popularity decides within each tier. The
   * default mode passes no `seedKey`, so the documented popularity-only ranking
   * is unchanged.
   */
  private popCompare(a: TopicCandidate, b: TopicCandidate): number {
    return b.popularity - a.popularity;
  }

  private rankCompare(seedKey: string | undefined) {
    if (!seedKey) return (a: TopicCandidate, b: TopicCandidate) => this.popCompare(a, b);
    const tier = (c: TopicCandidate) => (c.tags.some((t) => this.key(t) === seedKey) ? 0 : 1);
    return (a: TopicCandidate, b: TopicCandidate) => {
      const diff = tier(a) - tier(b);
      return diff !== 0 ? diff : this.popCompare(a, b);
    };
  }

  private topByPopularity<T>(
    items: Array<{ work: T; candidate: TopicCandidate }>,
    limit: number,
    seedKey?: string
  ) {
    if (items.length <= limit) return items.sort((a, b) => this.rankCompare(seedKey)(a.candidate, b.candidate));
    if (seedKey) return items.sort((a, b) => this.rankCompare(seedKey)(a.candidate, b.candidate)).slice(0, limit);
    // O(n) top-`limit` selection (limit is tiny, e.g. 1); avoids a full sort.
    const top: Array<{ work: T; candidate: TopicCandidate }> = [];
    for (const item of items) {
      if (top.length < limit) {
        top.push(item);
        top.sort((a, b) => this.popCompare(a.candidate, b.candidate));
      } else if (this.popCompare(item.candidate, top[top.length - 1].candidate) < 0) {
        top[top.length - 1] = item;
        top.sort((a, b) => this.popCompare(a.candidate, b.candidate));
      }
    }
    return top;
  }

  private onDay(createDate: string | undefined, day: string): boolean {
    if (!createDate) return true;
    return createDate.slice(0, 10) === day;
  }

  private normalize(value: string): string {
    return value.toLowerCase().normalize('NFKC');
  }

  private key(value: string): string {
    return value.trim().normalize('NFKC').toLocaleLowerCase();
  }

  private bound(value: number | undefined, fallback: number, min: number, max: number): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved < min || resolved > max) return fallback;
    return resolved;
  }
}

function seedText(key: string): string { return key; }
