import type { PixivTag } from '../pixiv/types';
import type {
  TagDiscoveryCandidate,
  TagDiscoveryClient,
  TagDiscoveryContentType,
  TagDiscoveryManifest,
} from './types';

export interface TagDiscoveryOptions {
  contentTypes?: TagDiscoveryContentType[];
  sampleSize?: number;
  limit?: number;
  ttlMs?: number;
  now?: () => number;
}

interface CandidateAccumulator {
  name: string;
  translatedName?: string;
  autocompleteRank?: number;
  illustrationWorks: Set<number>;
  novelWorks: Set<number>;
}

/** Combines Pixiv autocomplete with bounded tag co-occurrence sampling. */
export class TagDiscoveryService {
  constructor(private readonly client: TagDiscoveryClient) {}

  async discover(seed: string, options: TagDiscoveryOptions = {}): Promise<TagDiscoveryManifest> {
    const normalizedSeed = seed.trim();
    if (!normalizedSeed) throw new Error('Tag discovery seed must not be empty');

    const contentTypes = this.normalizeContentTypes(options.contentTypes);
    const sampleSize = this.boundedInteger(options.sampleSize, 60, 1, 200, 'sampleSize');
    const limit = this.boundedInteger(options.limit, 20, 1, 100, 'limit');
    const ttlMs = this.boundedInteger(options.ttlMs, 7 * 24 * 60 * 60_000, 60_000, 30 * 24 * 60 * 60_000, 'ttlMs');
    const accumulators = new Map<string, CandidateAccumulator>();

    const autocomplete = await this.client.getTagAutocomplete(normalizedSeed);
    autocomplete.forEach((tag, index) => {
      const entry = this.accumulate(accumulators, tag);
      if (entry) entry.autocompleteRank = Math.min(entry.autocompleteRank ?? index, index);
    });

    const sampledWorks = { illustration: 0, novel: 0 };
    if (contentTypes.includes('illustration')) {
      const works = await this.client.searchIllustrationsForTags(normalizedSeed, sampleSize);
      sampledWorks.illustration = works.length;
      this.accumulateWorks(accumulators, works, 'illustration');
    }
    if (contentTypes.includes('novel')) {
      const works = await this.client.searchNovelsForTags(normalizedSeed, sampleSize);
      sampledWorks.novel = works.length;
      this.accumulateWorks(accumulators, works, 'novel');
    }

    const seedKey = this.key(normalizedSeed);
    const candidates = [...accumulators.values()]
      .filter((candidate) => this.key(candidate.name) !== seedKey && this.key(candidate.translatedName ?? '') !== seedKey)
      .map((candidate) => this.toCandidate(candidate, autocomplete.length, sampledWorks))
      .sort((left, right) => right.score - left.score || this.totalOccurrences(right) - this.totalOccurrences(left) || left.name.localeCompare(right.name))
      .slice(0, limit);

    const now = options.now?.() ?? Date.now();
    return {
      version: 1,
      seed: normalizedSeed,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
      contentTypes,
      sampleSize,
      sampledWorks,
      candidates,
    };
  }

  private normalizeContentTypes(types?: TagDiscoveryContentType[]): TagDiscoveryContentType[] {
    const fallback: TagDiscoveryContentType[] = ['illustration', 'novel'];
    const resolved: TagDiscoveryContentType[] = types && types.length ? types : fallback;
    return [...new Set(resolved)];
  }

  private boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
      throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return resolved;
  }

  private accumulateWorks(
    accumulators: Map<string, CandidateAccumulator>,
    works: Array<{ tags?: PixivTag[] }>,
    type: TagDiscoveryContentType
  ): void {
    works.forEach((work, workIndex) => {
      const seen = new Set<string>();
      for (const tag of work.tags ?? []) {
        const key = this.key(tag.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const entry = this.accumulate(accumulators, tag);
        if (entry) {
          (type === 'illustration' ? entry.illustrationWorks : entry.novelWorks).add(workIndex);
        }
      }
    });
  }

  private accumulate(accumulators: Map<string, CandidateAccumulator>, tag: PixivTag): CandidateAccumulator | undefined {
    const name = tag.name?.trim();
    const key = this.key(name ?? '');
    if (!key) return undefined;
    let entry = accumulators.get(key);
    if (!entry) {
      entry = {
        name,
        translatedName: tag.translated_name?.trim() || undefined,
        illustrationWorks: new Set(),
        novelWorks: new Set(),
      };
      accumulators.set(key, entry);
    } else if (!entry.translatedName && tag.translated_name?.trim()) {
      entry.translatedName = tag.translated_name.trim();
    }
    return entry;
  }

  private toCandidate(
    candidate: CandidateAccumulator,
    autocompleteCount: number,
    sampledWorks: { illustration: number; novel: number }
  ): TagDiscoveryCandidate {
    const autocompleteScore = candidate.autocompleteRank === undefined
      ? 0
      : Math.max(0.5, 1 - candidate.autocompleteRank / Math.max(autocompleteCount * 2, 1));
    const cooccurrenceScore = Math.max(
      sampledWorks.illustration ? candidate.illustrationWorks.size / sampledWorks.illustration : 0,
      sampledWorks.novel ? candidate.novelWorks.size / sampledWorks.novel : 0
    );
    const score = 1 - (1 - autocompleteScore) * (1 - cooccurrenceScore);
    const sources: TagDiscoveryCandidate['sources'] = [];
    if (candidate.autocompleteRank !== undefined) sources.push('autocomplete');
    if (candidate.illustrationWorks.size || candidate.novelWorks.size) sources.push('cooccurrence');
    const types: TagDiscoveryContentType[] = [];
    if (candidate.illustrationWorks.size) types.push('illustration');
    if (candidate.novelWorks.size) types.push('novel');

    return {
      name: candidate.name,
      translatedName: candidate.translatedName,
      sources,
      types,
      occurrences: {
        illustration: candidate.illustrationWorks.size,
        novel: candidate.novelWorks.size,
      },
      score: Number(score.toFixed(4)),
    };
  }

  private key(value: string): string {
    return value.trim().normalize('NFKC').toLocaleLowerCase();
  }

  private totalOccurrences(candidate: TagDiscoveryCandidate): number {
    return candidate.occurrences.illustration + candidate.occurrences.novel;
  }
}
