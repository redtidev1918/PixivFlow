/**
 * Unit tests for the related-tag recall modes (§topic-recall).
 *
 * The resolved tag space is a hierarchy, not a bag of interchangeable tags: the
 * seed tag is what the operator asked for, and every other tag is a hint. These
 * tests pin the three modes (`always` / `when_seed_insufficient` / `never`), the
 * searched-tag ledger and the seed tier that the two seed-first modes add in
 * front of the historical popularity-only ranking.
 *
 * No network: the topic space comes from a stub resolver and the Pixiv client is
 * a recording fake, so every assertion is about which tags were searched.
 */

import { TopicPipeline } from '../../topic/TopicPipeline';
import type { TopicResolver } from '../../topic/TopicResolver';
import type { TopicClient, WorkLike } from '../../topic/types';

const DAY = '2026-08-28';

const dayWork = (id: number, tags: string[], bookmarks: number): WorkLike => ({
  id,
  title: '',
  caption: '',
  create_date: DAY + 'T10:00:00+09:00',
  total_bookmarks: bookmarks,
  total_view: 0,
  tags: tags.map((name) => ({ name })),
});

/** Resolver stub: pipeline tests only need a deterministic tag space. */
const stubResolver = (tags: Array<[string, number]>): TopicResolver => ({
  resolve: async () => ({
    degraded: false,
    space: {
      version: 1 as const,
      topic: '主题甲',
      contentType: 'illustration' as const,
      createdAt: new Date(0).toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      sampleSize: 0,
      sampledWorks: 0,
      tags: tags.map(([name, score], index) => ({
        name,
        score,
        occurrences: 1,
        coverage: 1,
        specificity: 1,
        suggested: false,
        seed: index === 0,
      })),
    },
  }),
}) as unknown as TopicResolver;

/** Recording client: reports the works of a tag and keeps the search ledger. */
const recordingClient = (works: Record<string, WorkLike[]>, searched: string[]): TopicClient => ({
  getTagAutocomplete: async () => [],
  searchIllustrationsForTags: async (tag: string) => {
    searched.push(tag);
    return works[tag] ?? [];
  },
  searchNovelsForTags: async (tag: string) => {
    searched.push(tag);
    return works[tag] ?? [];
  },
});

const target = { type: 'illustration', mode: 'topic', topic: '主题甲' } as never;

/**
 * A space with one topic tag (主题甲) and one related high-weight tag (主题乙) —
 * the operator's actual complaint: a 主题乙-only work must not be recalled as the
 * result of a 主题甲 target unless the seed tag cannot fill it.
 */
const build = (works: Record<string, WorkLike[]>) => {
  const searched: string[] = [];
  const client = recordingClient(works, searched);
  const pipeline = new TopicPipeline(client, stubResolver([['主题甲', 1], ['主题乙', 0.72]]), 0);
  return { pipeline, searched };
};

const seedWork = dayWork(1, ['主题甲', 'テーマ甲関連'], 10);
const swallowWork = dayWork(7, ['主题乙', '主题甲扩展'], 9999);

describe('TopicPipeline recall modes (§topic-recall)', () => {
  it('default (always) searches the whole space and keeps popularity-only ranking', async () => {
    const { pipeline, searched } = build({ 主题甲: [seedWork], 主题乙: [swallowWork] });

    const { works, selection } = await pipeline.selectWorks(target, 'illustration', DAY, 1, {}, {});

    expect(searched).toEqual(['主题甲', '主题乙']);
    expect(selection.searchedTags).toEqual(['主题甲', '主题乙']);
    // Relevance is only a gate: the far more popular related-only work wins Top-1.
    expect(works.map((w) => w.id)).toEqual([7]);
  });

  it('never searches the topic tag alone', async () => {
    const { pipeline, searched } = build({ 主题甲: [seedWork], 主题乙: [swallowWork] });

    const { works, selection } = await pipeline.selectWorks(target, 'illustration', DAY, 1, { relatedTags: 'never' }, {});

    expect(searched).toEqual(['主题甲']);
    expect(selection.searchedTags).toEqual(['主题甲']);
    expect(works.map((w) => w.id)).toEqual([1]);
  });

  it('never does not expand when the topic tag has nothing that day', async () => {
    const { pipeline, searched } = build({ 主题乙: [swallowWork] });

    const { works } = await pipeline.selectWorks(target, 'illustration', DAY, 1, { relatedTags: 'never' }, {});

    expect(searched).toEqual(['主题甲']);
    expect(works).toEqual([]);
  });

  it('when_seed_insufficient keeps the topic tag when it can fill the target', async () => {
    const { pipeline, searched } = build({ 主题甲: [seedWork], 主题乙: [swallowWork] });

    const { works, selection } = await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { relatedTags: 'when_seed_insufficient' }, {}
    );

    expect(searched).toEqual(['主题甲']);
    expect(selection.searchedTags).toEqual(['主题甲']);
    expect(works.map((w) => w.id)).toEqual([1]);
  });

  it('when_seed_insufficient expands only when the topic tag cannot fill the target', async () => {
    const { pipeline, searched } = build({ 主题乙: [swallowWork] });

    const { works, selection } = await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { relatedTags: 'when_seed_insufficient' }, {}
    );

    expect(searched).toEqual(['主题甲', '主题乙']);
    expect(selection.searchedTags).toEqual(['主题甲', '主题乙']);
    expect(works.map((w) => w.id)).toEqual([7]);
  });

  it('when_seed_insufficient ranks topic-tag works ahead of related-only works', async () => {
    const { pipeline } = build({ 主题甲: [seedWork], 主题乙: [swallowWork] });

    // limit=2: the seed tag fills only 1 slot, so the related channel runs and
    // both works are selected — the topic-tag work still comes first even though
    // the related-only work is 1000x more popular.
    const { works } = await pipeline.selectWorks(
      target, 'illustration', DAY, 2, { relatedTags: 'when_seed_insufficient' }, {}
    );

    expect(works.map((w) => w.id)).toEqual([1, 7]);
  });

  it('treats an unknown mode as the backward-compatible default', async () => {
    const { pipeline, searched } = build({ 主题甲: [seedWork], 主题乙: [swallowWork] });

    const { works } = await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { relatedTags: 'sometimes' as never }, {}
    );

    expect(searched).toEqual(['主题甲', '主题乙']);
    expect(works.map((w) => w.id)).toEqual([7]);
  });

  it('falls back to walking the whole space when the space has no seed tag', async () => {
    const searched: string[] = [];
    const client = recordingClient({ テーマ甲関連: [seedWork] }, searched);
    const pipeline = new TopicPipeline(client, stubResolver([['テーマ甲関連', 1], ['主题甲扩展', 0.5]]), 0);

    const { works } = await pipeline.selectWorks(target, 'illustration', DAY, 1, { relatedTags: 'never' }, {});

    expect(searched).toEqual(['テーマ甲関連', '主题甲扩展']);
    expect(works.map((w) => w.id)).toEqual([1]);
  });
});
