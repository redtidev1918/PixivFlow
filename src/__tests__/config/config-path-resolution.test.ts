/**
 * Configuration path resolution contract.
 *
 * Regression tests for `--config` propagation: the CLI resolves the effective
 * configuration file once, publishes it through `setActiveConfigPath()`, and
 * every consumer (CLI commands, WebUI handlers, scheduler runtime) must read
 * that same file. An explicitly requested file must never be replaced by a
 * silently discovered one.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { getConfigPath, loadConfig } from '../../config/loader';
import {
  setActiveConfigPath,
  clearActiveConfigPath,
  getActiveConfigPath,
  isActiveConfigPathExplicit,
} from '../../config/active-config';
import { ConfigError } from '../../utils/errors';
import { listRecentSlots } from '../../webui/routes/handlers/scheduler-handlers';

const originalEnv = process.env.PIXIV_DOWNLOADER_CONFIG;

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeConfig(dir: string, name: string, overrides: Record<string, unknown> = {}): string {
  const configPath = join(dir, name);
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify({
      pixiv: { refreshToken: 'FAKE_NOT_A_REAL_TOKEN_0123456789abcdef' },
      storage: {
        databasePath: join(dir, 'data', 'pixiv-downloader.db'),
        downloadDirectory: join(dir, 'downloads'),
      },
      targets: [],
      ...overrides,
    }),
    'utf-8'
  );
  return configPath;
}

describe('configuration path resolution', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    clearActiveConfigPath();
    delete process.env.PIXIV_DOWNLOADER_CONFIG;
  });

  afterEach(() => {
    clearActiveConfigPath();
    if (originalEnv === undefined) {
      delete process.env.PIXIV_DOWNLOADER_CONFIG;
    } else {
      process.env.PIXIV_DOWNLOADER_CONFIG = originalEnv;
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prefers an explicit path over every other source', () => {
    const dir = makeTempDir('pixivflow-config-priority-');
    tempDirs.push(dir);
    const envConfig = writeConfig(dir, 'env.json');
    const explicitConfig = writeConfig(dir, 'explicit.json');
    setActiveConfigPath(writeConfig(dir, 'session.json'), true);
    process.env.PIXIV_DOWNLOADER_CONFIG = envConfig;

    expect(getConfigPath(explicitConfig)).toBe(resolve(explicitConfig));
  });

  it('keeps a resolved CLI path active when the environment points elsewhere', () => {
    const dir = makeTempDir('pixivflow-config-env-');
    tempDirs.push(dir);
    const envConfig = writeConfig(dir, 'env.json');
    const sessionConfig = writeConfig(dir, 'session.json');
    setActiveConfigPath(sessionConfig, true);
    process.env.PIXIV_DOWNLOADER_CONFIG = envConfig;

    expect(getConfigPath()).toBe(resolve(sessionConfig));
  });

  it('falls back to the process active path so every consumer shares one config', () => {
    const dir = makeTempDir('pixivflow-config-session-');
    tempDirs.push(dir);
    const sessionConfig = writeConfig(dir, 'session.json');
    setActiveConfigPath(sessionConfig, false);

    expect(getActiveConfigPath()).toBe(sessionConfig);
    expect(isActiveConfigPathExplicit()).toBe(false);
    expect(getConfigPath()).toBe(resolve(sessionConfig));
  });

  it('resolves relative and space-containing paths consistently', () => {
    const dir = makeTempDir('pixivflow config spaces ');
    tempDirs.push(dir);
    const spaced = writeConfig(dir, 'my config.json');

    expect(getConfigPath(spaced)).toBe(resolve(spaced));
    expect(getConfigPath('config/relative.json')).toBe(resolve('config/relative.json'));
    // Windows drive-absolute paths survive round-tripping
    expect(getConfigPath(resolve(spaced))).toBe(resolve(spaced));
  });

  it('never silently falls back to another file when the explicit file is missing', () => {
    const dir = makeTempDir('pixivflow-config-missing-');
    tempDirs.push(dir);
    const missing = join(dir, 'does-not-exist.json');

    expect(() => loadConfig(missing)).toThrow(ConfigError);
    expect(() => loadConfig(missing)).toThrow(/Configuration file not found/);
    expect(() => loadConfig(missing)).toThrow(/will not\s+fall back to another configuration file/);
    expect(existsSync(missing)).toBe(false);
  });

  it('treats PIXIV_DOWNLOADER_CONFIG as an explicit request that must exist', () => {
    const dir = makeTempDir('pixivflow-config-env-missing-');
    tempDirs.push(dir);
    process.env.PIXIV_DOWNLOADER_CONFIG = join(dir, 'missing.json');

    expect(() => loadConfig()).toThrow(/Configuration file not found/);
  });

  it('treats the process active path as explicit when the CLI flagged it', () => {
    const dir = makeTempDir('pixivflow-config-session-missing-');
    tempDirs.push(dir);
    setActiveConfigPath(join(dir, 'missing.json'), true);

    expect(() => loadConfig()).toThrow(/Configuration file not found/);
    expect(() => loadConfig(join(dir, 'missing.json'), false, true, true)).toThrow(ConfigError);
  });

  it('loads the active configuration file for WebUI API handlers', async () => {
    const dir = makeTempDir('pixivflow-webui-config-');
    tempDirs.push(dir);
    const configPath = writeConfig(dir, 'webui.json');
    // The CLI publishes the resolved --config path before dispatching a command.
    setActiveConfigPath(configPath, true);
    process.env.PIXIV_DOWNLOADER_CONFIG = join(dir, 'unrelated-missing.json');

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

    // The API must answer from the session config (empty database => empty
    // slot list) instead of failing on an unrelated auto-detected config file.
    expect(status).toBe(0);
    expect(payload).toEqual({ data: { slots: [], scheduler: { enabled: false, configuredCount: 0 } } });
  });

  it('reports a WebUI API error when the active explicit config disappears', async () => {
    const dir = makeTempDir('pixivflow-webui-config-gone-');
    tempDirs.push(dir);
    setActiveConfigPath(join(dir, 'gone.json'), true);

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

    expect(status).toBe(500);
    expect(payload.errorCode).toBeDefined();
    expect(JSON.stringify(payload)).not.toMatch(/refreshToken|token|secret/i);
  });
});
