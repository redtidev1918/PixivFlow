/**
 * Watchdog helper (runWithTimeout) tests.
 */

import { runWithTimeout } from '../../commands/scheduler-runtime';

describe('runWithTimeout watchdog', () => {
  it('resolves when the task finishes before the deadline', async () => {
    const onTimeout = jest.fn();
    const result = await runWithTimeout(
      Promise.resolve('done'),
      5000,
      onTimeout,
      'plan test'
    );
    expect(result).toBe('done');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('rejects and cancels when the task exceeds the deadline', async () => {
    const onTimeout = jest.fn();
    const hang = new Promise<never>((resolve) => {
      // never settles
      void resolve;
    });
    await expect(
      runWithTimeout(hang, 50, onTimeout, 'plan test')
    ).rejects.toThrow(/exceeded 50ms watchdog/);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('propagates the original task error when it fails first', async () => {
    const onTimeout = jest.fn();
    await expect(
      runWithTimeout(Promise.reject(new Error('download boom')), 5000, onTimeout, 'plan test')
    ).rejects.toThrow('download boom');
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
