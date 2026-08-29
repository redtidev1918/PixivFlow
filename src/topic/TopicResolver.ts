import { setTimeout as delay } from 'node:timers/promises';

import { logger } from '../logger';
import { TopicCache } from './TopicCache';
import { TopicTagScorer } from './TopicTagScorer';
import type {
  ResolvedTag,
  TopicClient,
  TopicContentType,
  TopicDiscoveryOptions,
  TopicSpace,
  WorkLike,
} from './types';

/** Platform-wide tags never worth searching as topic keys or scoring metadata. */
const STOP_TAGS = new Set([
  'r-18', 'r-18g', 'r-15', 'original', 'オリジナル', '創作', '女の子', '男の子',
  'イラスト', '漫画', 'manga', 'illustration', 'artwork', '落書き', 'らくがき',
  '1000users入り', '5000users入り', '10000users入り', '500users入り', '100users入り',
  'pixiv', 'commission', 'skeb', '依頼絵', '仕事絵', 'aiイラスト',
]);

const DEFAULTS = {
  maxTags: 12,
  sampleWorks: 100,
  cacheDays: 7,
  minScore: 0.22,
};

/**
 * Resolves a user topic into a bounded, cached set of related Pixiv tags.
 *
 * Discovery is intentionally one-hop around the ORIGINAL seed only (depth = 1):
 * related tags never become new seeds, so the topic cannot drift outward. All
 * network use is bounded and serial. Refresh failures degrade gracefully to a
 * stale cache, then to the seed tag alone.
 */
export class TopicResolver {
  private readonly scorer = new TopicTagScorer();

  constructor(
    private readonly client: TopicClient,
    private readonly cache: TopicCache,
    private readonly requestDelayMs = 500
  ) {}

