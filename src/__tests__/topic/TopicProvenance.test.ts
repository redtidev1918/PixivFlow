/**
 * Unit tests for provenance-weighted tag expansion (§tag-provenance).
 *
 * Before this change every resolved tag was interchangeable: the seed and a
 * weakly-related tag became the same kind of search word. These tests pin the
 * new contract — every resolved tag carries `source` (where it came from) and
 * `weight` (the semantic weight ranking reads), `topicDiscovery.tagRelations`
 * governs the walked list (deny beats allow; the seed survives allow and
 * allowSources), `topicDiscovery.seedTier: 'on'` makes the seed tier a hard tier,
 * and `topicDiscovery.matchTranslatedNames` lets a translated spelling count as
 * a tag hit. Every default must reproduce the pre-change behaviour.
 *
 * No network: the space comes from a stub resolver and the Pixiv client is a fake.
 */

import { StandaloneConfig } from '../../config';
import { validateConfig } from '../../config/validation';
import { TopicPipeline, recallChannels, selectWalkedTags } from '../../topic/TopicPipeline';
import { TopicTagScorer } from '../../topic/TopicTagScorer';
import type { ResolvedTag, TopicClient, TopicContentType, TopicSpace, WorkLike } from '../../topic/types';
import type { TopicResolver } from '../../topic/TopicResolver';

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

const spaceTag = (
  name: string,
  score: number,
  provenance: Pick<ResolvedTag, 'source' | 'weight'> & Partial<ResolvedTag> = {}
): ResolvedTag => ({
  name,
  score,
  weight: provenance.weight ?? score,
  source: provenance.source,
  occurrences: provenance.occurrences ?? 4,
  coverage: provenance.coverage ?? 1,
  specificity: provenance.specificity ?? 1,
  suggested: provenance.suggested ?? false,
  seed: provenance.seed ?? false,
  ...(provenance.translatedName ? { translatedName: provenance.translatedName } : {}),
});

/** A resolver stub returning a hand-written space (no network, no sampling). */
const stubResolver = (tags: ResolvedTag[], topic = '西瓜肚'): TopicResolver => ({
  resolve: async () => ({
    degraded: false,
    space: {
      version: 1 as const,
      topic,
      contentType: 'illustration' as TopicContentType,
      createdAt: new Date(0).toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      sampleSize: 4,
      sampledWorks: 4,
      tags,
    } as TopicSpace,
  }),
}) as unknown as TopicResolver;

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

interface HarnessOptions {
  tags: ResolvedTag[];
  works: Record<string, WorkLike[]>;
  topic?: string;
}

const harness = ({ tags, works, topic = '西瓜肚' }: HarnessOptions) => {
  const searched: string[] = [];
  const client = recordingClient(works, searched);
  const pipeline = new TopicPipeline(client, stubResolver(tags, topic), 0);
  const target = { type: 'illustration', mode: 'topic', topic } as never;
  return { pipeline, searched, target };
};

/** 西瓜肚 (seed) + 丸吞 (related) — the space used by most pipeline tests. */
const twoTagSpace = (): ResolvedTag[] => [
  spaceTag('西瓜肚', 1, { source: 'seed', seed: true }),
  spaceTag('丸吞', 0.72, { source: 'cooccurrence' }),
];

describe('TopicTagScorer provenance (§tag-provenance)', () => {
  const work = (id: number, tags: string[]): WorkLike => dayWork(id, tags, 0);

  it('records co-occurrence provenance, and the combined source when also suggested', () => {
    const scorer = new TopicTagScorer();
    const scored = scorer.score({
      seed: 'ボテ腹',
      topicWorks: [work(1, ['ボテ腹', '妊娠']), work(2, ['ボテ腹', '妊娠']), work(3, ['ボテ腹'])],
      backgroundWorks: [],
      suggestedNames: new Set(['ボテ腹', '妊娠']),
    });
    const preg = scored.find((s) => s.name === '妊娠')!;
    expect(preg.source).toBe('cooccurrence+autocomplete');
    // `weight` is the documented semantic weight and must be the same number.
    expect(preg.weight).toBe(preg.score);
  });

  it('records plain co-occurrence provenance when autocomplete does not relate the tag', () => {
    const scorer = new TopicTagScorer();
    const scored = scorer.score({
      seed: 'ボテ腹',
      topicWorks: [work(1, ['ボテ腹', '臨月']), work(2, ['ボテ腹', '臨月'])],
      backgroundWorks: [],
      suggestedNames: new Set(['ボテ腹']),
    });
    const rinki = scored.find((s) => s.name === '臨月')!;
    expect(rinki.source).toBe('cooccurrence');
    expect(rinki.weight).toBe(rinki.score);
  });

  it('records autocomplete-only provenance with the fixed autocomplete score', () => {
    const scorer = new TopicTagScorer();
    const scored = scorer.score({
      seed: 'ボテ腹',
      topicWorks: [work(1, ['ボテ腹'])],
      backgroundWorks: [],
      suggestedNames: new Set(['ボテ腹']),
      suggestedTags: [{ name: '臨月' }],
    });
    const rinki = scored.find((s) => s.name === '臨月')!;
    expect(rinki.source).toBe('autocomplete');
    expect(rinki.occurrences).toBe(0);
    expect(rinki.weight).toBe(rinki.score);
  });
});

