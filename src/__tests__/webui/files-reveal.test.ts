/**
 * "Show in the system file manager" (POST /api/files/reveal).
 *
 * Pinned here:
 *  - the handler is confined to the configured download directories: a
 *    `../` path, an absolute path elsewhere, or a sibling directory whose name
 *    merely starts with the same characters is refused before anything opens;
 *  - a file reveals its parent directory, a directory reveals itself;
 *  - a host with no file manager (a container, a headless server) is answered
 *    with `FILE_REVEAL_UNSUPPORTED` and a 200 — that is a normal deployment,
 *    and the UI answers it by offering the path to copy, not by reporting an
 *    error the user cannot act on;
 *  - `resolveOnly` never opens anything, which is how the desktop host gets a
 *    path to open locally;
 *  - the opener is never spawned on a headless Linux host.
 *
 * No test in this file spawns a real file manager: the reveal function is
 * injected, except in the one case that asserts the platform guard refuses
 * before spawning.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The fixture directory must exist before the (hoisted) config mock runs, so a
// single module-level root is created here and reused below.
const DIR = mkdtempSync(join(tmpdir(), 'files-reveal-'));
const ILLUSTRATIONS = join(DIR, 'downloads', 'illustrations');
const NOVELS = join(DIR, 'downloads', 'novels');
const OUTSIDE = join(DIR, 'downloads-out'); // sibling whose name starts with "downloads"
const FILE = join(ILLUSTRATIONS, '116743346_明日香_1.jpg');

jest.mock('../../config', () => ({
  getConfigPath: () => '/tmp/pixivflow.yml',
}));

// The handler reads the raw config, so it still resolves a download directory
// when `loadConfig` would refuse the file (no Pixiv token yet on a fresh
// install).
jest.mock('../../webui/routes/config-utils', () => ({
  readConfigRaw: () => ({
    storage: {
      illustrationDirectory: join(DIR, 'downloads', 'illustrations'),
      novelDirectory: join(DIR, 'downloads', 'novels'),
    },
  }),
}));

import {
  directoryToReveal,
  resolveWithinBaseDir,
  isFileManagerAvailable,
  revealInFileManager,
} from '../../webui/utils/file-manager';
import {
  createRevealHandler,
  downloadDirectoryFor,
} from '../../webui/routes/handlers/files-reveal-handlers';
import { ErrorCode } from '../../webui/utils/error-codes';

mkdirSync(ILLUSTRATIONS, { recursive: true });
mkdirSync(NOVELS, { recursive: true });
mkdirSync(OUTSIDE, { recursive: true });
writeFileSync(FILE, 'jpeg-bytes');
writeFileSync(join(OUTSIDE, 'elsewhere.jpg'), 'jpeg-bytes');

const revealed: string[] = [];

function responder() {
  const state: { status: number; payload: any } = { status: 200, payload: null };
  const res: any = {
    json: (v: any) => {
      state.payload = v;
      return res;
    },
    status: (c: number) => {
      state.status = c;
      return res;
    },
  };
  return { res, state };
}

const request = (body: unknown) => ({ body }) as any;

const handler = createRevealHandler({
  reveal: (dirPath: string) => {
    revealed.push(dirPath);
    return { ok: true, path: dirPath };
  },
});

beforeEach(() => {
  revealed.length = 0;
});

afterAll(() => {
  rmSync(DIR, { recursive: true, force: true });
});

describe('resolveWithinBaseDir', () => {
  it('accepts a file inside the configured directory, absolute or relative', () => {
    expect(resolveWithinBaseDir(FILE, [ILLUSTRATIONS])).toBe(FILE);
    expect(resolveWithinBaseDir('116743346_明日香_1.jpg', [ILLUSTRATIONS])).toBe(FILE);
  });

  it('accepts the configured directory itself', () => {
    expect(resolveWithinBaseDir(ILLUSTRATIONS, [ILLUSTRATIONS])).toBe(ILLUSTRATIONS);
  });

  it('refuses a path that escapes every configured directory', () => {
    expect(resolveWithinBaseDir('../novels/anything.jpg', [ILLUSTRATIONS])).toBeNull();
    expect(resolveWithinBaseDir(join(OUTSIDE, 'elsewhere.jpg'), [ILLUSTRATIONS])).toBeNull();
    expect(resolveWithinBaseDir('/etc/hosts', [ILLUSTRATIONS])).toBeNull();
  });

  it('refuses a sibling whose name merely starts with the same characters', () => {
    // "downloads-out" must not survive a naive string-prefix check against "downloads".
    expect(
      resolveWithinBaseDir(join(OUTSIDE, 'elsewhere.jpg'), [join(DIR, 'downloads')])
    ).toBeNull();
  });

  it('refuses a missing file and an empty base list', () => {
    expect(resolveWithinBaseDir(join(ILLUSTRATIONS, 'missing.jpg'), [ILLUSTRATIONS])).toBeNull();
    expect(resolveWithinBaseDir(FILE, [])).toBeNull();
  });
});

describe('directoryToReveal', () => {
  it('answers the parent directory for a file', () => {
    expect(directoryToReveal(FILE)).toBe(ILLUSTRATIONS);
  });

  it('answers the directory itself for a directory', () => {
    expect(directoryToReveal(ILLUSTRATIONS)).toBe(ILLUSTRATIONS);
  });

  it('answers the parent even when the target is gone', () => {
    expect(directoryToReveal(join(ILLUSTRATIONS, 'gone.jpg'))).toBe(ILLUSTRATIONS);
  });
});

describe('POST /api/files/reveal', () => {
  it('reveals the parent directory of a downloaded file', async () => {
    const { res, state } = responder();
    await handler(request({ path: FILE, type: 'illustration' }), res);

    expect(state.status).toBe(200);
    expect(state.payload.errorCode).toBe(ErrorCode.FILE_REVEAL_SUCCESS);
    expect(state.payload.path).toBe(ILLUSTRATIONS);
    expect(revealed).toEqual([ILLUSTRATIONS]);
  });

  it('accepts a relative path from the file list', async () => {
    const { res, state } = responder();
    await handler(request({ path: '116743346_明日香_1.jpg' }), res);

    expect(state.payload.path).toBe(ILLUSTRATIONS);
  });

  it('reveals the configured directory when no path is given', async () => {
    const { res, state } = responder();
    await handler(request({ type: 'novel' }), res);

    expect(state.payload.path).toBe(NOVELS);
    expect(revealed).toEqual([NOVELS]);
  });

  it('refuses a path outside the download directory', async () => {
    const { res, state } = responder();
    await handler(request({ path: '/etc/hosts', type: 'illustration' }), res);

    expect(state.status).toBe(400);
    expect(state.payload.errorCode).toBe(ErrorCode.FILE_PATH_INVALID);
    expect(revealed).toHaveLength(0);
  });

  it('reports a missing file instead of opening a directory', async () => {
    const { res, state } = responder();
    await handler(request({ path: join(ILLUSTRATIONS, 'missing.jpg') }), res);

    expect(state.status).toBe(404);
    expect(state.payload.errorCode).toBe(ErrorCode.FILE_NOT_FOUND);
    expect(revealed).toHaveLength(0);
  });

  it('resolves without opening anything when resolveOnly is set', async () => {
    const { res, state } = responder();
    await handler(request({ path: FILE, resolveOnly: true }), res);

    expect(state.payload.errorCode).toBe(ErrorCode.FILE_REVEAL_SUCCESS);
    expect(state.payload.path).toBe(ILLUSTRATIONS);
    expect(state.payload.exists).toBe(true);
    // The desktop host opens the local directory itself; the backend must not.
    expect(revealed).toHaveLength(0);
  });

  it('answers unsupported with a 200 when the host has no file manager', async () => {
    const unsupported = createRevealHandler({
      reveal: (dirPath: string) => ({ ok: false, path: dirPath, reason: 'unsupported' }),
    });
    const { res, state } = responder();
    await unsupported(request({ path: FILE }), res);

    expect(state.status).toBe(200);
    expect(state.payload.success).toBe(false);
    expect(state.payload.errorCode).toBe(ErrorCode.FILE_REVEAL_UNSUPPORTED);
    expect(state.payload.path).toBe(ILLUSTRATIONS);
  });

  it('reports a failed launch as a 500', async () => {
    const failing = createRevealHandler({
      reveal: (dirPath: string) => ({ ok: false, path: dirPath, reason: 'failed', detail: 'boom' }),
    });
    const { res, state } = responder();
    await failing(request({ path: FILE }), res);

    expect(state.status).toBe(500);
    expect(state.payload.errorCode).toBe(ErrorCode.FILE_REVEAL_FAILED);
  });
});

describe('revealInFileManager platform guard', () => {
  it('never spawns an opener on a headless Linux host', () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    const display = process.env.DISPLAY;
    const wayland = process.env.WAYLAND_DISPLAY;
    try {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      delete process.env.DISPLAY;
      delete process.env.WAYLAND_DISPLAY;

      expect(isFileManagerAvailable()).toBe(false);

      const result = revealInFileManager(ILLUSTRATIONS);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('unsupported');
      expect(result.path).toBe(ILLUSTRATIONS);
    } finally {
      if (platform) Object.defineProperty(process, 'platform', platform);
      if (display !== undefined) process.env.DISPLAY = display;
      if (wayland !== undefined) process.env.WAYLAND_DISPLAY = wayland;
    }
  });

  it('treats a desktop platform as available', () => {
    if (process.platform !== 'darwin' && process.platform !== 'win32') return;
    expect(isFileManagerAvailable()).toBe(true);
  });
});

describe('downloadDirectoryFor', () => {
  it('prefers the explicit per-type directory', () => {
    expect(
      downloadDirectoryFor('illustration', {
        downloadDirectory: '/root',
        illustrationDirectory: '/root/illustrations',
      })
    ).toBe('/root/illustrations');
  });

  it('falls back to the download root plus the type subfolder', () => {
    expect(downloadDirectoryFor('illustration', { downloadDirectory: '/root' })).toBe(
      join('/root', 'illustrations')
    );
    expect(downloadDirectoryFor('novel', { downloadDirectory: '/root' })).toBe(
      join('/root', 'novels')
    );
  });

  it('answers nothing when the config declares neither', () => {
    expect(downloadDirectoryFor('illustration', {})).toBeUndefined();
    expect(downloadDirectoryFor('novel', undefined)).toBeUndefined();
  });
});
