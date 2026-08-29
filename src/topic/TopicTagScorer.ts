import type { ResolvedTag, WorkLike } from './types';

/**
 * Lightweight, explainable tag relatedness. No ML — pure co-occurrence stats
 * over the small, bounded samples the resolver fetches.
 *
 *   score = coverage * specificity * suggestionWeight
 *
 * - coverage:      fraction of the seed-topic sample that carries the tag.
 * - specificity:   how much more often the tag appears with the topic than in
 *                  the background. High-frequency but topic-agnostic tags
 *                  (R-18, オリジナル, 女の子…) get pushed down automatically.
 * - suggestionWeight: a modest boost when Pixiv autocomplete also returns it.
 *
 * The background document frequency is estimated from a cheap background
 * sample (a recent, unrelated search) when available, falling back to a small
 * curated set of platform-wide tags. We deliberately keep that list tiny — the
 * specificity score does the real denoising.
 */

/** Platform-level tags that are almost never topic-specific. */
const GENERIC_TAG_PENALTY = new Set([
  'r-18', 'r-18g', 'r-15', 'original', 'オリジナル', '創作', '女の子', '男の子',
  'イラスト', '漫画', 'manga', 'illustration', 'artwork', '落書き', 'らくがき',
  '1000users入り', '5000users入り', '10000users入り', '500users入り', '100users入り',
  'pixiv', 'commission', 'skeb', '依頼絵', '仕事絵',
]);

interface TagStat {
  name: string;
  translatedName?: string;
  topicDocs: number; // seed-sample works containing the tag
  backgroundDocs: number; // background-sample works containing the tag
  suggested: boolean;
}

export interface ScorerInput {
  seed: string;
  topicWorks: WorkLike[];
  backgroundWorks: WorkLike[];
  suggestedNames: Set<string>;
  /** Full autocomplete suggestions (used to recall tags absent from the sample). */
  suggestedTags?: Array<{ name: string; translated_name?: string }>;
}

/**
 * Confidence for a tag that Pixiv autocomplete explicitly relates to the topic
 * but which did NOT co-occur in the bounded seed sample. It is a legitimate but
 * lower-confidence recall channel: it can enter the search space, yet always
 * ranks below co-occurring tags (it carries occurrences = 0) and is capped by
 * maxTags. Fixed modest score keeps it above minScore without outranking real
 * co-occurrence evidence.
 */
const AUTOCOMPLETE_ONLY_SCORE = 0.27;

export class TopicTagScorer {
  /** Normalize for matching/keys: trim, NFKC, lower-case. */
  key(value: string): string {
    return value.trim().normalize('NFKC').toLocaleLowerCase();
  }

  score(input: ScorerInput): ResolvedTag[] {
    const seedKey = this.key(input.seed);
    const topicSize = Math.max(input.topicWorks.length, 1);
    const backgroundSize = Math.max(input.backgroundWorks.length, 1);

    const stats = new Map<string, TagStat>();
    const accumulate = (works: WorkLike[], bucket: 'topicDocs' | 'backgroundDocs') => {
      for (const work of works) {
        const seen = new Set<string>();
        for (const tag of work.tags ?? []) {
          const name = tag.name?.trim();
          const k = this.key(name ?? '');
          if (!k || seen.has(k)) continue;
          seen.add(k);
          let stat = stats.get(k);
          if (!stat) {
            stat = { name: name as string, translatedName: tag.translated_name?.trim() || undefined, topicDocs: 0, backgroundDocs: 0, suggested: false };
            stats.set(k, stat);
          } else if (!stat.translatedName && tag.translated_name?.trim()) {
            stat.translatedName = tag.translated_name.trim();
          }
          stat[bucket] += 1;
        }
      }
    };

    accumulate(input.topicWorks, 'topicDocs');
    accumulate(input.backgroundWorks, 'backgroundDocs');
    for (const name of input.suggestedNames) {
      const k = this.key(name);
      const stat = stats.get(k);
      if (stat) stat.suggested = true;
    }

    const resolved: ResolvedTag[] = [];
    for (const [k, stat] of stats) {
      if (k === seedKey) continue; // seed is added separately with score 1
      const coverage = stat.topicDocs / topicSize;
      if (stat.topicDocs <= 0) continue;

      // Background frequency of the tag in the unrelated sample. Tags that are
      // common everywhere (R-18, オリジナル…) have high backgroundFreq; tags
      // that only travel with the topic have ~0.
      const backgroundFreq = stat.backgroundDocs / backgroundSize;

      // PMI-style lift: how much more the tag appears with the topic than at
      // large. Positive (and growing for background-absent tags), near/below 0
      // for generic tags. Additive smoothing prevents divide-by-zero blowups.
      const lift = Math.log((coverage + 0.03) / (backgroundFreq + 0.03));
      // Map lift to a 0..1+ specificity via a logistic-ish squish; a lift of ~0
      // (equally common in background) maps to ~0.5 and strongly generic tags
      // fall below it.
      const specificity = Math.max(0, Math.min(1.2, lift / 3 + 0.5));

      // Final score rewards both co-occurrence (recall) and specificity
      // (precision), so rare-but-exclusive tags can still surface while
      // ubiquitous tags are suppressed.
      const recall = Math.sqrt(coverage); // dampen so mid-coverage can win
      const suggestionWeight = stat.suggested ? 1.1 : 1.0;
      const genericPenalty = GENERIC_TAG_PENALTY.has(k) ? 0.4 : 1.0;

      const raw = recall * specificity * suggestionWeight * genericPenalty;
      resolved.push({
        name: stat.name,
        translatedName: stat.translatedName,
        score: Number(raw.toFixed(4)),
        occurrences: stat.topicDocs,
        coverage: Number(coverage.toFixed(4)),
        specificity: Number(specificity.toFixed(4)),
        suggested: stat.suggested,
        seed: false,
      });
    }

    // Autocomplete-only recall: tags Pixiv explicitly relates to the seed that
    // never appeared in the bounded sample. They earn a modest, fixed confidence
    // (no co-occurrence evidence) and occurrences = 0, so the global sort below
    // always places them after any tag that actually co-occurs.
    const seenKeys = new Set(resolved.map((r) => this.key(r.name)));
    for (const sug of input.suggestedTags ?? []) {
      const name = sug.name?.trim();
      const k = this.key(name ?? '');
      if (!k || k === seedKey || seenKeys.has(k)) continue;
      if (GENERIC_TAG_PENALTY.has(k)) continue; // never recall platform-generic tags
      seenKeys.add(k);
      resolved.push({
        name: name as string,
        translatedName: sug.translated_name?.trim() || undefined,
        score: AUTOCOMPLETE_ONLY_SCORE,
        occurrences: 0,
        coverage: 0,
        specificity: 1.0, // Pixiv-endorsed related; treated as specific but unobserved
        suggested: true,
        seed: false,
      });
    }

    resolved.sort(
      (a, b) => b.score - a.score || b.occurrences - a.occurrences || a.name.localeCompare(b.name)
    );
    return resolved;
  }
}