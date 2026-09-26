/**
 * `GET /api/files/location` and the confinement rules behind it.
 *
 * The endpoint must answer *where* a file is and nothing else: no `open`, no
 * `explorer`, no `xdg-open`. The tests therefore assert the resolved
 * coordinates, the refusal of anything outside the configured download
 * directory, and — deliberately — that a missing file still answers where it
 * used to be instead of failing (a stale row in the history table must still
 * be able to offer "copy path").
 *
 * All fixtures live under one `mkdtempSync` root and are removed afterwards;
 * nothing is written into the repository's real download directory.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

// The fixture root must exist before the (hoisted) mocks below run.
const DIR = mkdtempSync(join(tmpdir(), 'files-location-'));
const DOWNLOADS = join(DIR, 'downloads');
const ILLUSTRATIONS = join(DOWNLOADS, 'illustrations');
const NOVELS = join(DOWNLOADS, 'novels');
const OUTSIDE = join(DIR, 'downloads-out'); // sibling whose name starts with "downloads"
const FILE = join(ILLUSTRATIONS, '116743346_明日香_1.jpg');

jest.mock('../../config', () => ({
  getConfigPath: () => '/tmp/pixivflow.yml',
}));

// The handler reads the raw config, so it still resolves a download directory
// on a machine whose Pixiv token is a placeholder and `loadConfig` would
// refuse the file.
jest.mock('../../webui/routes/config-utils', () => ({
  readConfigRaw: () => ({
    storage: {
      illustrationDirectory: join(DIR, 'downloads', 'illustrations'),
      novelDirectory: join(DIR, 'downloads', 'novels'),
    },
  }),
}));

import {
  confineToBaseDir,
  parentDirectory,
} from '../../webui/utils/file-manager';
import {
  createLocationHandler,
  downloadDirectoryFor,
} from '../../webui/routes/handlers/files-location-handlers';
import { ErrorCode } from '../../webui/utils/error-codes';

mkdirSync(ILLUSTRATIONS, { recursive: true });
mkdirSync(NOVELS, { recursive: true });
mkdirSync(OUTSIDE, { recursive: true });
writeFileSync(FILE, 'jpeg-bytes');
writeFileSync(join(OUTSIDE, 'elsewhere.jpg'), 'jpeg-bytes');

afterAll(() => {
  rmSync(DIR, { recursive: true, force: true });
});

function responder() {
  const state: { status: number; payload: any } = { status: 200, payload: null };
  const res: any = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(payload: any) {
      state.payload = payload;
      return res;
    },
    get headersSent() {
      return false;
    },
  };
  return { state, res };
}

async function call(query: Record<string, unknown>) {
  const { state, res } = responder();
  await createLocationHandler()({ query } as any, res);
  return state;
}

describe('confineToBaseDir', () => {
  it('accepts a file inside the base directory and answers its directory', () => {
    const result = confineToBaseDir(FILE, ILLUSTRATIONS);
    expect(result).toEqual({
      path: FILE,
      directory: ILLUSTRATIONS,
      exists: true,
      isDirectory: false,
    });
  });

  it('accepts the base directory itself', () => {
    const result = confineToBaseDir(ILLUSTRATIONS, ILLUSTRATIONS);
    expect(result).toMatchObject({
      path: ILLUSTRATIONS,
      directory: ILLUSTRATIONS,
      exists: true,
      isDirectory: true,
    });
  });

  it('resolves a relative name against the base directory', () => {
    expect(confineToBaseDir('116743346_明日香_1.jpg', ILLUSTRATIONS)?.path).toBe(FILE);
  });

  it('refuses a traversal, an absolute escape, and a sibling with the same prefix', () => {
    expect(confineToBaseDir('../../../etc/hosts', ILLUSTRATIONS)).toBeNull();
    expect(confineToBaseDir('/etc/hosts', ILLUSTRATIONS)).toBeNull();
    expect(confineToBaseDir(join(OUTSIDE, 'elsewhere.jpg'), DOWNLOADS)).toBeNull();
  });

  it('refuses malformed input and an empty base directory', () => {
    expect(confineToBaseDir(`a\0b`, ILLUSTRATIONS)).toBeNull();
    expect(confineToBaseDir(FILE, '')).toBeNull();
  });

  it('still answers where a missing file used to be', () => {
    const gone = join(ILLUSTRATIONS, 'deleted.jpg');
    expect(confineToBaseDir(gone, ILLUSTRATIONS)).toMatchObject({
      path: gone,
      directory: ILLUSTRATIONS,
      exists: false,
      isDirectory: false,
    });
  });

  it('confines a missing file as strictly as an existing one', () => {
    expect(confineToBaseDir(join(OUTSIDE, 'deleted.jpg'), DOWNLOADS)).toBeNull();
  });
});

describe('parentDirectory', () => {
  it('answers the parent for a file and the directory for a directory', () => {
    expect(parentDirectory(FILE)).toBe(ILLUSTRATIONS);
    expect(parentDirectory(ILLUSTRATIONS)).toBe(ILLUSTRATIONS);
  });

  it('answers the parent for a target that does not exist', () => {
    expect(parentDirectory(join(ILLUSTRATIONS, 'gone.jpg'))).toBe(ILLUSTRATIONS);
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

describe('GET /api/files/location handler', () => {
  it('answers the file path and its directory', async () => {
    const state = await call({ path: FILE, type: 'illustration' });
    expect(state.status).toBe(200);
    expect(state.payload).toEqual({
      success: true,
      path: FILE,
      directory: ILLUSTRATIONS,
      exists: true,
      isDirectory: false,
    });
  });

  it('accepts a relative path', async () => {
    const state = await call({ path: '116743346_明日香_1.jpg', type: 'illustration' });
    expect(state.payload.path).toBe(FILE);
  });

  it('answers the configured directory when no path is given', async () => {
    const state = await call({ type: 'novel' });
    expect(state.status).toBe(200);
    expect(state.payload).toMatchObject({
      path: NOVELS,
      directory: NOVELS,
      isDirectory: true,
    });
  });

  it('answers the illustration directory by default', async () => {
    const state = await call({});
    expect(state.payload.path).toBe(ILLUSTRATIONS);
  });

  it('reports a missing file without failing the request', async () => {
    const state = await call({ path: join(ILLUSTRATIONS, 'deleted.jpg'), type: 'illustration' });
    expect(state.status).toBe(200);
    expect(state.payload).toMatchObject({
      path: join(ILLUSTRATIONS, 'deleted.jpg'),
      directory: ILLUSTRATIONS,
      exists: false,
    });
  });

  it('refuses a path outside the download directory with 400', async () => {
    const state = await call({ path: '/etc/hosts', type: 'illustration' });
    expect(state.status).toBe(400);
    expect(state.payload.errorCode).toBe(ErrorCode.FILE_PATH_INVALID);
  });

  it('refuses a sibling directory whose name shares the base prefix', async () => {
    const state = await call({ path: join(OUTSIDE, 'elsewhere.jpg'), type: 'illustration' });
    expect(state.status).toBe(400);
    expect(state.payload.errorCode).toBe(ErrorCode.FILE_PATH_INVALID);
  });

  it('refuses a traversal out of the download directory', async () => {
    const state = await call({
      path: `..${sep}downloads-out${sep}elsewhere.jpg`,
      type: 'illustration',
    });
    expect(state.status).toBe(400);
  });

  it('refuses a repeated path parameter instead of guessing', async () => {
    const state = await call({ path: [FILE, '/etc/hosts'], type: 'illustration' });
    expect(state.status).toBe(400);
    expect(state.payload.errorCode).toBe(ErrorCode.FILE_PATH_REQUIRED);
  });
});