describe('seed provenance in the resolved space (§tag-provenance)', () => {
  it('gives the seed tag source=seed and weight equal to its score', async () => {
    // Drive the REAL resolver (only its client is fake) so the synthesized seed
    // row is asserted where it is actually built, not on a test fixture.
    const { TopicResolver } = await import('../../topic/TopicResolver');
    const { TopicCache } = await import('../../topic/TopicCache');
    const { promises: fsp } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = await fsp.mkdtemp(join(tmpdir(), 'topic-provenance-'));
    const client: TopicClient = {
      getTagAutocomplete: async () => [{ name: 'ボテ腹', translated_name: 'belly' }, { name: '妊娠' }],
      searchIllustrationsForTags: async (tag: string) => {
        if (tag === 'イラスト') return [];
        return [dayWork(1, ['ボテ腹', '妊娠'], 10), dayWork(2, ['ボテ腹', '妊娠'], 5)];
      },
      searchNovelsForTags: async () => [],
    };
    const resolver = new TopicResolver(client, new TopicCache(dir), 0);
    const { space } = await resolver.resolve('ボテ腹', 'illustration', { refresh: true });

    const seed = space.tags[0]!;
    expect(seed.name).toBe('ボテ腹');
    expect(seed.source).toBe('seed');
    expect(seed.seed).toBe(true);
    expect(seed.weight).toBe(seed.score);
    expect(seed.weight).toBe(1);
    expect(seed.translatedName).toBe('belly');

    const preg = space.tags.find((t) => t.name === '妊娠')!;
    expect(preg.source).toBe('cooccurrence+autocomplete');
    expect(preg.weight).toBe(preg.score);
    // A seeded space never mixes provenance up: exactly one row is the seed.
    expect(space.tags.filter((t) => t.source === 'seed')).toHaveLength(1);
  });
});

