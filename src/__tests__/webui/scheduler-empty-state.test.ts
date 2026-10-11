/**
 * Scheduler read API contract for the empty state.
 *
 * The WebUI must be able to tell apart "no schedule configured yet",
 * "configured but nothing ran yet" and a real failure. The API therefore
 * reports a read-only `scheduler` summary next to the slot list.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setActiveConfigPath, clearActiveConfigPath } from '../../config/active-config';
import { scheduleSummary, listRecentSlots } from '../../webui/routes/handlers/scheduler-handlers';

function config(overrides: Record<string, unknown> = {}): any {
  return { scheduler: { enabled: false, cron: '0 3 * * *' }, ...overrides };
}

describe('scheduler empty-state contract', () => {
  const tempDirs: string[] = [];
  const originalEnv = process.env.PIXIV_DOWNLOADER_CONFIG;

  beforeEach(() => { delete process.env.PIXIV_DOWNLOADER_CONFIG; });

  afterEach(() => {
    clearActiveConfigPath();
    if (originalEnv === undefined) delete process.env.PIXIV_DOWNLOADER_CONFIG;
    else process.env.PIXIV_DOWNLOADER_CONFIG = originalEnv;
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports no configured schedule for a fresh configuration', () => {
    expect(scheduleSummary(config())).toEqual({ enabled: false, configuredCount: 0 });
  });

  it('reports an enabled legacy schedule', () => {
    expect(scheduleSummary(config({ scheduler: { enabled: true, cron: '0 3 * * *' } }))).toEqual({
      enabled: true,
      configuredCount: 1,
    });
  });

  it('counts independent schedules and ignores the legacy cron', () => {
    const summary = scheduleSummary(
      config({
        scheduler: { enabled: true, cron: '0 3 * * *' },
        schedules: [
          { id: 'morning', name: 'Morning', enabled: true, cron: '0 7 * * *' },
          { id: 'night', name: 'Night', enabled: false, cron: '0 23 * * *' },
        ],
      })
    );

    expect(summary).toEqual({ enabled: true, configuredCount: 2 });
  });

  it('treats a purely disabled schedule list as not configured', () => {
    const summary = scheduleSummary(
      config({
        schedules: [{ id: 'night', enabled: false, cron: '0 23 * * *' }],
      })
    );

    expect(summary).toEqual({ enabled: false, configuredCount: 1 });
  });

  it('returns the summary with an empty, healthy slot list', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-scheduler-empty-'));
    tempDirs.push(dir);
    mkdirSync(join(dir, 'data'), { recursive: true });
    const configPath = join(dir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        pixiv: { refreshToken: 'YOUR_REFRESH_TOKEN' },
        storage: {
          databasePath: join(dir, 'data', 'pixiv-downloader.db'),
          downloadDirectory: join(dir, 'downloads'),
        },
        scheduler: { enabled: false, cron: '0 3 * * *' },
        targets: [],
      })
    );
    setActiveConfigPath(configPath, true);

    let status = 0;
    let payload: any = null;
    const res: any = {
      json: (value: any) => {
        payload = value;
      },
      status: (code: number) => {
        status = code;
        return res;
      },
    };

    await listRecentSlots({ query: {} } as any, res);

    expect(status).toBe(0);
    expect(payload.data.slots).toEqual([]);
    expect(payload.data.scheduler).toEqual({ enabled: false, configuredCount: 0 });
    expect(JSON.stringify(payload)).not.toMatch(/refreshToken|token|secret/i);
  });

  it('reports a corrupt database as an error, not an empty result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixivflow-scheduler-corrupt-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'broken.db');
    writeFileSync(databasePath, 'not a sqlite database');
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ storage: { databasePath }, targets: [] }));
    setActiveConfigPath(configPath, true);
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await listRecentSlots({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toHaveProperty('errorCode');
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('data');
  });
});
