/**
 * Materialization policy: whether a resolved MediaAsset becomes a local file
 * eagerly or is deferred for a consumer.
 */
export type MaterializationMode = 'eager' | 'on-demand';

export interface MaterializationPolicy {
  mode: MaterializationMode;
}

/** Production-safe default: eager (current behavior unchanged). */
export const DEFAULT_MATERIALIZATION_POLICY: MaterializationPolicy = { mode: 'eager' };

/** True when the policy says a resolved medium should be materialized now. */
export function shouldMaterialize(policy: MaterializationPolicy): boolean {
  return policy.mode === 'eager';
}
