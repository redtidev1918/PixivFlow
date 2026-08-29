import type { PixivTag } from '../pixiv/types';

export type TagDiscoveryContentType = 'illustration' | 'novel';

export interface TagDiscoveryCandidate {
  name: string;
  translatedName?: string;
  sources: Array<'autocomplete' | 'cooccurrence'>;
  types: TagDiscoveryContentType[];
  occurrences: {
    illustration: number;
    novel: number;
  };
  score: number;
}

export interface TagDiscoveryManifest {
  version: 1;
  seed: string;
  createdAt: string;
  expiresAt: string;
  contentTypes: TagDiscoveryContentType[];
  sampleSize: number;
  sampledWorks: {
    illustration: number;
    novel: number;
  };
  candidates: TagDiscoveryCandidate[];
}

export interface TagDiscoveryClient {
  getTagAutocomplete(seed: string): Promise<PixivTag[]>;
  searchIllustrationsForTags(seed: string, limit: number): Promise<Array<{ tags?: PixivTag[] }>>;
  searchNovelsForTags(seed: string, limit: number): Promise<Array<{ tags?: PixivTag[] }>>;
}
