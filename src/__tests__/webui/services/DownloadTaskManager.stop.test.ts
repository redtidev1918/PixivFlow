/**
 * Regression tests for WebUI task-stop semantics:
 *
 * - stopTask must REAL-cancel the running DownloadManager (previously it
 *   aborted an unused AbortController and left the download alive)
 * - final state must be 'stopped', history updated, DB closed exactly once
 * - realtime subscribers must receive change notifications
 */

import { OperationCancelledError } from '../../../utils/errors';

const calls = {
  cancelReasons: [] as string[],
  history: [] as Array<Record<string, unknown>>,
  closes: 0,
};

let rejectRun: ((e: Error) => void) | null = null;

jest.mock('../../../download/DownloadManager', () => ({
  DownloadManager: jest.fn().mockImplementation(() => ({
    initialise: jest.fn().mockResolvedValue(undefined),
    setProgressCallback: jest.fn(),
    cancel: jest.fn((reason: string) => {
      calls.cancelReasons.push(reason);
      rejectRun?.(new OperationCancelledError(`\u4e0b\u8f7d\u5df2\u53d6\u6d88: ${reason}`));
    }),
    runAllTargets: jest.fn(
      () =>
        new Promise<void>((_res, rej) => {
          rejectRun = rej;
        })
      ),
  })),
}));

jest.mock('../../../pixiv/AuthClient', () => ({ PixivAuth: class {} }));
jest.mock('../../../pixiv/PixivClient', () => ({ PixivClient: class {} }));
jest.mock('../../../download/FileService', () => ({ FileService: class {} }));

jest.mock('../../../storage/Database', () => ({
  Database: jest.fn().mockImplementation(() => ({
    migrate: jest.fn(),
    close: jest.fn(() => {
      calls.closes += 1;
    }),
    saveTaskHistory: jest.fn((taskId: string, data: Record<string, unknown>) => {
      calls.history.push({ taskId, ...data });
    }),
  })),
}));

jest.mock('../../../config', () => ({
  loadConfig: jest.fn(() => ({
    logLevel: 'error',
    pixiv: {},
    network: {},
    storage: { databasePath: '/tmp/fake.db' },
    scheduler: {},
    targets: [{ type: 'illustration', tag: 'test' }],
  })),
  getConfigPath: jest.fn(() => '/tmp/fake.config.json'),
}));

import { downloadTaskManager } from '../../../webui/services/DownloadTaskManager';

describe('DownloadTaskManager stop semantics', () => {
  beforeEach(() => {
    calls.cancelReasons.length = 0;
    calls.history.length = 0;
    calls.closes = 0;
    rejectRun = null;
    downloadTaskManager.clearAllForTests?.();
  });

  it('real-cancels a running task and lands on stopped state', async () => {
    const changes: number[] = [];
    const unsub = downloadTaskManager.subscribe(() => changes.push(Date.now()));

    const taskId = 'task_stop_test';
    await downloadTaskManager.startTask(taskId);
    expect(downloadTaskManager.hasActiveTask()).toBe(true);

    await downloadTaskManager.stopTask(taskId);

    // give the drained runner a tick plus the 150ms notify debounce to flush
    await new Promise((r) => setTimeout(r, 260));

    expect(calls.cancelReasons).toContain('stopped by user');

    const status = downloadTaskManager.getTaskStatus(taskId);
    expect(status?.status).toBe('stopped');
    expect(status?.endTime).toBeTruthy();

    // runner finally-block must have closed DB exactly once and released slot
    expect(calls.closes).toBe(1);
    expect(downloadTaskManager.hasActiveTask()).toBe(false);

    // history recorded both phases
    const statuses = calls.history.map((h) => h.status);
    expect(statuses).toContain('running');
    expect(statuses).toContain('stopped');

    // realtime subscribers were notified during lifecycle
    expect(changes.length).toBeGreaterThan(0);

    unsub();
  });

  it('rejects stopping when no active task matches', async () => {
    await expect(downloadTaskManager.stopTask('task_missing')).rejects.toThrow(/not found/i);
  });
});
