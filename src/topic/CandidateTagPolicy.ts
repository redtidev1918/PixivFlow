import type { CandidateSelectionConfig } from '../config/types';
import { calculatePopularityScore } from '../utils/pixiv-utils';

type Tag = string | { name?: string; translated_name?: string };
interface TaggedCandidate {
  tags?: Tag[];
  translatedTags?: string[];
  popularity?: number;
}

const key = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase();

/** Shared selection policy for fresh searches, planning, and durable inventory. */
export class CandidateTagPolicy {
  private readonly required: Set<string>;
  private readonly preferred: Set<string>;
  private readonly boost: number;

  constructor(private readonly config: CandidateSelectionConfig = {}) {
    this.required = new Set((config.requiredTags ?? []).map(key));
    this.preferred = new Set((config.preferredTags ?? []).map(key));
    this.boost = config.preferredTagBoost ?? 0.25;
  }

  get hasPreference(): boolean { return this.preferred.size > 0 && this.boost > 0; }

  accepts(candidate: unknown): boolean {
    return this.required.size === 0 || this.names(candidate).some(name => this.required.has(name));
  }

  score(candidate: unknown): number {
    const value = candidate as TaggedCandidate | null;
    const popularity = value?.popularity ?? calculatePopularityScore((value ?? {}) as never);
    const preferred = this.names(candidate).some(name => this.preferred.has(name));
    return popularity * (preferred ? 1 + this.boost : 1);
  }

  compare(a: unknown, b: unknown): number { return this.score(b) - this.score(a); }

  private names(candidate: unknown): string[] {
    if (!candidate || typeof candidate !== 'object') return [];
    const value = candidate as TaggedCandidate;
    if (!Array.isArray(value.tags)) return [];
    const names: string[] = [];
    for (const tag of value.tags) {
      const name = typeof tag === 'string' ? tag : tag?.name;
      if (typeof name === 'string') names.push(key(name));
      if (this.config.matchTranslatedNames && typeof tag === 'object' && typeof tag?.translated_name === 'string') {
        names.push(key(tag.translated_name));
      }
    }
    if (this.config.matchTranslatedNames && Array.isArray(value.translatedTags)) {
      for (const name of value.translatedTags) if (typeof name === 'string') names.push(key(name));
    }
    return names;
  }
}
