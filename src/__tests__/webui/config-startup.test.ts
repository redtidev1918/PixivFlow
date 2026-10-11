import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startWebUI, WebUIServer } from '../../webui/server/server';
import { getConfigPath } from '../../config';
import { clearActiveConfigPath } from '../../config/active-config';
import { listRecentSlots } from '../../webui/routes/handlers/scheduler-handlers';

describe('WebUI configuration startup', () => {
  let dir: string;
  const originalEnv = process.env.PIXIV_DOWNLOADER_CONFIG;
  let originalSigint: NodeJS.SignalsListener[];
  let originalSigterm: NodeJS.SignalsListener[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pixivflow web config '));
    clearActiveConfigPath();
    delete process.env.PIXIV_DOWNLOADER_CONFIG;
    originalSigint = process.listeners('SIGINT') as NodeJS.SignalsListener[];
    originalSigterm = process.listeners('SIGTERM') as NodeJS.SignalsListener[];
    // Exercise real config/database initialization without a listening socket.
    jest.spyOn(WebUIServer.prototype, 'start').mockResolvedValue(3000);
  });

  afterEach(() => {
    for (const event of ['SIGINT', 'SIGTERM'] as const) {
      const original = event === 'SIGINT' ? originalSigint : originalSigterm;
      for (const listener of process.listeners(event)) {
        if (!original.includes(listener as NodeJS.SignalsListener)) process.off(event, listener);
      }
    }
    jest.restoreAllMocks();
    clearActiveConfigPath();
    if (originalEnv === undefined) delete process.env.PIXIV_DOWNLOADER_CONFIG;
    else process.env.PIXIV_DOWNLOADER_CONFIG = originalEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('publishes an explicit embedded-server path for subsequent API consumers', async () => {
    const configPath = join(dir, 'my config.json');
    writeFileSync(configPath, JSON.stringify({ storage: { databasePath: join(dir, 'state.db') }, targets: [] }));
    process.env.PIXIV_DOWNLOADER_CONFIG = join(dir, 'wrong.json');
    await startWebUI({ configPath });
    expect(getConfigPath()).toBe(configPath);
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await listRecentSlots({ query: {} } as any, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ data: { slots: [], scheduler: { enabled: false, configuredCount: 0 } } });
  });

  it('refuses a missing explicit file before starting the server', async () => {
    await expect(startWebUI({ configPath: join(dir, 'missing.json') })).rejects.toThrow(/Configuration file not found/);
    expect(WebUIServer.prototype.start).not.toHaveBeenCalled();
  });

  it('refuses malformed JSON before starting the server', async () => {
    const configPath = join(dir, 'broken.json');
    writeFileSync(configPath, '{ broken');
    await expect(startWebUI({ configPath })).rejects.toThrow(/Invalid JSON/);
    expect(WebUIServer.prototype.start).not.toHaveBeenCalled();
  });
});
