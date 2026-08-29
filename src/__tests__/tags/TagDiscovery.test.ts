/**
 * Tests for tag discovery: co-occurrence scoring, seed filtering, caching,
 * and the explicit apply workflow (whitelist enforcement + atomic publish).
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';

import { TagDiscoveryService } from '../../tags/TagDiscoveryService';
import { TagDiscoveryStore } from '../../tags/TagDiscoveryStore';
import { TagPlanApplier } from '../../tags/TagPlanApplier';
import type { TagDiscoveryClient, TagDiscoveryManifest } from '../../tags/types';
import type { PixivTag } from '../../pixiv/types';

const tag = (name: string, translated_name?: string): PixivTag =>
  translated_name ? { name, translated_name } : { name };

const mockClient = (
  autocomplete: PixivTag[],
  illustrations: Array<{ tags?: PixivTag[] }>,
  novels: Array<{ tags?: PixivTag[] }>
): TagDiscoveryClient => ({
  getTagAutocomplete: jest.fn().mockResolvedValue(autocomplete),
  searchIllustrationsForTags: jest.fn().mockResolvedValue(illustrations),
  searchNovelsForTags: jest.fn().mockResolvedValue(novels),
});

describe('TagDiscoveryService', () => {
  it('merges autocomplete and co-occurrence, excluding the seed itself', async () => {
    const client = mockClient(
      [tag('西瓜肚'), tag('ぽっこりお腹'), tag('妊婦')],
      [
        { tags: [tag('西瓜肚'), tag('ぽっこりお腹'), tag('腹ボテ')] },
        { tags: [tag('西瓜肚'), tag('ぽっこりお腹')] },
      ],
      [
        { tags: [tag('西瓜肚'), tag('妊娠')] },
      ]
    );

    const manifest = await new TagDiscoveryService(client).discover('西瓜肚', {
      contentTypes: ['illustration', 'novel'],
      sampleSize: 60,
      limit: 20,
    });

    const names = manifest.candidates.map((c) => c.name);
    expect(names).not.toContain('西瓜肚');
    expect(names).toContain('ぽっこりお腹');
    expect(names).toContain('腹ボテ');
    expect(names).toContain('妊娠');
    expect(manifest.sampledWorks).toEqual({ illustration: 2, novel: 1 });
  });

  it('ranks tags appearing in more sampled works higher', async () => {
    const client = mockClient(
      [],
      [
        { tags: [tag('seed'), tag('common'), tag('rare')] },
        { tags: [tag('seed'), tag('common')] },
        { tags: [tag('seed'), tag('common')] },
        { tags: [tag('seed'), tag('rare')] },
      ],
      []
    );

    const manifest = await new TagDiscoveryService(client).discover('seed', {
      contentTypes: ['illustration'],
    });

    const byName = new Map(manifest.candidates.map((c) => [c.name, c]));
    expect(byName.get('common')!.occurrences.illustration).toBe(3);
    expect(byName.get('rare')!.occurrences.illustration).toBe(2);
    expect(manifest.candidates[0].name).toBe('common');
  });

  it('marks sources and respects the result limit', async () => {
    const client = mockClient(
      [tag('only-auto')],
      [{ tags: [tag('seed'), tag('only-cooc')] }],
      []
    );

    const manifest = await new TagDiscoveryService(client).discover('seed', {
      limit: 1,
      contentTypes: ['illustration'],
    });

    expect(manifest.candidates).toHaveLength(1);
  });

  it('rejects an empty seed and out-of-range options', async () => {
    const service = new TagDiscoveryService(mockClient([], [], []));
    await expect(service.discover('   ')).rejects.toThrow(/empty/);
    await expect(service.discover('seed', { sampleSize: 0 })).rejects.toThrow(/sampleSize/);
    await expect(service.discover('seed', { limit: 999 })).rejects.toThrow(/limit/);
  });
});

describe('TagDiscoveryStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(os.tmpdir(), 'tag-discovery-'));
  });

  const buildManifest = (expiresAt: string): TagDiscoveryManifest => ({
    version: 1,
    seed: 'seed',
    createdAt: new Date(0).toISOString(),
    expiresAt,
    contentTypes: ['illustration'],
    sampleSize: 60,
    sampledWorks: { illustration: 1, novel: 0 },
    candidates: [{ name: 'related', sources: ['autocomplete'], types: [], occurrences: { illustration: 0, novel: 0 }, score: 0.9 }],
  });

  it('saves and reloads a fresh manifest, then treats an expired one as missing', async () => {
    const store = new TagDiscoveryStore(dir, () => 1000);
    const key = { seed: 'seed', contentTypes: ['illustration' as const], sampleSize: 60, limit: 20 };

    const fresh = buildManifest(new Date(2000).toISOString());
    const path = await store.save(key, fresh);
    expect(await fs.stat(path)).toBeTruthy();

    const loaded = await store.loadFresh(key);
    expect(loaded?.manifest.seed).toBe('seed');

    const expiredStore = new TagDiscoveryStore(dir, () => 5000);
    expect(await expiredStore.loadFresh(key)).toBeUndefined();
  });

  it('is case/whitespace-insensitive for the cache key', async () => {
    const store = new TagDiscoveryStore(dir);
    const manifest = buildManifest(new Date(Date.now() + 60_000).toISOString());
    await store.save({ seed: 'Seed', contentTypes: ['illustration'], sampleSize: 60, limit: 20 }, manifest);
    const hit = await store.loadFresh({ seed: ' seed ', contentTypes: ['illustration'], sampleSize: 60, limit: 20 });
    expect(hit?.manifest.seed).toBe('seed');
  });
});

describe('TagPlanApplier', () => {
  let dir: string;
  let configPath: string;

  const validConfig = () => ({
    pixiv: {
      clientId: 'cid',
      clientSecret: 'secret',
      deviceToken: 'device',
      refreshToken: 'refresh-token-value',
      userAgent: 'ua',
    },
    storage: { databasePath: join(dir, 'data.db') },
    targets: [
      { id: 't1', type: 'illustration' as const, mode: 'search' as const, tag: '西瓜肚', limit: 50 },
    ],
  });

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(os.tmpdir(), 'tag-apply-'));
    configPath = join(dir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(validConfig(), null, 2));
  });

  const manifest: TagDiscoveryManifest = {
    version: 1,
    seed: '西瓜肚',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    contentTypes: ['illustration'],
    sampleSize: 60,
    sampledWorks: { illustration: 1, novel: 0 },
    candidates: [
      { name: 'ぽっこりお腹', sources: ['cooccurrence'], types: ['illustration'], occurrences: { illustration: 1, novel: 0 }, score: 0.8 },
      { name: '腹ボテ', sources: ['cooccurrence'], types: ['illustration'], occurrences: { illustration: 1, novel: 0 }, score: 0.7 },
    ],
  };

  it('appends only whitelisted tags, backs up and atomically rewrites the config', async () => {
    const result = await new TagPlanApplier().apply(configPath, manifest, {
      targetId: 't1',
      selectedTags: ['ぽっこりお腹'],
    });

    expect(result.selectedTags).toEqual(['ぽっこりお腹']);
    const onDisk = JSON.parse(await fs.readFile(configPath, 'utf8'));
    const target = onDisk.targets[0];
    expect(target.tag.split(/\s+/).sort()).toEqual(['ぽっこりお腹', '西瓜肚']);
    expect(target.tagRelation).toBe('or');
    expect(await fs.stat(result.backupPath)).toBeTruthy();
  });

  it('rejects tags not present in the manifest', async () => {
    await expect(
      new TagPlanApplier().apply(configPath, manifest, {
        targetId: 't1',
        selectedTags: ['勝手に追加'],
      })
    ).rejects.toThrow(/not in the discovery manifest/);

    // Config must be untouched on failure.
    const onDisk = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(onDisk.targets[0].tag).toBe('西瓜肚');
  });

  it('replaces the seed in replace mode and rejects unknown target ids', async () => {
    const replaced = await new TagPlanApplier().apply(configPath, manifest, {
      targetId: 't1',
      selectedTags: ['腹ボテ'],
      mode: 'replace',
    });
    expect(replaced.tag.split(/\s+/)).toEqual(['腹ボテ']);

    await expect(
      new TagPlanApplier().apply(configPath, manifest, {
        targetId: 'missing',
        selectedTags: ['腹ボテ'],
      })
    ).rejects.toThrow(/Target id not found/);
  });
});
