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
});
