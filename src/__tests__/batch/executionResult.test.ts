import {
  EXIT_FAILED,
  EXIT_PARTIAL,
  EXIT_SUCCESS,
  EXIT_UNCERTAIN,
  executionStatusForExitCode,
  outcomeToTargetResult,
  summarizeExecution,
  type BatchTargetResult,
} from '../../batch/executionResult';
import type { TargetOutcome } from '../../scheduler/TargetOutcome';

const submitted = (targetId: string, workId = '1'): BatchTargetResult => ({
  targetId,
  status: 'submitted',
  workId,
});

describe('per-target outcomes map to explicit statuses', () => {
  it('maps every TargetOutcome kind without inventing success', () => {
    const cases: Array<[TargetOutcome, string]> = [
      [{ kind: 'submitted', workId: '9', workType: 'illustration' }, 'submitted'],
      [{ kind: 'stored', workId: '9', workType: 'novel' }, 'stored'],
      [
        { kind: 'delivery_pending', workId: '9', workType: 'illustration', deliveryId: 'd1' },
        'delivery_pending',
      ],
      [{ kind: 'duplicate', workId: '9', reason: 'already delivered' }, 'duplicate'],
      [{ kind: 'no_candidate', reason: 'nothing matched' }, 'no_candidate'],
      [{ kind: 'failed', retryable: true, error: 'pixiv 429' }, 'failed'],
    ];
    for (const [outcome, status] of cases) {
      expect(outcomeToTargetResult('t1', outcome).status).toBe(status);
    }
  });

  it('keeps the retryable flag and the error text for failures', () => {
    const result = outcomeToTargetResult('t1', { kind: 'failed', retryable: false, error: 'auth' });
    expect(result.retryable).toBe(false);
    expect(result.error).toBe('auth');
  });
});

describe('execution status is derived from the target set, never assumed', () => {
  it('is success only when every expected target was delivered', () => {
    const summary = summarizeExecution([submitted('a'), submitted('b')], ['a', 'b']);
    expect(summary.status).toBe('success');
    expect(summary.exitCode).toBe(EXIT_SUCCESS);
  });

  it('reports a target that produced no outcome as missing, not success', () => {
    const summary = summarizeExecution([submitted('a')], ['a', 'b']);
    expect(summary.status).toBe('partial');
    expect(summary.exitCode).toBe(EXIT_PARTIAL);
    expect(summary.targets.find((target) => target.targetId === 'b')?.status).toBe('missing');
  });

  it('treats an unconfirmed send as uncertain and never as retryable success', () => {
    const summary = summarizeExecution(
      [
        submitted('a'),
        { targetId: 'b', status: 'delivery_pending', workId: '7' },
      ],
      ['a', 'b']
    );
    expect(summary.status).toBe('uncertain');
    expect(summary.exitCode).toBe(EXIT_UNCERTAIN);
  });

  it('reports nothing-delivered as failed', () => {
    const summary = summarizeExecution(
      [
        { targetId: 'a', status: 'failed', error: 'boom' },
        { targetId: 'b', status: 'failed', error: 'boom' },
      ],
      ['a', 'b']
    );
    expect(summary.status).toBe('failed');
    expect(summary.exitCode).toBe(EXIT_FAILED);
  });

  it('reports all-empty-candidates as partial (business outcome, not a crash)', () => {
    const summary = summarizeExecution(
      [
        { targetId: 'a', status: 'no_candidate', error: 'none' },
        { targetId: 'b', status: 'no_candidate', error: 'none' },
      ],
      ['a', 'b']
    );
    expect(summary.status).toBe('partial');
    expect(summary.exitCode).toBe(EXIT_PARTIAL);
  });

  it('matches the production incident shape: one delivered, one empty', () => {
    // bot1-daily@2026-09-10T1000 was `partial`: the novel was submitted and the
    // illustration found no candidates across the fallback days.
    const summary = summarizeExecution(
      [submitted('bot1-novel-botefuku', '29088506'), { targetId: 'bot1-illust-botefuku', status: 'no_candidate', error: 'no matching illustrations' }],
      ['bot1-illust-botefuku', 'bot1-novel-botefuku']
    );
    expect(summary.status).toBe('partial');
    expect(summary.exitCode).toBe(EXIT_PARTIAL);
    expect(summary.targets).toHaveLength(2);
  });

  it('is failed when no targets were resolved at all', () => {
    const summary = summarizeExecution([], []);
    expect(summary.status).toBe('failed');
    expect(summary.exitCode).toBe(EXIT_FAILED);
  });

  it('keeps unexpected extra outcomes visible instead of dropping them', () => {
    const summary = summarizeExecution([submitted('a'), submitted('zzz')], ['a']);
    expect(summary.targets.map((target) => target.targetId)).toEqual(['a', 'zzz']);
  });

  it('exit codes are a documented one-to-one mapping of the status', () => {
    expect(executionStatusForExitCode(EXIT_SUCCESS)).toBe('success');
    expect(executionStatusForExitCode(EXIT_PARTIAL)).toBe('partial');
    expect(executionStatusForExitCode(EXIT_UNCERTAIN)).toBe('uncertain');
    expect(executionStatusForExitCode(EXIT_FAILED)).toBe('failed');
    // A process-level error is also a failed execution, never a success.
    expect(executionStatusForExitCode(1)).toBe('failed');
  });
});
