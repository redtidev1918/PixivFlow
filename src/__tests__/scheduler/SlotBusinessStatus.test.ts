import {
  classifySlotBusinessStatus,
  userMessageForSlotBusinessStatus,
} from '../../scheduler/SlotBusinessStatus';

describe('SlotBusinessStatus taxonomy', () => {
  const counts = (over: Partial<{ total: number; submitted: number; no_match: number; duplicate: number; executor_failed: number; delivery_failed: number }> = {}) => ({
    total: over.total ?? 2,
    submitted: over.submitted ?? 0,
    no_match: over.no_match ?? 0,
    duplicate: over.duplicate ?? 0,
    executor_failed: over.executor_failed ?? 0,
    delivery_failed: over.delivery_failed ?? 0,
  });

  it('success when every cell submitted', () => {
    expect(classifySlotBusinessStatus(counts({ submitted: 2 }))).toBe('success');
  });

  it('partial_success when some submitted and others are business/system', () => {
    expect(classifySlotBusinessStatus(counts({ submitted: 1, no_match: 1 }))).toBe('partial_success');
    expect(classifySlotBusinessStatus(counts({ submitted: 1, duplicate: 1 }))).toBe('partial_success');
  });

  it('duplicate_only when no submitted and all non-submitted cells are duplicates', () => {
    expect(classifySlotBusinessStatus(counts({ duplicate: 2 }))).toBe('duplicate_only');
  });

  it('no_candidate when no submitted and only no_match/mixed business', () => {
    expect(classifySlotBusinessStatus(counts({ no_match: 2 }))).toBe('no_candidate');
    expect(classifySlotBusinessStatus(counts({ no_match: 1, duplicate: 1 }))).toBe('no_candidate');
  });

  it('failed only when a system failure exists and nothing submitted', () => {
    expect(classifySlotBusinessStatus(counts({ executor_failed: 1, no_match: 1 }))).toBe('failed');
    expect(classifySlotBusinessStatus(counts({ delivery_failed: 1 }))).toBe('failed');
  });

  it('keeps internal error names out of user-facing copy', () => {
    const msg = userMessageForSlotBusinessStatus('duplicate_only');
    expect(msg).not.toMatch(/internal_error|OperationCancelledError|error/i);
    expect(userMessageForSlotBusinessStatus('no_candidate')).toContain('任务已正常完成');
  });
});