describe('tagRelations governs the walked list (§tag-provenance)', () => {
  it('default (no tagRelations) walks the whole space in resolver order', () => {
    const walked = selectWalkedTags(twoTagSpace(), '西瓜肚');
    expect(walked.map((t) => t.name)).toEqual(['西瓜肚', '丸吞']);
  });

  it('deny drops a tag from the walked list and it is never searched', async () => {
    const { pipeline, searched, target } = harness({
      tags: twoTagSpace(),
      works: { 西瓜肚: [dayWork(1, ['西瓜肚'], 10)], 丸吞: [dayWork(7, ['丸吞'], 9999)] },
    });

    const { selection } = await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { tagRelations: { deny: ['丸吞'] } }, {}
    );

    expect(searched).toEqual(['西瓜肚']);
    expect(selection.searchedTags).toEqual(['西瓜肚']);
    expect(selection.searchedTags).not.toContain('丸吞');
  });

  it('allow walks only the allowed tags plus the seed', async () => {
    const { pipeline, searched, target } = harness({
      tags: [
        spaceTag('西瓜肚', 1, { source: 'seed', seed: true }),
        spaceTag('丸吞', 0.72, { source: 'cooccurrence' }),
        spaceTag('膨腹', 0.5, { source: 'cooccurrence' }),
      ],
      works: {
        西瓜肚: [dayWork(1, ['西瓜肚'], 10)],
        丸吞: [dayWork(7, ['丸吞'], 9999)],
        膨腹: [dayWork(9, ['膨腹'], 5000)],
      },
    });

    await pipeline.selectWorks(target, 'illustration', DAY, 1, { tagRelations: { allow: ['丸吞'] } }, {});

    expect(searched).toEqual(['西瓜肚', '丸吞']);
  });

  it('deny beats allow for the same tag', async () => {
    const { pipeline, searched, target } = harness({
      tags: twoTagSpace(),
      works: { 西瓜肚: [dayWork(1, ['西瓜肚'], 10)], 丸吞: [dayWork(7, ['丸吞'], 9999)] },
    });

    await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { tagRelations: { allow: ['丸吞'], deny: ['丸吞'] } }, {}
    );

    expect(searched).toEqual(['西瓜肚']);
  });

  it("allowSources: ['seed'] walks only the seed tag", async () => {
    const { pipeline, searched, target } = harness({
      tags: twoTagSpace(),
      works: { 西瓜肚: [dayWork(1, ['西瓜肚'], 10)], 丸吞: [dayWork(7, ['丸吞'], 9999)] },
    });

    await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { tagRelations: { allowSources: ['seed'] } }, {}
    );

    expect(searched).toEqual(['西瓜肚']);
  });

  it('deny beats allowSources without emptying the seed channel', async () => {
    const { pipeline, searched, target } = harness({
      tags: [
        spaceTag('西瓜肚', 1, { source: 'seed', seed: true }),
        spaceTag('丸吞', 0.72, { source: 'cooccurrence' }),
        spaceTag('臨月', 0.27, { source: 'autocomplete' }),
      ],
      works: {
        西瓜肚: [dayWork(1, ['西瓜肚'], 10)],
        丸吞: [dayWork(7, ['丸吞'], 9999)],
        臨月: [dayWork(9, ['臨月'], 5000)],
      },
    });

    await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { tagRelations: { deny: ['丸吞'] } }, {}
    );

    // Only the denied tag disappears; the seed and every other source survive.
    expect(searched).toEqual(['西瓜肚', '臨月']);
  });

  it("allowSources: ['autocomplete'] keeps autocomplete-only provenance and drops co-occurrence", () => {
    const walked = selectWalkedTags(
      [
        spaceTag('西瓜肚', 1, { source: 'seed', seed: true }),
        spaceTag('丸吞', 0.72, { source: 'cooccurrence' }),
        spaceTag('臨月', 0.27, { source: 'autocomplete' }),
        spaceTag('妊娠', 0.6, { source: 'cooccurrence+autocomplete' }),
      ],
      '西瓜肚',
      { allowSources: ['autocomplete'] }
    );
    expect(walked.map((t) => t.name)).toEqual(['西瓜肚', '臨月', '妊娠']);
  });

  it('a legacy space without provenance is treated as co-occurrence', () => {
    const legacy: ResolvedTag[] = [
      { name: '西瓜肚', score: 1, occurrences: 4, coverage: 1, specificity: 1, suggested: false, seed: true },
      { name: '丸吞', score: 0.72, occurrences: 2, coverage: 0.5, specificity: 1, suggested: false, seed: false },
    ];
    expect(selectWalkedTags(legacy, '西瓜肚', { allowSources: ['cooccurrence'] }).map((t) => t.name))
      .toEqual(['西瓜肚', '丸吞']);
    expect(selectWalkedTags(legacy, '西瓜肚', { allowSources: ['seed'] }).map((t) => t.name))
      .toEqual(['西瓜肚']);
  });

  it('denying the seed falls back to the seed tag alone instead of an empty space', async () => {
    const { pipeline, searched, target } = harness({
      tags: twoTagSpace(),
      works: { 西瓜肚: [dayWork(1, ['西瓜肚'], 10)], 丸吞: [dayWork(7, ['丸吞'], 9999)] },
    });

    const { works, selection } = await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { tagRelations: { deny: ['西瓜肚'] } }, {}
    );

    // Exactly like seedOnly(): the seed tag is the only channel and the operator
    // still gets their own topic rather than nothing.
    expect(searched).toEqual(['西瓜肚']);
    expect(selection.searchedTags).toEqual(['西瓜肚']);
    expect(works.map((w) => w.id)).toEqual([1]);
    expect(selection.resolvedTagCount).toBe(1);
  });
});

