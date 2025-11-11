import { DefaultErrorRecovery } from '../../download/recovery/ErrorRecovery';
import { NetworkError } from '../../utils/errors';

describe('DefaultErrorRecovery', () => {
  it('skips immediately for 404 errors', () => {
    const recovery = new DefaultErrorRecovery();
    const decision = recovery.decide(new Error('404 not found'), { attempt: 1, itemId: 123 });
    expect(decision).toEqual({ action: 'skip', reason: expect.stringContaining('404') });
  });

  it('skips for explicitly skipable errors', () => {
    const recovery = new DefaultErrorRecovery();
    const decision = recovery.decide(new Error('Request timeout'), { attempt: 1, itemId: 456 });
    expect(decision.action).toBe('skip');
  });

  it('uses server-provided wait time for network errors', () => {
    const recovery = new DefaultErrorRecovery({ maxAttempts: 5, baseDelayMs: 1000 });
    const error = new NetworkError('Rate limited', undefined, undefined, { waitTime: 2500 });
    const decision = recovery.decide(error, { attempt: 2, itemId: 789, itemType: 'illustration' });
    expect(decision).toEqual({
      action: 'backoff',
      delayMs: 2500,
      maxAttempts: 5,
      reason: 'network error',
    });
  });

  it('applies exponential backoff for network errors without wait time', () => {
    const recovery = new DefaultErrorRecovery({ maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 4000 });
    const error = new NetworkError('Temporary failure');
    const decision = recovery.decide(error, { attempt: 3, itemId: 111, itemType: 'novel' });
    if (decision.action !== 'backoff') {
      throw new Error(`Expected backoff decision, received ${decision.action}`);
    }
    expect(decision.delayMs).toBe(2000);
    expect(decision.maxAttempts).toBe(4);
  });

  it('retries generic errors with linear backoff until max attempts', () => {
    const recovery = new DefaultErrorRecovery({ maxAttempts: 3, baseDelayMs: 300, maxDelayMs: 900 });
    const decision = recovery.decide(new Error('Transient glitch'), { attempt: 2, itemId: 222 });
    expect(decision).toEqual({
      action: 'retry',
      delayMs: 600,
      maxAttempts: 3,
      reason: 'transient error',
    });
  });

  it('fails when attempts exceed limit', () => {
    const recovery = new DefaultErrorRecovery({ maxAttempts: 2 });
    const decision = recovery.decide(new Error('Persistent failure'), { attempt: 3, itemId: 333 });
    expect(decision).toEqual({ action: 'fail', reason: 'max attempts reached' });
  });
});






