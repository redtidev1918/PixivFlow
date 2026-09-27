/**
 * Occurrence-scoped retrieval view for `candidate_search` (§6 `$defs/CandidateSearchParams`).
 *
 * A generic job may narrow or redirect HOW it looks for a work — tags, expansion,
 * scan depth, exclusions — but never WHAT it delivers: `applyCandidateSearchParams`
 * is a pure function over a target snapshot that touches retrieval levers only.
 * Delivery wiring, the target id and the plan identity are structurally out of
 * reach here, which is why this mapping lives in one small pure module instead of
 * being spread over the run path.
 *
 * The requested view is stored on the manual Slot (the same occurrence-scoped
 * precedent as `recovery_mode`) so a worker that resumes a crashed job re-applies
 * exactly the retrieval the requester asked for. Nothing here writes global
 * config: a manual job can never change future scheduled runs.
 */

import { TargetConfig } from '../config';

/** `$defs/CandidateSearchParams.constraints.exclude` item. */
export interface CandidateSearchExclude {
  kind: 'work' | 'candidate' | 'tag';
  id: string;
}

/** `$defs/CandidateSearchParams`. Only the retrieval/constraint part is modelled. */
export interface CandidateSearchParams {
  source?: {
    platform?: string;
    account?: string;
  };
  query: {
    tags: string[];
    expand?: boolean;
  };
  constraints?: {
    exclude?: CandidateSearchExclude[];
    limit?: number;
    scan_limit?: number;
    work_types?: string[];
  };
}

/** Scan limits are clamped to the same 1..100 window the config validation uses. */
export const CANDIDATE_SEARCH_SCAN_LIMIT_MAX = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Project one target through a requested retrieval view (pure; never mutates the
 * input or the global config).
 *
 * - `query.tags` becomes the tag expression (`tag` is the repo's space-joined
 *   multi-tag field).
 * - `query.expand` maps to `tagRelation: 'or'`: for multiple tags that is exactly
 *   "recall expansion" (union instead of intersection), and for a single tag it
 *   is a no-op rather than an invented behaviour.
 * - `constraints.limit` / `constraints.scan_limit` feed the existing per-target
 *   knobs, clamped to the validated window and never below `limit`.
 *
 * `constraints.exclude` and `constraints.work_types` are NOT applied here: an
 * exclusion is a run-level duplicate filter (`excludedWorkIdsFromParams`) and a
 * work-type restriction is checked against the resolved target by the admission,
 * where the target is known.
 */
export function applyCandidateSearchParams(
  target: TargetConfig,
  params: CandidateSearchParams
): TargetConfig {
  const tags = params.query.tags;
  const limit =
    params.constraints?.limit !== undefined ? clamp(params.constraints.limit, 1, CANDIDATE_SEARCH_SCAN_LIMIT_MAX) : target.limit;
  const scanLimit =
    params.constraints?.scan_limit !== undefined
      ? clamp(params.constraints.scan_limit, limit ?? 1, CANDIDATE_SEARCH_SCAN_LIMIT_MAX)
      : target.candidateScanLimit;

  return {
    ...target,
    tag: tags.join(' '),
    ...(tags.length > 1 && params.query.expand === true ? { tagRelation: 'or' as const } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(scanLimit !== undefined ? { candidateScanLimit: scanLimit } : {}),
  };
}

/**
 * Map `constraints.exclude` onto the existing per-run duplicate history.
 *
 * A `kind: 'work'` exclusion is a work id the runner must not select. The ledger
 * keys history by work type, and a protocol caller does not know the producer's
 * work type, so the id is excluded for both types — narrowing, never widening.
 */
export function excludedWorkIdsFromParams(
  params: CandidateSearchParams
): { illustration: string[]; novel: string[] } | null {
  const ids = (params.constraints?.exclude ?? [])
    .filter((entry) => entry.kind === 'work')
    .map((entry) => entry.id)
    .filter((id) => id.length > 0);
  if (ids.length === 0) return null;
  return { illustration: [...ids], novel: [...ids] };
}

/**
 * Read the retrieval view back off a Slot row. Tolerant by design: a row written
 * by an older build (or corrupted JSON) yields `null`, which means "run the plan
 * exactly as configured" — the behaviour of every pre-existing slot.
 */
export function parseCandidateSearchParamsJson(
  json: string | null | undefined
): CandidateSearchParams | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as CandidateSearchParams;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.query?.tags) || parsed.query.tags.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}
