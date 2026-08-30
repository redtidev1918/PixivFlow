import { existsSync, mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MaintainCommand } from '../../commands/MaintainCommand';
import { Database } from '../../storage/Database';

describe('MaintainCommand cache size policy', () => {
  let root: string;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pixivflow-maintain-cache-'));
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  it('evicts the oldest complete work instead of individual pages', async () => {
    const illustrationDirectory = join(root, 'cache', 'illustrations');
    const databasePath = join(root, 'pixivflow.db');
    mkdirSync(illustrationDirectory, { recursive: true });

    const oldPages = [
      join(illustrationDirectory, '100_old_1.jpg'),
      join(illustrationDirectory, '100_old_2.jpg'),
    ];
    const newPages = [
      join(illustrationDirectory, '200_new_1.jpg'),
      join(illustrationDirectory, '200_new_2.jpg'),
    ];
    for (const file of [...oldPages, ...newPages]) {
      writeFileSync(file, Buffer.alloc(1024 * 1024));
    }
    const oldTime = new Date(Date.now() - 2 * 86400_000);
    for (const file of oldPages) utimesSync(file, oldTime, oldTime);

    const db = new Database(databasePath);
    db.migrate();
    for (const filePath of oldPages) {
      db.insertDownload({ pixivId: '100', type: 'illustration', tag: 'old', title: 'old', filePath });
    }
    for (const filePath of newPages) {
      db.insertDownload({ pixivId: '200', type: 'illustration', tag: 'new', title: 'new', filePath });
    }
    db.close();

    const command = new MaintainCommand();
    await (command as unknown as {
      cleanupCache: (context: unknown) => Promise<void>;
    }).cleanupCache({
      config: {
        storage: {
          databasePath,
          downloadDirectory: join(root, 'cache'),
          illustrationDirectory,
          cacheRetentionDays: 0,
          cacheMaxSizeMB: 3,
        },
      },
    });

    expect(oldPages.every((file) => !existsSync(file))).toBe(true);
    expect(newPages.every((file) => existsSync(file))).toBe(true);

    const verify = new Database(databasePath);
    expect(verify.hasDownloaded('100', 'illustration')).toBe(false);
    expect(verify.hasDownloaded('200', 'illustration')).toBe(true);
    verify.close();
  });
});
