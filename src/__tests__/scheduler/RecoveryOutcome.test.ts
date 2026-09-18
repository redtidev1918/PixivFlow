import {
  recoveryOutcomeFor,
  recoveryUserMessage,
  type RecoveryOutcomeState,
} from '../../scheduler/RecoveryOutcome';
import type { SlotItemRecord, CellStatus } from '../../storage/repositories/SlotRepository';

function cell(over: Partial<SlotItemRecord>): SlotItemRecord {
  return {
    id: 1,
    slotId: 'bot1-daily@recover-x',
    targetId: 'bot1-illust-botefuku',
    workId: null,
    workType: 'illustration',
    status: 'pending',
    attemptCount: 0,
    fallback_stage: 0,
    lastError: null,
    terminalReasonCode: null,
    terminalReasonMessage: null,
    candidateReport: null,
    createdAt: 'x',
    updatedAt: 'x',
    completedAt: null,
    ...over,
  };
}

describe('recovery outcome mapping', () => {
  it('duplicate_exhausted -> recovery_duplicate_only (never internal_error)', () => {
    const state = recoveryOutcomeFor(cell({ status: 'no_candidate', terminalReasonCode: 'duplicate_exhausted' }));
    expect(state).toBe('recovery_duplicate_only');
    expect(recoveryUserMessage(state)).toContain('均已发布过');
  });

  it('plain no_candidate -> recovery_no_candidate', () => {
    const state = recoveryOutcomeFor(cell({ status: 'no_candidate', terminalReasonCode: 'no_candidate' }));
    expect(state).toBe('recovery_no_candidate');
    expect(recoveryUserMessage(state)).toContain('任务已正常结束');
  });

  it('submitted -> recovery_success', () => {
    const state = recoveryOutcomeFor(cell({ status: 'submitted', workId: '999' }));
    expect(state).toBe('recovery_success');
  });

  it('failed -> recovery_failed', () => {
    const state = recoveryOutcomeFor(cell({ status: 'failed', terminalReasonCode: 'internal_error' }));
    expect(state).toBe('recovery_failed');
    expect(recoveryUserMessage(state)).toContain('查看日志');
  });

  it('non-terminal cell -> recovery_running', () => {
    expect(recoveryOutcomeFor(cell({ status: 'pending' }))).toBe('recovery_running');
    expect(recoveryOutcomeFor(cell({ status: 'delivery_pending' }))).toBe('recovery_running');
  });

  it('no cell -> recovery_pending', () => {
    expect(recoveryOutcomeFor(null)).toBe('recovery_pending');
  });

  it('user copy never leaks internal error names', () => {
    const states: RecoveryOutcomeState[] = [
      'recovery_success', 'recovery_no_candidate', 'recovery_duplicate_only', 'recovery_failed',
    ];
    for (const s of states) {
      expect(recoveryUserMessage(s)).not.toMatch(/internal_error|OperationCancelledError/);
    }
  });
});
