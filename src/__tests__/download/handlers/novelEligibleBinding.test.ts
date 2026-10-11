import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from '../../../storage/Database';
import { SlotCoordinator } from '../../../scheduler/SlotCoordinator';
import { NovelDownloader } from '../../../download/NovelDownloader';
import { NovelTargetHandler } from '../../../download/handlers/NovelTargetHandler';
import { TargetConfig, ScheduleConfig, StandaloneConfig } from '../../../config';
import { detectLanguage } from '../../../utils/language-detection';

jest.mock('../../../logger');
jest.mock('../../../utils/language-detection');
jest.mock('../../../utils/directory-info', () => ({ displayDownloadPath: jest.fn() }));

it('a restart during language detection leaves the cell unbound; only eligible work is persisted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'novel-eligible-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  const target = { id: 'novel', type: 'novel', mode: 'search', tag: 'topic', limit: 1, languageFilter: 'chinese' } as TargetConfig;
  const schedule = { id: 'daily', cron: '0 10 * * *', timezone: 'Asia/Shanghai', enabled: true } as ScheduleConfig;
  const coordinator = new SlotCoordinator(db);
  const slot = coordinator.resolveOccurrence(schedule, { schedulerRuntime: { trigger: { graceMinutes: 120 } } } as StandaloneConfig, 'http', new Date('2026-10-11T02:00:30Z')).context!;
  coordinator.prepare(slot, schedule, [target]);
  const execution = coordinator.executionContextsFor(slot.slotId, coordinator.pendingTargets(slot.slotId, [target])).get('novel')!;
  const novels = [1, 2].map(id => ({ id, title: `Novel ${id}`, user: { id: '42', name: 'Author' }, create_date: '2026-10-11T00:00:00Z' }));
  const client = {
    getNovelDetailWithTags: jest.fn(async (id: number) => ({ novel: novels[id - 1], tags: [] })),
    getNovelText: jest.fn(async (id: number) => ({ novel_text: `body-${id}` })),
  };
  const files = {
    sanitizeFileName: jest.fn((name: string) => name),
    saveText: jest.fn(async () => {
      expect(db.slots.getCell(slot.slotId, 'novel')!.workId).toBe('2');
      return join(dir, '2.txt');
    }),
    saveMetadata: jest.fn(async () => join(dir, '2.json')),
  };
  const database = { insertDownload: jest.fn(), logExecution: jest.fn() };
  const downloader = new NovelDownloader(client as any, database as any, files as any);
  const handler = new NovelTargetHandler(client as any, database as any, {} as any, {} as any, downloader);
  (handler as any).execution = execution;
  (detectLanguage as jest.Mock).mockImplementation(async (text: string) => {
    // This durable read is the exact crash boundary that caused the incident.
    const resumed = new SlotCoordinator(db).pendingTargets(slot.slotId, [target]);
    expect(resumed[0].cell!.workId).toBeNull();
    return text.includes('body-1')
      ? { name: 'Japanese', code: 'jpn', isChinese: false }
      : { name: 'Chinese', code: 'cmn', isChinese: true };
  });
  try {
    const first = await (handler as any).downloadAndDeliver(novels[0], 'topic', target);
    expect(first).toMatchObject({ kind: 'skipped', skip: { code: 'filtered' } });
    expect(db.slots.getCell(slot.slotId, 'novel')!.workId).toBeNull();
    expect(files.saveText).not.toHaveBeenCalled();
    const second = await (handler as any).downloadAndDeliver(novels[1], 'topic', target);
    expect(second).toMatchObject({ kind: 'selected', workId: '2' });
    expect(db.slots.getCell(slot.slotId, 'novel')!.workId).toBe('2');
    expect(database.insertDownload).toHaveBeenCalledTimes(1);
    expect(files.saveText).toHaveBeenCalledTimes(1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