  /** Resolve tags for a topic+type, using cache when fresh. Never throws for
   *  discovery errors: it always returns at least the seed tag. */
  async resolve(
    topic: string,
    contentType: TopicContentType,
    options: TopicDiscoveryOptions = {}
  ): Promise<{ space: TopicSpace; fromCache: boolean; degraded: boolean }> {
    const seed = topic.trim();
    if (!seed) throw new Error('Topic must not be empty');

    const maxTags = this.bound(options.maxTags, DEFAULTS.maxTags, 1, 40, 'maxTags');
    const sampleWorks = this.bound(options.sampleWorks, DEFAULTS.sampleWorks, 10, 200, 'sampleWorks');
    const cacheDays = this.bound(options.cacheDays, DEFAULTS.cacheDays, 1, 90, 'cacheDays');
    const minScore = options.minScore ?? DEFAULTS.minScore;

    if (!options.refresh) {
      const fresh = await this.cache.loadFresh(seed, contentType);
      if (fresh) {
        logger.info(`[TopicResolver] topic=${seed} type=${contentType} cache hit age=${this.ageDays(fresh)}d tags=${fresh.tags.length}`);
        return { space: fresh, fromCache: true, degraded: false };
      }
    }

    logger.info(`[TopicResolver] refreshing topic=${seed} type=${contentType}`);
    try {
      const space = await this.discover(seed, contentType, { maxTags, sampleWorks, cacheDays, minScore, includeR18: options.includeR18 === true });
      await this.cache.save(space);
      logger.info(`[TopicResolver] topic=${seed} type=${contentType} resolvedTags=${space.tags.length} sampled=${space.sampledWorks}`);
      for (const tag of space.tags.slice(0, maxTags)) {
        logger.debug(`[TopicResolver] tag=${tag.name} score=${tag.score} occ=${tag.occurrences} spec=${tag.specificity}`);
      }
      return { space, fromCache: false, degraded: false };
    } catch (error) {
      const stale = await this.cache.loadAny(seed, contentType);
      if (stale) {
        logger.warn(`[TopicResolver] refresh failed, using stale cache topic=${seed}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return { space: stale, fromCache: true, degraded: true };
      }
      logger.warn(`[TopicResolver] refresh failed with no cache, falling back to seed topic=${seed}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { space: this.seedOnly(seed, contentType, cacheDays), fromCache: false, degraded: true };
    }
  }

  private async discover(
    seed: string,
    contentType: TopicContentType,
    cfg: { maxTags: number; sampleWorks: number; cacheDays: number; minScore: number; includeR18: boolean }
  ): Promise<TopicSpace> {
    const [suggested, topicWorks, backgroundWorks] = await this.gatherSamples(seed, contentType, cfg.sampleWorks, cfg.includeR18);

    const suggestedNames = new Set(suggested.map((t) => this.scorer.key(t.name)).filter(Boolean));
    const related = this.scorer.score({
      seed,
      topicWorks,
      backgroundWorks,
      suggestedNames,
      suggestedTags: suggested,
    });

    // Seed tag always leads the space with score 1.0; keep related tags above
    // the relevance floor and cap the total.
    const seedTag: ResolvedTag = {
      name: seed,
      translatedName: suggested.find((t) => this.scorer.key(t.name) === this.scorer.key(seed))?.translated_name,
      score: 1,
      occurrences: topicWorks.length,
      coverage: 1,
      specificity: 1,
      suggested: suggestedNames.has(this.scorer.key(seed)),
      seed: true,
    };

    const accepted = related
      .filter((tag) => tag.score >= cfg.minScore)
      .filter((tag) => !STOP_TAGS.has(this.scorer.key(tag.name)))
      .slice(0, cfg.maxTags - 1);
    const tags = [seedTag, ...accepted];

    const now = Date.now();
    return {
      version: 1,
      topic: seed,
      contentType,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + cfg.cacheDays * 24 * 60 * 60_000).toISOString(),
      sampleSize: cfg.sampleWorks,
      sampledWorks: topicWorks.length,
      tags,
    };
  }

  /** Serial, bounded fetches: autocomplete → topic sample → small background. */
  private async gatherSamples(
    seed: string,
    contentType: TopicContentType,
    sampleWorks: number,
    includeR18: boolean
  ): Promise<[Array<{ name: string; translated_name?: string }>, WorkLike[], WorkLike[]]> {
    const suggested = await this.client.getTagAutocomplete(seed).catch(() => [] as Array<{ name: string; translated_name?: string }>);
    if (this.requestDelayMs > 0) await delay(this.requestDelayMs);

    const topicWorks = contentType === 'illustration'
      ? await this.client.searchIllustrationsForTags(seed, sampleWorks, { includeR18 })
      : await this.client.searchNovelsForTags(seed, sampleWorks, { includeR18 });

    // A small, cheap background sample (a common platform tag) estimates how
    // generic a co-occurring tag is. Bounded to keep requests/memory low.
    if (this.requestDelayMs > 0) await delay(this.requestDelayMs);
    const backgroundWorks = contentType === 'illustration'
      ? await this.client.searchIllustrationsForTags('イラスト', 40, { includeR18 }).catch(() => [] as WorkLike[])
      : await this.client.searchNovelsForTags('小説', 40, { includeR18 }).catch(() => [] as WorkLike[]);

    return [suggested, topicWorks, backgroundWorks];
  }

  private seedOnly(seed: string, contentType: TopicContentType, cacheDays: number): TopicSpace {
    const now = Date.now();
    return {
      version: 1,
      topic: seed,
      contentType,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + cacheDays * 24 * 60 * 60_000).toISOString(),
      sampleSize: 0,
      sampledWorks: 0,
      tags: [{ name: seed, score: 1, occurrences: 0, coverage: 1, specificity: 1, suggested: false, seed: true }],
    };
  }

  private ageDays(space: TopicSpace): number {
    const created = Date.parse(space.createdAt);
    if (!Number.isFinite(created)) return 0;
    return Math.max(0, Math.round((Date.now() - created) / 86_400_000));
  }

  private bound(value: number | undefined, fallback: number, min: number, max: number, name: string): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
      throw new Error(`topicDiscovery.${name} must be an integer between ${min} and ${max}`);
    }
    return resolved;
  }
}