describe('seedTier makes the seed a hard tier (§tag-provenance)', () => {
  // A: carries the seed tag, almost no popularity. B: no seed tag, clears the
  // metadata gate through three related tags, far more popular.
  const works = {
    西瓜肚: [dayWork(1, ['西瓜肚'], 10)],
    丸吞: [dayWork(7, ['丸吞', '膨腹'], 9999)],
    膨腹: [dayWork(7, ['丸吞', '膨腹'], 9999)],
  };
  const tags = [
    spaceTag('西瓜肚', 1, { source: 'seed', seed: true }),
    spaceTag('丸吞', 0.72, { source: 'cooccurrence' }),
    spaceTag('膨腹', 0.72, { source: 'cooccurrence' }),
  ];

  it("default seedTier 'off' keeps the pinned popularity-only result", async () => {
    const { pipeline, target } = harness({ tags, works });
    const { works: selected, selection } = await pipeline.selectWorks(target, 'illustration', DAY, 1, {}, {});

    expect(selected.map((w) => w.id)).toEqual([7]);
    // The related-only work must have cleared the metadata gate: the pin is
    // about RANKING, not about the gate.
    expect(selection.selected[0]!.metadataScore).toBeGreaterThanOrEqual(0.35);
  });

  it("seedTier 'on' selects the seed-tag work even though the related-only work is more popular", async () => {
    const { pipeline, searched, target } = harness({ tags, works });
    const { works: selected, selection } = await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { seedTier: 'on' }, {}
    );

    // Same space, same search, same gate — only the tier decides.
    expect(searched).toEqual(['西瓜肚', '丸吞', '膨腹']);
    expect(selected.map((w) => w.id)).toEqual([1]);
    expect(selection.selected[0]!.tags).toContain('西瓜肚');
    expect(selection.selected[0]!.metadataScore).toBeGreaterThan(0.5);
  });

  it("seedTier 'on' still lets popularity decide inside the seed tier", async () => {
    const { pipeline, target } = harness({
      tags,
      works: {
        西瓜肚: [dayWork(1, ['西瓜肚'], 10), dayWork(2, ['西瓜肚'], 900)],
        丸吞: [dayWork(7, ['丸吞', '膨腹'], 9999)],
        膨腹: [dayWork(7, ['丸吞', '膨腹'], 9999)],
      },
    });
    const { works: selected } = await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { seedTier: 'on' }, {}
    );
    expect(selected.map((w) => w.id)).toEqual([2]);
  });

  it("relatedTags 'never' keeps its own seed-first behaviour independent of seedTier", () => {
    const walked = twoTagSpace();
    const never = recallChannels(walked, '西瓜肚', 'never').map((t) => t.name);
    const always = recallChannels(walked, '西瓜肚', 'always').map((t) => t.name);
    expect(never).toEqual(['西瓜肚']);
    expect(always).toEqual(['西瓜肚', '丸吞']);
  });
});

