import { setTimeout as delay } from 'node:timers/promises';

import { logger } from '../logger';
import { calculatePopularityScore } from '../utils/pixiv-utils';
import type { TargetConfig } from '../config';
import type { TopicResolver } from './TopicResolver';
import type {
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
  rawCount: number;
  dedupedCount: number;
  acceptedCount: number;
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
    private readonly requestDelayMs = 500
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

    const byId = new Map<number, { work: T; candidate: TopicCandidate }>();
    let rawCount = 0;
    const tagNames = space.tags.map((t) => t.name);

    for (let i = 0; i < tagNames.length; i++) {
      if (byId.size >= maxCandidates) break;
      const tag = tagNames[i];
      const works = await this.searchDay<T>(contentType, tag, day, maxPerTag);
      rawCount += works.length;
      for (const work of works) {
        if (byId.has(work.id)) continue;
        byId.set(work.id, { work, candidate: this.toCandidate(work, contentType) });
        if (byId.size >= maxCandidates) break;
      }
      logger.debug('[TopicCollector] type=' + contentType + ' tag=' + tag + ' day=' + day + ' fetched=' + works.length + ' pool=' + byId.size);
      if (i < tagNames.length - 1 && this.requestDelayMs > 0) await delay(this.requestDelayMs);
    }

    const dedupedCount = byId.size;
    logger.info('[TopicCollector] type=' + contentType + ' raw=' + rawCount + ' deduplicated=' + dedupedCount);

    const seedKey = this.key(topic);
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

    const chosen = this.topByPopularity(accepted, limit);
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
        rawCount,
        dedupedCount,
        acceptedCount: accepted.length,
      },
    };
  }

  private async searchDay<T extends WorkLike>(
    contentType: TopicContentType,
    tag: string,
    day: string,
    limit: number
  ): Promise<T[]> {
    try {
      const opts = { startDate: day, endDate: day };
      const works = contentType === 'illustration'
        ? await this.client.searchIllustrationsForTags(tag, limit, opts)
        : await this.client.searchNovelsForTags(tag, limit, opts);
      // Date is already enforced server-side + pager stop; keep a cheap guard.
      return works.filter((w) => this.onDay(w.create_date, day)) as unknown as T[];
    } catch (error) {
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
    };
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
   * Rank primarily by topic relevance tier, then by local popularity within a
   * tier. Relevance wins because the goal is "belongs to the topic", with
   * popularity deciding which on-topic work to download.
   */
  private relevanceTier(c: TopicCandidate): number {
    if (c.metadataScore >= 1.0) return 3; // carries the seed tag / strong evidence
    if (c.metadataScore >= 0.7) return 2;
    return 1;
  }

  private rankCompare(a: TopicCandidate, b: TopicCandidate): number {
    const tier = this.relevanceTier(b) - this.relevanceTier(a);
    if (tier !== 0) return tier;
    return b.popularity - a.popularity;
  }

  private topByPopularity<T>(items: Array<{ work: T; candidate: TopicCandidate }>, limit: number) {
    if (items.length <= limit) return items.sort((a, b) => this.rankCompare(a.candidate, b.candidate));
    // O(n) top-`limit` selection (limit is tiny, e.g. 1); avoids a full sort.
    const top: Array<{ work: T; candidate: TopicCandidate }> = [];
    for (const item of items) {
      if (top.length < limit) {
        top.push(item);
        top.sort((a, b) => this.rankCompare(a.candidate, b.candidate));
      } else if (this.rankCompare(item.candidate, top[top.length - 1].candidate) < 0) {
        top[top.length - 1] = item;
        top.sort((a, b) => this.rankCompare(a.candidate, b.candidate));
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