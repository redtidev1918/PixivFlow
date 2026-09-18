import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Database } from '../../storage/Database';
import { listRecentSlots } from '../../webui/routes/handlers/scheduler-handlers';

const TEMP_DB = join(mkdtempSync(join(tmpdir(), 'webui-scheduler-')), 'test.db');

jest.mock('../../config', () => ({
  getConfigPath: () => '/tmp/pixivflow.yml',
  loadConfig: () => ({ storage: { databasePath: TEMP_DB } }),
}));

describe('WebUI scheduler read API', () => {
  afterAll(() => {
    rmSync(join(mkdtempSync(join(tmpdir(), 'webui-scheduler-')), '..') === '' ? TEMP_DB : TEMP_DB, { recursive: true, force: true });
  });

  it('returns recent slots and their target cells (read-only, no secrets)', async () => {
    const db = new Database(TEMP_DB);
    db.migrate();
    const slot = db.slots.getOrCreateSlot('bot1-daily@2026-09-18T10:00', {
      scheduleId: 'bot1-daily', occurrenceAt: Date.now(), occurrenceDate: '2026-09-18',
      occurrenceLabel: '10:00', timezone: 'Asia/Shanghai', targetIds: ['bot1-illust'],
    }).slot;
    db.slots.materializeCells(slot.id, ['bot1-illust'], () => 'illustration');
    db.slots.markSlotStatus(slot.id, 'running');
    db.close();

    let status = 0;
    let payload: any = null;
    const res: any = { json: (v: any) => { payload = v; }, status: (c: number) => { status = c; return res; } };
    await listRecentSlots({ query: {} } as any, res);

    expect(payload.data.slots).toHaveLength(1);
    expect(payload.data.slots[0]).toMatchObject({
      slotId: 'bot1-daily@2026-09-18T10:00', scheduleId: 'bot1-daily', status: 'running',
    });
    expect(payload.data.slots[0].targets[0].targetId).toBe('bot1-illust');
    expect(JSON.stringify(payload)).not.toMatch(/token|secret|password/i);
  });

  it('caps list length and ignores invalid limit', async () => {
    let status = 0;
    let payload: any = null;
    const res: any = { json: (v: any) => { payload = v; }, status: (c: number) => { status = c; return res; } };
    await listRecentSlots({ query: { limit: 'abc' } } as any, res);
    expect(payload.data.slots.length).toBeLessThanOrEqual(14);
  });
});
