/**
 * Pure, testable finite state machine for one schedule Slot cell.
 *
 * A cell tracks ONE target within ONE scheduled occurrence. The crucial
 * distinction the old code lacked: delivery_pending is NOT submitted. Only a
 * confirmed downstream ACK moves a cell to 'submitted'.
 *
 *   pending -> selected -> artifact_ready -> delivery_pending -> submitted
 *                                  \----------------------------/-> duplicate
 *   pending/selected/... -> no_candidate | failed
 *
 * Work-lock invariant: once a cell holds a work_id it is never silently
 * swapped by an automatic retry. Historical-duplicate replacement after a
 * lock is the single narrow exception and is expressed by its own transition.
 */
export type CellState =
  | 'pending'
  | 'selected'
  | 'artifact_ready'
  | 'delivery_pending'
  | 'submitted'
  | 'no_candidate'
  | 'duplicate'
  | 'failed';

export const TERMINAL_CELL_STATES: ReadonlySet<CellState> = new Set([
  'submitted',
  'no_candidate',
  'duplicate',
  'failed',
]);

const ALLOWED: Record<CellState, CellState[]> = {
  pending: ['selected', 'artifact_ready', 'delivery_pending', 'submitted', 'no_candidate', 'duplicate', 'failed'],
  selected: ['artifact_ready', 'delivery_pending', 'submitted', 'no_candidate', 'duplicate', 'failed'],
  artifact_ready: ['delivery_pending', 'submitted', 'duplicate', 'failed'],
  // A pending delivery may still prove to be an attested historical duplicate,
  // or fail permanently. A retryable failure stays delivery_pending (worker).
  delivery_pending: ['submitted', 'duplicate', 'failed'],
  // Terminal states are immutable under normal transitions.
  submitted: [],
  no_candidate: [],
  duplicate: [],
  failed: [],
};

/** Complement of TERMINAL_CELL_STATES — the single source for "still active". */
export const ACTIVE_CELL_STATES: ReadonlySet<CellState> = new Set(
  (Object.keys(ALLOWED) as CellState[]).filter((s) => !TERMINAL_CELL_STATES.has(s)),
);

export function canTransition(from: CellState, to: CellState): boolean {
  if (from === to) return false;
  return ALLOWED[from].includes(to);
}

export class IllegalCellTransition extends Error {
  constructor(public readonly from: CellState, public readonly to: CellState) {
    super(`illegal slot cell transition: ${from} -> ${to}`);
    this.name = 'IllegalCellTransition';
  }
}

/**
 * Validate a transition. Never downgrades a terminal/confirmed cell: a late
 * failure or a duplicate trigger cannot erase an already-submitted result.
 */
export function assertTransition(from: CellState, to: CellState): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new IllegalCellTransition(from, to);
  }
}
