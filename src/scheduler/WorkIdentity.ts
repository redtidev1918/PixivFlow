import { TargetConfig } from '../config';

/**
 * Work identity for a scheduled cell.
 *
 * Invariant: (slotId, targetId) -> ONE stable workId. The first selection wins,
 * and every later crash / shutdown / lease recovery continues with THAT work.
 * Re-running candidate selection on resume silently re-points the logical item
 * at a different work (A -> B): the item then reports success while A sits
 * downloaded-but-never-delivered, and if A's delivery intent was already
 * durable both A and B get posted under different idempotency identities.
 */
export interface WorkBinding {
  /** Authoritative work id for the cell after the attempt (the CAS winner). */
  workId: string;
  /** True when this caller established — or already held — the binding. */
  won: boolean;
}

/**
 * Per-cell execution context handed to a target handler, so the cell's identity
 * travels with the work instead of being dropped at the dispatch boundary.
 *
 * `lockedWorkId` is an authoritative INPUT: when it is set, the handler must
 * continue exactly that work and must not run ranking / topic selection /
 * backfill / already-seen filtering. `bind()` is called for a candidate BEFORE
 * any of its side effects, so a crash during the download can never resume the
 * cell onto a different work.
 */
export interface TargetExecutionContext {
  readonly slotId: string;
  readonly targetId: string;
  /** The work this logical item is already bound to; null for a fresh cell. */
  readonly lockedWorkId: string | null;
  /** CAS-bind the cell to `workId`; returns the authoritative binding. */
  bind(workId: string, workType: string): WorkBinding;
  /** Roll back a provisional binding for a work that produced no artifact. */
  release(workId: string): void;
}

/**
 * True when one cell of this target selects at most ONE work per run — the only
 * shape the (slotId, targetId) -> workId invariant can hold for.
 *
 * A target that intentionally pulls N works per run (limit > 1, a novel series,
 * a user feed) owns N works inside a single cell, so pinning that cell to one
 * locked id on resume would silently shrink the run to a single work. Those keep
 * per-run candidate selection; the work-identity contract covers single-work
 * cells, which is what a scheduled "one post per slot" target is.
 */
export function isSingleWorkCell(target: TargetConfig): boolean {
  // An explicit limit is the operator's own answer to "how many per run?".
  if (typeof target.limit === 'number' && target.limit > 0) return target.limit === 1;
  // Pinned single-work targets.
  if (target.type === 'novel' && target.novelId !== undefined && target.novelId !== null) return true;
  if (target.type !== 'novel' && target.illustId) return true;
  // N-work containers never collapse into a single identity.
  if (target.userId) return false;
  if (target.type === 'novel' && target.seriesId) return false;
  // Search/ranking default to ten works per run; a topic run defaults to one.
  return target.mode === 'topic';
}
