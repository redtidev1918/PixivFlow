import { JobFailure, Scheduler } from '../../scheduler/Scheduler';
import { OperationCancelledError } from '../../utils/errors';

it('reports a failed run and whether the failure limit stopped the plan', async () => {
  let resolveFailure!: (failure: JobFailure) => void;
  const reported = new Promise<JobFailure>((resolve) => { resolveFailure = resolve; });
  const scheduler = new Scheduler(
    { enabled: true, cron: '0 0 1 1 *', maxConsecutiveFailures: 1 },
    undefined,
    undefined,
    'bot1',
    undefined,
    resolveFailure
  );
  scheduler.start(async () => { throw new Error('network down'); });

  scheduler.runNow();

  await expect(reported).resolves.toEqual(expect.objectContaining({
    scheduleId: 'bot1',
    executionNumber: 1,
    status: 'failed',
    errorMessage: 'network down',
    consecutiveFailures: 1,
    stopped: true,
  }));
  scheduler.stop();
});

it('counts a timed-out cancellation as a failure', async () => {
  let rejectJob!: (error: Error) => void;
  let resolveFailure!: (failure: JobFailure) => void;
  const reported = new Promise<JobFailure>((resolve) => { resolveFailure = resolve; });
  const scheduler = new Scheduler(
    { enabled: true, cron: '0 0 1 1 *', timeout: 10, maxConsecutiveFailures: 1 },
    undefined,
    {
      beginRun: () => 0,
      endRun: () => 0,
      requestCancel: () => rejectJob(new OperationCancelledError('cancelled')),
    },
    'bot1',
    undefined,
    resolveFailure
  );
  scheduler.start(() => new Promise<void>((_resolve, reject) => { rejectJob = reject; }));

  scheduler.runNow();

  await expect(reported).resolves.toEqual(expect.objectContaining({
    status: 'timeout',
    consecutiveFailures: 1,
    stopped: true,
  }));
  scheduler.stop();
});

it.each([
  { checkpoints: [], deadline: 1_000, reason: 'no progress' },
  { checkpoints: [800, 1600, 2400], deadline: 3_000, reason: 'after 3000ms' },
])('bounds adaptive execution at $deadline ms', async ({ checkpoints, deadline, reason }) => {
  jest.useFakeTimers();
  const cancel = jest.fn();
  const onFailure = jest.fn();
  const scheduler = new Scheduler(
    { enabled: true, cron: '0 0 1 1 *', timeout: 3_000, progressTimeoutMs: 1_000 },
    undefined, { beginRun: () => 0, endRun: () => 0, requestCancel: cancel },
    'fixture', undefined, onFailure,
  );
  let reportProgress: (() => void) | undefined;
  let rejectJob!: (error: Error) => void;
  cancel.mockImplementation(() => rejectJob(new Error('late abort failure')));
  scheduler.init((options) => new Promise<void>((_resolve, reject) => {
    reportProgress = options?.reportProgress;
    rejectJob = reject;
  }));
  try {
    scheduler.runNow();
    await jest.advanceTimersByTimeAsync(0);
    let elapsed = 0;
    for (const checkpoint of checkpoints) {
      await jest.advanceTimersByTimeAsync(checkpoint - elapsed);
      expect(cancel).not.toHaveBeenCalled();
      reportProgress?.();
      elapsed = checkpoint;
    }
    await jest.advanceTimersByTimeAsync(deadline - elapsed - 1);
    expect(cancel).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      status: 'timeout', errorMessage: expect.stringContaining(reason),
    }));
  } finally {
    scheduler.stop();
    jest.useRealTimers();
  }
});
