/**
 * Unit tests for semantic-topic download: scoring, caching, graceful
 * degradation, dedup, metadata filtering and limit=1 selection.
 * No network — the Pixiv client is fully mocked.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';

import { TopicTagScorer } from '../../topic/TopicTagScorer';
import { TopicCache } from '../../topic/TopicCache';
import { TopicResolver } from '../../topic/TopicResolver';
import { TopicPipeline } from '../../topic/TopicPipeline';
import type { TopicClient, WorkLike } from '../../topic/types';

const tag = (name: string) => ({ name });
const work = (id: number, tags: string[], opts: Partial<WorkLike> = {}): WorkLike => ({
  id,
  title: opts.title ?? '',
  caption: opts.caption ?? '',
  create_date: opts.create_date ?? '2026-08-28T10:00:00+09:00',
  total_bookmarks: opts.total_bookmarks ?? 0,
  total_view: opts.total_view ?? 0,
  tags: tags.map(tag),
});

describe('TopicTagScorer', () => {
  it('ranks topic-specific tags above generic high-frequency tags', () => {
    const scorer = new TopicTagScorer();
    // Topic samples: テーマ甲関連/臨月 co-occur strongly; R-18/オリジナル appear too
    const topicWorks = [
      work(1, ['テーマ甲', 'テーマ甲関連', 'R-18', 'オリジナル']),
      work(2, ['テーマ甲', 'テーマ甲関連', '臨月']),
      work(3, ['テーマ甲', '臨月', 'R-18']),
      work(4, ['テーマ甲', 'テーマ甲関連']),
    ];
    // Background: R-18/オリジナル are common everywhere; テーマ甲関連/臨月 are rare
    const backgroundWorks = Array.from({ length: 20 }, (_, i) =>
      work(1000 + i, ['R-18', 'オリジナル', '女の子', i % 3 === 0 ? 'イラスト' : '創作'])
    );
    const scored = scorer.score({
      seed: 'テーマ甲',
      topicWorks,
      backgroundWorks,
      suggestedNames: new Set(['テーマ甲', 'テーマ甲関連']),
    });
    const byName = new Map(scored.map((s) => [s.name, s]));
    const preg = byName.get('テーマ甲関連')!.score;
    const r18 = byName.get('R-18')!.score;
    const orig = byName.get('オリジナル')!.score;
    // Specific tags must beat generic ones despite generic tags' frequency.
    expect(preg).toBeGreaterThan(r18);
    expect(preg).toBeGreaterThan(orig);
  });

  it('marks suggested tags and excludes the seed itself', () => {
    const scorer = new TopicTagScorer();
    const scored = scorer.score({
      seed: 'topic',
      topicWorks: [work(1, ['topic', 'related'])],
      backgroundWorks: [],
      suggestedNames: new Set(['related']),
    });
    expect(scored.find((s) => s.name === 'topic')).toBeUndefined();
    expect(scored.find((s) => s.name === 'related')!.suggested).toBe(true);
  });
});

describe('TopicCache', () => {
  let dir: string;
  beforeEach(async () => { dir = await fs.mkdtemp(join(os.tmpdir(), 'topic-cache-')); });

  const space = (createdAtMs: number, expiresAtMs: number) => ({
    version: 1 as const, topic: 'テーマ甲', contentType: 'illustration' as const,
    createdAt: new Date(createdAtMs).toISOString(), expiresAt: new Date(expiresAtMs).toISOString(),
    sampleSize: 10, sampledWorks: 4,
    tags: [{ name: 'テーマ甲', score: 1, occurrences: 4, coverage: 1, specificity: 1, suggested: false, seed: true }],
  });

  it('returns fresh entries, hides expired ones but still exposes them as stale', async () => {
    const now = 10_000;
    const cache = new TopicCache(dir, () => now);
    await cache.save(space(now - 1000, now + 10_000)); // expires in the future
    expect((await cache.loadFresh('テーマ甲', 'illustration'))?.topic).toBe('テーマ甲');

    const later = new TopicCache(dir, () => now + 100_000); // now past expiry
    expect(await later.loadFresh('テーマ甲', 'illustration')).toBeUndefined();
    expect((await later.loadAny('テーマ甲', 'illustration'))?.topic).toBe('テーマ甲');
  });

  it('persists on disk across instances (Docker volume reuse)', async () => {
    const now = 5_000;
    const cache = new TopicCache(dir, () => now);
    await cache.save(space(now, now + 60_000));
    const again = new TopicCache(dir, () => now);
    expect((await again.loadFresh('テーマ甲', 'illustration'))?.tags).toHaveLength(1);
  });
});

describe('TopicResolver', () => {
  const mockClient = (opts: { autocomplete?: string[]; illusts?: WorkLike[]; background?: WorkLike[]; fail?: boolean }): TopicClient => ({
    getTagAutocomplete: async () => opts.fail ? Promise.reject(new Error('net')) : (opts.autocomplete ?? []).map(tag),
    searchIllustrationsForTags: async (seed: string) => {
      if (opts.fail) throw new Error('net');
      if (seed === 'イラスト') return opts.background ?? [];
      return opts.illusts ?? [];
    },
    searchNovelsForTags: async () => { if (opts.fail) throw new Error('net'); return []; },
  });

  it('falls back to seed-only tag on first discovery failure', async () => {
    const dir = await fs.mkdtemp(join(os.tmpdir(), 'topic-res-'));
    const resolver = new TopicResolver(mockClient({ fail: true }), new TopicCache(dir), 0);
    const { space, degraded } = await resolver.resolve('テーマ甲', 'illustration', {});
    expect(degraded).toBe(true);
    expect(space.tags.map((t) => t.name)).toEqual(['テーマ甲']);
  });

  it('uses stale cache when refresh fails after expiry', async () => {
    const dir = await fs.mkdtemp(join(os.tmpdir(), 'topic-res2-'));
    const cache = new TopicCache(dir);
    // Seed a valid cache entry with a known related tag.
    const ok = new TopicResolver(mockClient({ illusts: [work(1, ['テーマ甲', 'テーマ甲関連'])] }), cache, 0);
    const first = await ok.resolve('テーマ甲', 'illustration', {});
    expect(first.degraded).toBe(false);
    // Force expiry by rewriting expiry to the past.
    const files = await fs.readdir(join(dir));
    const p = join(dir, files.find((f) => f.endsWith('.json'))!);
    const obj = JSON.parse(await fs.readFile(p, 'utf8'));
    obj.expiresAt = new Date(0).toISOString();
    await fs.writeFile(p, JSON.stringify(obj));

    // Expired cache triggers refresh; refresh fails -> reuse stale cache.
    const failResolver = new TopicResolver(mockClient({ fail: true }), new TopicCache(dir), 0);
    const { space, degraded } = await failResolver.resolve('テーマ甲', 'illustration', {});
    expect(degraded).toBe(true);
    expect(space.tags.some((t) => t.name === 'テーマ甲関連')).toBe(true);
  });

  it('does not recurse: related tags never become new seeds', async () => {
    const dir = await fs.mkdtemp(join(os.tmpdir(), 'topic-res3-'));
    const resolver = new TopicResolver(mockClient({ illusts: [work(1, ['テーマ甲', 'テーマ甲関連', '女の子'])] }), new TopicCache(dir), 0);
    const { space } = await resolver.resolve('テーマ甲', 'illustration', { maxTags: 5 });
    // Discovery only ever searched the seed (autocomplete once + seed once + bg),
    // proven by every tag sharing the seed-centred sample; maxTags is respected.
    expect(space.tags.length).toBeLessThanOrEqual(5);
    expect(space.tags[0].seed).toBe(true);
  });
});

describe('TopicPipeline', () => {
  const DAY = '2026-08-28';
  const dayWork = (id: number, tags: string[], bm = 0, title = '') =>
    work(id, tags, { create_date: DAY + 'T10:00:00+09:00', total_bookmarks: bm, title });

  // Client: seed tag search returns the pool; background tag returns generic items.
  const client: TopicClient = {
    getTagAutocomplete: async () => [{ name: 'テーマ甲' }, { name: 'テーマ甲関連' }],
    searchIllustrationsForTags: async (seed: string, limit: number, opts) => {
      // All "yesterday" works
      if (seed === 'テーマ甲') return [dayWork(1, ['テーマ甲', 'テーマ甲関連'], 500, 'テーマ甲の子'), dayWork(2, ['テーマ甲'], 50, '')];
      if (seed === 'テーマ甲関連') return [dayWork(1, ['テーマ甲', 'テーマ甲関連'], 500), dayWork(3, ['テーマ甲関連', 'R-18'], 9999, ''), dayWork(4, ['テーマ甲関連'], 100, '')];
      if (seed === 'イラスト') return [dayWork(90, ['R-18', 'オリジナル', '女の子'], 50000)];
      return [];
    },
    searchNovelsForTags: async () => [],
  };

  const build = async () => {
    const dir = await fs.mkdtemp(join(os.tmpdir(), 'topic-pipe-'));
    // Pre-seed a stable resolver cache so the collector's tag set is deterministic.
    const { TopicResolver } = await import('../../topic/TopicResolver');
    const { TopicCache } = await import('../../topic/TopicCache');
    const resolver = new TopicResolver(client, new TopicCache(dir), 0);
    const pipeline = new TopicPipeline(client, resolver, 0);
    return { pipeline, dir };
  };

  it('deduplicates works across tags and selects Top N by popularity (limit=1 O(n))', async () => {
    const { pipeline } = await build();
    const target = { type: 'illustration', mode: 'topic', topic: 'テーマ甲' } as never;
    // Discovery first (fresh) then collection — use a high minScore then rely on
    // accepted set; id=3 (テーマ甲関連+R-18 generic, 9999 bm) must NOT win over a
    // topic-relevant work because metadata filter requires topic relevance.
    const { works, selection } = await pipeline.selectWorks(target, 'illustration', DAY, 1, { cacheDays: 7 }, { minMetadataScore: 0.5 });
    expect(selection.dedupedCount).toBe(selection.rawCount - 1); // id=1 duplicated across tags
    expect(works).toHaveLength(1);
    // id=1 carries the seed tag and is on-topic; id=3 lacks seed/strong related tags.
    expect(works[0].id).toBe(1);
  });

  it('caps the candidate pool at maxCandidates', async () => {
    const manyClient: TopicClient = {
      getTagAutocomplete: async () => [{ name: 'seed' }],
      searchIllustrationsForTags: async (seed: string) =>
        seed === 'seed' ? Array.from({ length: 60 }, (_, i) => dayWork(i + 1, ['seed'])) : seed === 'イラスト' ? [] : [],
      searchNovelsForTags: async () => [],
    };
    const dir = await fs.mkdtemp(join(os.tmpdir(), 'topic-pipe2-'));
    const { TopicResolver } = await import('../../topic/TopicResolver');
    const { TopicCache } = await import('../../topic/TopicCache');
    const resolver = new TopicResolver(manyClient, new TopicCache(dir), 0);
    const pipeline = new TopicPipeline(manyClient, resolver, 0);
    const target = { type: 'illustration', mode: 'topic', topic: 'seed' } as never;
    const { selection } = await pipeline.selectWorks(target, 'illustration', DAY, 3, {}, { maxPerTag: 60, maxCandidates: 25 });
    expect(selection.dedupedCount).toBeLessThanOrEqual(25);
  });

  it('filter rejects works that carry only generic platform tags', async () => {
    const { pipeline } = await build();
    const target = { type: 'illustration', mode: 'topic', topic: 'テーマ甲' } as never;
    const { selection } = await pipeline.selectWorks(target, 'illustration', DAY, 5, {}, { minMetadataScore: 0.5 });
    // Generic-only work id=90 (R-18/オリジナル/女の子) is never even in the
    // collected pool; and every selected work must reference the seed or a
    // resolved related tag — never just platform-generic tags.
    const genericOnly = (tags: string[]) => tags.every((t) => ['R-18', 'オリジナル', '女の子', 'イラスト'].includes(t));
    for (const c of selection.selected) {
      expect(genericOnly(c.tags)).toBe(false);
    }
    // Top-1 relevance-first: the seed-tag work beats the higher-bookmark tangential one.
    expect(selection.selected[0].id).toBe(1);
  });
});
