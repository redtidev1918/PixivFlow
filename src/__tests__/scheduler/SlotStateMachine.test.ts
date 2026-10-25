import {
  ACTIVE_CELL_STATES,
  TERMINAL_CELL_STATES,
  assertTransition,
  canTransition,
  IllegalCellTransition,
} from '../../scheduler/SlotStateMachine';

const ALL_STATES = [
  'pending',
  'selected',
  'artifact_ready',
  'delivery_pending',
  'submitted',
  'no_candidate',
  'duplicate',
  'failed',
] as const;

describe('slot cell state machine invariants', () => {
  it('ACTIVE ∪ TERMINAL covers every state and is disjoint', () => {
    for (const state of ALL_STATES) {
      expect(ACTIVE_CELL_STATES.has(state) !== TERMINAL_CELL_STATES.has(state)).toBe(true);
    }
    expect(ACTIVE_CELL_STATES.size + TERMINAL_CELL_STATES.size).toBe(ALL_STATES.length);
  });

  it('terminal states have no outgoing transitions', () => {
    for (const terminal of TERMINAL_CELL_STATES) {
      for (const to of ALL_STATES) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });

  it('never downgrades a confirmed submission', () => {
    for (const to of ALL_STATES) {
      if (to === 'submitted') continue;
      expect(() => assertTransition('submitted', to)).toThrow(IllegalCellTransition);
    }
    expect(() => assertTransition('submitted', 'submitted')).not.toThrow();
  });

  it('delivery_pending may only resolve to submitted/duplicate/failed', () => {
    expect(canTransition('delivery_pending', 'submitted')).toBe(true);
    expect(canTransition('delivery_pending', 'duplicate')).toBe(true);
    expect(canTransition('delivery_pending', 'failed')).toBe(true);
    expect(canTransition('delivery_pending', 'selected')).toBe(false);
    expect(canTransition('delivery_pending', 'no_candidate')).toBe(false);
  });
});
