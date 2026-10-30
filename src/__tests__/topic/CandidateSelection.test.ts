import { CandidateTagPolicy } from '../../topic/CandidateTagPolicy';
import { TopicPipeline } from '../../topic/TopicPipeline';
import { validateConfig } from '../../config/validation';
import type { CandidateSelectionConfig, StandaloneConfig, TargetConfig } from '../../config';
import type { TopicResolver } from '../../topic/TopicResolver';
import type { TopicClient, TopicContentType, WorkLike } from '../../topic/types';
import { DownloadPlanner } from '../../download/plan/DownloadPlanner';
import type { IDatabase } from '../../interfaces/IDatabase';
import type { PixivNovel } from '@redtidev/pixiv-client';

const work = (id: number, tags: string[], popularity: number): WorkLike => ({
  id, tags: tags.map(name => ({ name })), total_bookmarks: popularity,
});

async function select(works: WorkLike[], policy?: CandidateSelectionConfig, type: TopicContentType = 'illustration', seedTier: 'on' | 'off' = 'off', minMetadataScore = 0.35) {
  const searched: string[] = [];
  const search = async (tag: string) => { searched.push(tag); return works; };
  const client: TopicClient = { getTagAutocomplete: async () => [], searchIllustrationsForTags: search, searchNovelsForTags: search };
  const resolver = { resolve: async () => ({ space: { tags: [
    { name: 'main', score: 1, seed: true },
    { name: 'related', score: 0.9, seed: false },
  ] } }) } as unknown as TopicResolver;
  const pipeline = new TopicPipeline(client, resolver, 0);
  const target = { type, mode: 'topic', topic: 'main', candidateSelection: policy } as TargetConfig;
  const result = await pipeline.selectWorks(target, type, '2026-10-30', 1, { seedTier }, { minMetadataScore });
  return { ...result, searched };
}

describe('generic candidate tag policy', () => {
  const policy: CandidateSelectionConfig = { requiredTags: ['main', 'main-alias'], preferredTags: ['accent'], preferredTagBoost: 0.25 };

  it.each(['illustration', 'novel'] as const)('%s: rejects preferred-only works before ranking', async type => {
    const { works, searched, selection } = await select([
      work(1, ['related', 'accent'], 10000), work(2, ['main'], 100), work(3, ['main', 'accent'], 90),
    ], policy, type);
    expect(works.map(w => w.id)).toEqual([3]);
    expect(selection.acceptedCount).toBe(2);
    expect(searched).not.toContain('accent');
  });

  it('keeps popularity-only defaults and falls back when no preferred tag is present', async () => {
    expect((await select([work(1, ['main'], 100), work(2, ['main', 'accent'], 90)])).works[0].id).toBe(1);
    expect((await select([work(1, ['main'], 100), work(2, ['main'], 90)], policy)).works[0].id).toBe(1);
    expect((await select([work(1, ['main'], 200), work(2, ['main', 'accent'], 90)], policy)).works[0].id).toBe(1);
  });

  it('never lets preferences cross a seed tier or rescue a failed hard gate', async () => {
    expect((await select([work(1, ['main'], 1), work(2, ['related', 'accent'], 10000)], { preferredTags: ['accent'] }, 'novel', 'on')).works[0].id).toBe(1);
    expect((await select([work(1, ['main', 'accent'], 100)], { requiredTags: ['absent'], preferredTags: ['accent'] }, 'novel', 'off', 3)).works).toEqual([]);
  });

  it('normalizes exact names and aliases; translations are opt-in; bonus cannot stack', () => {
    const p = new CandidateTagPolicy({ requiredTags: ['main-alias'], preferredTags: ['accent', 'extra'] });
    const candidate = work(1, [' ＭＡＩＮ-ＡＬＩＡＳ ', 'accent', 'extra', 'accent'], 100);
    expect(p.accepts(candidate)).toBe(true);
    expect(p.score(candidate)).toBe(125);
    expect(p.accepts(work(2, ['prefix-main-alias'], 100))).toBe(false);
    const translated = { id: 3, tags: [{ name: 'other', translated_name: 'main-alias' }] };
    expect(p.accepts(translated)).toBe(false);
    expect(new CandidateTagPolicy({ requiredTags: ['main-alias'], matchTranslatedNames: true }).accepts(translated)).toBe(true);
    expect(p.accepts({})).toBe(false);
  });

  it('planner rechecks hard tags for fetched inventory details and non-topic targets', () => {
    const planner = new DownloadPlanner({ getDownloadedIds: () => new Set() } as unknown as IDatabase);
    const plan = planner.planDownloads([
      work(1, ['accent'], 10000), work(2, ['main'], 100), work(3, ['main', 'accent'], 90),
    ] as PixivNovel[], { type: 'novel', mode: 'search', limit: 1, candidateSelection: policy } as TargetConfig, 'novel');
    expect(plan.queue.map(w => w.id)).toEqual([3, 2]);
    expect(plan.filteredOut).toBe(1);
    const stale = planner.planDownloads([work(1, ['accent'], 10000)] as never[], { type: 'novel', mode: 'topic', candidateSelection: policy } as TargetConfig, 'novel');
    expect(stale.queue).toEqual([]);
  });

  const base: StandaloneConfig = {
    pixiv: { clientId: 'client', clientSecret: 'secret', deviceToken: 'device', refreshToken: 'valid-refresh-token', userAgent: 'test' },
    storage: { databasePath: './test.db', downloadDirectory: './downloads' }, targets: [], delivery: { targets: {} },
  };
  const validate = (candidateSelection: unknown) => () => validateConfig({ ...base, targets: [{ type: 'illustration', mode: 'topic', topic: 'main', candidateSelection } as TargetConfig] }, 'test');

  it('validates the public configuration including malformed and non-finite values', () => {
    expect(validate(policy)).not.toThrow();
    expect(validate({})).not.toThrow();
    for (const bad of [null, [], 'tags', { requiredTags: 'main' }, { preferredTags: [''] }, { preferredTags: [42] }, { preferredTagBoost: -1 }, { preferredTagBoost: 1.1 }, { preferredTagBoost: NaN }, { preferredTagBoost: Infinity }, { matchTranslatedNames: 'yes' }]) {
      expect(validate(bad)).toThrow(/candidateSelection/);
    }
  });
});
