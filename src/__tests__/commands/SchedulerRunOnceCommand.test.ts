/**
 * Tests for SchedulerRunOnceCommand
 */

import { SchedulerRunOnceCommand } from '../../commands/SchedulerRunOnceCommand';
import { CommandRegistry } from '../../commands/CommandRegistry';
import { registerAllCommands } from '../../commands';
import { createSchedulerRuntime } from '../../commands/scheduler-runtime';
import { resolveSchedules } from '../../scheduler/schedules';
import { CommandArgs, CommandContext } from '../../commands/types';
import { logger } from '../../logger';

jest.mock('../../commands/scheduler-runtime', () => ({
  ...jest.requireActual('../../commands/scheduler-runtime'),
  createSchedulerRuntime: jest.fn(),
}));
jest.mock('../../scheduler/schedules');

const mockedCreateRuntime = createSchedulerRuntime as jest.MockedFunction<typeof createSchedulerRuntime>;
const mockedResolveSchedules = resolveSchedules as jest.MockedFunction<typeof resolveSchedules>;

describe('SchedulerRunOnceCommand', () => {
  const context = { config: {}, logger, configPath: '/cfg.json' } as unknown as CommandContext;
  const args: CommandArgs = { options: {}, positional: [] };
  const config = { schedulerRuntime: {} } as any;

  const plan = (id: string, enabled: boolean, targetIds: string[] = ['t1']) => ({ id, cron: '0 10 * * *', enabled, targetIds } as any);

  let command: SchedulerRunOnceCommand;
  let runJob: jest.Mock;
  let close: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    runJob = jest.fn().mockResolvedValue(undefined);
    close = jest.fn();
    mockedCreateRuntime.mockResolvedValue({
      config,
      runJob,
      close,
      cancelActive: jest.fn(),
    } as any);
    command = new SchedulerRunOnceCommand();
  });

  it('runs every enabled schedule once, then closes and succeeds', async () => {
    mockedResolveSchedules.mockReturnValue([plan('a', true), plan('b', true), plan('c', false)]);

    const result = await command.execute(context, args);

    expect(mockedCreateRuntime).toHaveBeenCalledWith(undefined);
    expect(runJob).toHaveBeenCalledTimes(2);
    expect(runJob).toHaveBeenNthCalledWith(1, config, expect.objectContaining({ id: 'a' }), undefined);
    expect(runJob).toHaveBeenNthCalledWith(2, config, expect.objectContaining({ id: 'b' }), undefined);
    expect(close).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('runs only the schedule containing --target', async () => {
    mockedResolveSchedules.mockReturnValue([
      plan('a', true, ['t1']),
      plan('b', true, ['t2']),
      plan('c', true, ['t1']),
    ]);
    const targetArgs: CommandArgs = { options: { target: 't2' }, positional: [] };

    const result = await command.execute(context, targetArgs);

    expect(runJob).toHaveBeenCalledTimes(1);
    expect(runJob).toHaveBeenCalledWith(config, expect.objectContaining({ id: 'b' }), 't2');
    expect(close).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('fails when --target matches no schedule', async () => {
    mockedResolveSchedules.mockReturnValue([plan('a', true, ['t1'])]);
    const targetArgs: CommandArgs = { options: { target: 'missing' }, positional: [] };

    const result = await command.execute(context, targetArgs);

    expect(runJob).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });

  it('succeeds without running anything when no schedule is enabled', async () => {
    mockedResolveSchedules.mockReturnValue([plan('a', false)]);

    const result = await command.execute(context, args);

    expect(runJob).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('reports failure but still closes when a plan fails', async () => {
    mockedResolveSchedules.mockReturnValue([plan('a', true)]);
    runJob.mockRejectedValue(new Error('download boom'));

    const result = await command.execute(context, args);

    expect(close).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('download boom');
  });

  it('is registered under run-once with refetch/now aliases', () => {
    const registry = new CommandRegistry();
    registerAllCommands(registry);
    for (const name of ['run-once', 'refetch', 'now']) {
      expect(registry.find(name)?.name).toBe('run-once');
    }
  });
});
