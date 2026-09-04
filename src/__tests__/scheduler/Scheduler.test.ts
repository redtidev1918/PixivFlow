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