describe('matchTranslatedNames (§tag-provenance)', () => {
  const relatedWithTranslation: ResolvedTag[] = [
    spaceTag('西瓜肚', 1, { source: 'seed', seed: true }),
    spaceTag('丸呑み', 0.72, { source: 'cooccurrence', translatedName: 'vore' }),
  ];
  const works = {
    西瓜肚: [dayWork(1, ['西瓜肚'], 10)],
    丸呑み: [dayWork(7, ['vore'], 9999)],
  };

  it('default (false) does not count a translated-name hit', async () => {
    const { pipeline, target } = harness({ tags: relatedWithTranslation, works });
    const { works: selected } = await pipeline.selectWorks(target, 'illustration', DAY, 1, {}, {});
    // The related work carries only the translated spelling, so it is filtered
    // out by the metadata gate and the seed work is the only candidate.
    expect(selected.map((w) => w.id)).toEqual([1]);
  });

  it('true makes a translated-name hit count and recall the work', async () => {
    const { pipeline, target } = harness({ tags: relatedWithTranslation, works });
    const { works: selected, selection } = await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { matchTranslatedNames: true }, {}
    );
    expect(selected.map((w) => w.id)).toEqual([7]);
    expect(selection.selected[0]!.metadataScore).toBeGreaterThanOrEqual(0.35);
  });

  it('the translated spelling does not leak into the work tags (no phantom tag)', async () => {
    const { pipeline, target } = harness({ tags: relatedWithTranslation, works });
    const { selection } = await pipeline.selectWorks(
      target, 'illustration', DAY, 1, { matchTranslatedNames: true }, {}
    );
    expect(selection.selected[0]!.tags).toEqual(['vore']);
    expect(selection.selected[0]!.tags).not.toContain('丸呑み');
  });

  it('a resolved tag counts at most once when a work carries both spellings', async () => {
    // Work 7 carries the tag AND its translated spelling; work 8 only the
    // spelling. `metadataScore` must not reward the repetition.
    const bothSpellings = {
      西瓜肚: [dayWork(1, ['西瓜肚'], 10)],
      丸呑み: [
        { ...dayWork(7, ['丸呑み', 'vore'], 9999), tags: [{ name: '丸呑み', translated_name: 'vore' }] },
        dayWork(8, ['vore'], 9999),
      ],
    };
    const { pipeline, target } = harness({ tags: relatedWithTranslation, works: bothSpellings });
    // minMetadataScore 0 keeps every collected work in the audit pool, so the
    // scores are comparable even though neither related work clears the real gate.
    const { selection } = await pipeline.selectWorks(
      target, 'illustration', DAY, 2, { matchTranslatedNames: true }, { minMetadataScore: 0 }
    );
    const byId = new Map(selection.candidates.map((c) => [c.id, c]));
    expect(byId.get(7)!.metadataScore).toBe(byId.get(8)!.metadataScore);
    expect(byId.get(7)!.metadataScore).toBeGreaterThan(0);
  });
});

describe('tagRelations validation (src/config/validation.ts)', () => {
  const baseConfig: StandaloneConfig = {
    pixiv: {
      clientId: 'client',
      clientSecret: 'secret',
      deviceToken: 'device',
      refreshToken: 'valid-refresh-token',
      userAgent: 'PixivFlow test',
    },
    storage: {
      databasePath: './data/test.db',
      downloadDirectory: './downloads',
    },
    targets: [],
    delivery: { targets: {} },
  };

  const withTopicDiscovery = (topicDiscovery: Record<string, unknown>) => () => validateConfig({
    ...baseConfig,
    targets: [{
      name: 'topic-target',
      type: 'illustration',
      mode: 'topic',
      topic: 'ボテ腹',
      topicDiscovery,
    } as never],
  }, 'test');

  it('accepts the documented defaults and every valid key', () => {
    expect(withTopicDiscovery({
      seedTier: 'on',
      matchTranslatedNames: true,
      tagRelations: { allowSources: ['seed', 'cooccurrence', 'autocomplete'], allow: ['妊娠'], deny: ['R-18'] },
    })).not.toThrow();
    expect(withTopicDiscovery({ seedTier: 'off', matchTranslatedNames: false, tagRelations: {} })).not.toThrow();
  });

  it('rejects an unknown seedTier', () => {
    expect(withTopicDiscovery({ seedTier: 'hard' })).toThrow(/topicDiscovery\.seedTier/);
  });

  it('rejects an unknown tag source with a message naming the known sources', () => {
    expect(withTopicDiscovery({ tagRelations: { allowSources: ['seed', 'telepathy'] } }))
      .toThrow(/topicDiscovery\.tagRelations\.allowSources[\s\S]*telepathy[\s\S]*known sources/i);
  });

  it('rejects a non-array allowSources / allow / deny', () => {
    expect(withTopicDiscovery({ tagRelations: { allowSources: 'seed' } }))
      .toThrow(/topicDiscovery\.tagRelations\.allowSources/);
    expect(withTopicDiscovery({ tagRelations: { allow: '妊娠' } }))
      .toThrow(/topicDiscovery\.tagRelations\.allow/);
    expect(withTopicDiscovery({ tagRelations: { deny: [42] } }))
      .toThrow(/topicDiscovery\.tagRelations\.deny/);
  });

  it('rejects a non-boolean matchTranslatedNames', () => {
    expect(withTopicDiscovery({ matchTranslatedNames: 'yes' }))
      .toThrow(/topicDiscovery\.matchTranslatedNames/);
  });

  it('rejects tagRelations that is not an object', () => {
    expect(withTopicDiscovery({ tagRelations: ['seed'] }))
      .toThrow(/topicDiscovery\.tagRelations/);
  });
});
