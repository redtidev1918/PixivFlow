/**
 * Catch-up (missed cron fire) and watchdog tests for MultiScheduleManager.
 */

import { MultiScheduleManager } from '../../scheduler/MultiScheduleManager';
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
    targets: [{ id: 'bot1-illust', type: 'illustration', mode: 'ranking' }],
    scheduler: { enabled: false, cron: '0 3 * * *' },
    schedules: [
      { id: 'bot1', enabled: true, cron: '0 10,18 * * *', targetIds: ['bot1-illust'] },
    ],
    schedulerRuntime: { watchConfig: false, queueLimit: 2 },
    ...overrides,
  };
}

function withDatabase<T>(fn: (directory: string, database: Database) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), 'pixivflow-catchup-'));
  const database = new Database(join(directory, 'test.db'));
  database.migrate();
  return fn(directory, database).finally(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
}

/** Poll until `predicate` is true (execute is fire-and-forget inside runNow). */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

describe('missed-cron catch-up at daemon start', () => {
  it('runs a schedule once when its last execution predates a cron fire', async () => {
    await withDatabase(async (_dir, database) => {
      // Last run ended 2020; `0 10,18 * * *` (Asia/Shanghai) has fired many
      // times since, so startup must catch up exactly once for bot1.
      const ancient = new Date('2020-01-01T00:00:00Z');
      database.logSchedulerExecution(1, 'success', ancient, ancient, 10, null, 1, 'bot1');

      const execute = jest.fn(
        async (_config: StandaloneConfig, schedule: { id?: string }) => undefined
      );
      const manager = new MultiScheduleManager({
        configPath: '/tmp/not-watched.json',
        loadConfig: () => makeConfig(),
        execute,
        database,
      });
      manager.start(makeConfig());
      try {
        const caughtUp = await waitFor(() =>
          execute.mock.calls.some(([, schedule]) => schedule.id === 'bot1')
        );
        expect(caughtUp).toBe(true);
      } finally {
        manager.stop();
      }
    });
  });

  it('does not catch up when the schedule ran recently', async () => {
    await withDatabase(async (_dir, database) => {
      const now = new Date();
      database.logSchedulerExecution(1, 'success', now, now, 10, null, 1, 'bot1');

      const execute = jest.fn(async () => undefined);
      const manager = new MultiScheduleManager({
        configPath: '/tmp/not-watched.json',
        loadConfig: () => makeConfig(),
        execute,
        database,
      });
      manager.start(makeConfig());
      manager.stop();

      // Allow any (incorrect) background run to surface.
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(execute).not.toHaveBeenCalled();
    });
  });

  it('does not catch up a schedule that has never run', async () => {
    await withDatabase(async (_dir, database) => {
      const execute = jest.fn(async () => undefined);
      const manager = new MultiScheduleManager({
        configPath: '/tmp/not-watched.json',
        loadConfig: () => makeConfig(),
        execute,
        database,
      });
      manager.start(makeConfig());
      manager.stop();

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(execute).not.toHaveBeenCalled();
    });
  });
});
