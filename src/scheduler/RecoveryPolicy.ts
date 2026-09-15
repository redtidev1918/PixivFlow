/**
 * Execution / acquisition policy preset (§recovery-policy).
 *
 * Operators do not tune `lookbackDays` / `candidateScanLimit` / language
 * windows per attempt. The server defines a small number of named presets —
 * `normal` and `relaxed` — and a recovery run reads the "effective policy"
 * derived from the base config plus the occurrence-scoped override.
 *
 * Hard business constraints are NEVER relaxed by an ordinary recovery policy:
 * security rules, explicit bans, wrong media type, data-integrity requirements,
 * permission constraints, the selected topic/work-type boundary, delivery
 * wiring and already-successfully-submitted exact duplicates are untouched.
 * Only SOFT criteria (search range, candidate scan count, language-candidate
 * window) may widen.
 *
 * The override is occurrence-scoped: `applyAcquisitionPolicy` is a pure
 * function over a target snapshot. Nothing here ever writes the global config,
 * so a manual relaxed recovery can never change future scheduled runs.
 */
import { TargetConfig } from '../config';

export type RecoveryMode = 'normal' | 'relaxed';

/** The soft levers an acquisition policy may adjust. */
export interface AcquisitionPolicy {
  /** Multiplier over the effective candidate scan limit (capped at 100). */
  scanLimitMultiplier: number;
  /** Multiplier over `noMatchPolicy.lookbackDays` (capped at the config max). */
  lookbackDaysMultiplier: number;
  /** Multiplier over the novel `languageCandidateLimit` search window. */
  languageCandidateLimitMultiplier: number;
}

/**
 * Server-defined presets. `normal` is the identity policy (the base config);
 * `relaxed` widens only the soft criteria above.
 */
export const ACQUISITION_POLICIES: Record<RecoveryMode, AcquisitionPolicy> = {
  normal: {
    scanLimitMultiplier: 1,
    lookbackDaysMultiplier: 1,
    languageCandidateLimitMultiplier: 1,
  },
  relaxed: {
    scanLimitMultiplier: 3,
    lookbackDaysMultiplier: 3,
    languageCandidateLimitMultiplier: 2,
  },
};

/** Cap on the relaxed scan limit, mirroring the schedule fallback cap. */
export const RELAXED_SCAN_LIMIT_CAP = 100;
/** Cap on lookback days widened by a policy (matches the config validation cap). */
export const RELAXED_LOOKBACK_DAYS_CAP = 7;

/**
 * Apply an acquisition policy to ONE target snapshot (pure; never mutates the
 * input or global config). `normal` returns the target unchanged.
 */
export function applyAcquisitionPolicy(target: TargetConfig, mode: RecoveryMode): TargetConfig {
  if (mode === 'normal') return target;
  const policy = ACQUISITION_POLICIES[mode];

  const scanLimit =
    target.candidateScanLimit !== undefined
      ? cap(MULTIPLY(target.candidateScanLimit, policy.scanLimitMultiplier), RELAXED_SCAN_LIMIT_CAP)
      : undefined;
  const languageCandidateLimit =
    target.languageCandidateLimit !== undefined
      ? MULTIPLY(target.languageCandidateLimit, policy.languageCandidateLimitMultiplier)
      : undefined;
  const lookbackDays = widenLookback(target.noMatchPolicy?.lookbackDays, policy.lookbackDaysMultiplier);

  if (scanLimit === undefined && languageCandidateLimit === undefined && lookbackDays === undefined) {
    return target;
  }
  return {
    ...target,
    ...(scanLimit !== undefined ? { candidateScanLimit: scanLimit } : {}),
    ...(languageCandidateLimit !== undefined ? { languageCandidateLimit } : {}),
    ...(lookbackDays !== undefined
      ? { noMatchPolicy: { ...(target.noMatchPolicy ?? {}), lookbackDays } }
      : {}),
  };
}

function MULTIPLY(value: number, multiplier: number): number {
  return Math.max(1, Math.floor(value * multiplier));
}

function cap(value: number, maximum: number): number {
  return Math.min(value, maximum);
}

function widenLookback(value: number | undefined, multiplier: number): number | undefined {
  if (value === undefined) return undefined;
  return Math.min(MULTIPLY(value, multiplier), RELAXED_LOOKBACK_DAYS_CAP);
}