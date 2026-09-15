import { MultiScheduleManager } from '../../scheduler/MultiScheduleManager';
import { resolveSchedules, selectScheduleTargets } from '../../scheduler/schedules';
import { StandaloneConfig } from '../../config';
import { Database } from '../../storage/Database';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeConfig(overrides: Partial<StandaloneConfig> = {}): StandaloneConfig {
  return {
    pixiv: {
      clientId: 'client',
      clientSecret: 'secret',
      deviceToken: 'device',
      refreshToken: 'refresh-token',
      userAgent: 'agent',
    },
    targets: [
      { id: 'bot1-illust', type: 'illustration', mode: 'ranking' },
      { id: 'bot2-novel', type: 'novel', mode: 'ranking' },
    ],
    scheduler: { enabled: false, cron: '0 3 * * *' },
    schedules: [
      { id: 'bot1', enabled: true, cron: '0 1 * * *', targetIds: ['bot1-illust'] },
      { id: 'bot2', enabled: true, cron: '15 1 * * *', targetIds: ['bot2-novel'] },
    ],
    schedulerRuntime: { watchConfig: false, queueLimit: 2 },
    ...overrides,
  };
}

describe('multi schedule configuration', () => {
  it('keeps legacy scheduler configurations compatible', () => {
    const config = makeConfig({ schedules: undefined, scheduler: { enabled: true, cron: '0 3 * * *' } });

    expect(resolveSchedules(config)).toEqual([
      expect.objectContaining({ id: 'default', enabled: true, cron: '0 3 * * *' }),
    ]);
  });

  it('keeps execution counters isolated by schedule id', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pixivflow-schedules-'));
    const database = new Database(join(directory, 'test.db'));
    database.migrate();
    const now = new Date();

    database.logSchedulerExecution(1, 'failed', now, now, 10, 'failed', 0, 'bot1');
    database.logSchedulerExecution(1, 'success', now, now, 10, null, 1, 'bot2');

    expect(database.getSchedulerStats('bot1').failedExecutions).toBe(1);
    expect(database.getSchedulerStats('bot2').successfulExecutions).toBe(1);
    expect(database.getConsecutiveFailures('bot1')).toBe(1);
    expect(database.getConsecutiveFailures('bot2')).toBe(0);
    expect(database.getNextExecutionNumber('bot1')).toBe(2);

    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('selects only targets assigned to a plan', () => {
    const config = makeConfig();

    expect(selectScheduleTargets(config.targets, config.schedules![0]).map(target => target.id))
      .toEqual(['bot1-illust']);
  });

  it('replaces the complete schedule table and keeps it on a rejected reload', () => {
    let nextConfig = makeConfig();
    const manager = new MultiScheduleManager({
      configPath: '/tmp/not-watched.json',
      loadConfig: () => nextConfig,
      execute: jest.fn(async () => undefined),
    });

    expect(manager.start(nextConfig)).toEqual({
      ok: true,
      generation: 1,
      schedules: ['bot1', 'bot2'],
    });

    nextConfig = makeConfig({
      schedules: [{ id: 'bot1', enabled: true, cron: '30 2 * * *', targetIds: ['bot1-illust'] }],
    });
    expect(manager.reload()).toEqual({
      ok: true,
      generation: 2,
      schedules: ['bot1'],
    });

    const broken = new MultiScheduleManager({
      configPath: '/tmp/not-watched.json',
      loadConfig: () => { throw new Error('invalid config'); },
      execute: jest.fn(async () => undefined),
    });
    broken.start(nextConfig);
    expect(broken.reload()).toEqual(expect.objectContaining({
      ok: false,
      generation: 1,
      schedules: ['bot1'],
      error: 'invalid config',
    }));

    manager.stop();
    broken.stop();
  });

  it('applies ONE resource capacity to every schedule sharing the same account (§resource-governance)', async () => {
    const config = makeConfig({
      pixiv: { ...makeConfig().pixiv, accountId: 'default' },
      schedulerRuntime: {
        watchConfig: false,
        queueLimit: 8,
        resourceGovernance: { pixivAccounts: { default: { maxConcurrency: 1 } } },
      },
    });
    const gate: Array<() => void> = [];
    const started: string[] = [];
    const execute = jest.fn(async (_cfg: StandaloneConfig, schedule: { id: string }) => {
      started.push(schedule.id);
      await new Promise<void>((resolve) => gate.push(resolve));
    });
    const manager = new MultiScheduleManager({
      configPath: '/tmp/not-watched.json',
      loadConfig: () => config,
      execute,
    });
    manager.start(config);

    // bot1 and bot2 fire "at the same time"; they are different schedules but
    // consume the SAME Pixiv account, so capacity 1 must serialize them.
    expect(manager.triggerSchedule('bot1', { triggerSource: 'http' })).toBe(true);
    expect(manager.triggerSchedule('bot2', { triggerSource: 'http' })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started).toEqual(['bot1']);
    expect(manager.waitingWorkCount()).toBe(1);

    gate[0]();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toEqual(['bot1', 'bot2']);
    expect(manager.waitingWorkCount()).toBe(0);

    gate[1]();
    await new Promise((resolve) => setTimeout(resolve, 20));
    manager.stop();
  });
});
