import { Request, Response } from 'express';
import { join, resolve, sep } from 'path';
import { existsSync, statSync } from 'fs';
import { getConfigPath } from '../../../config';
import { logger } from '../../../logger';
import { readConfigRaw } from '../config-utils';
import { ErrorCode } from '../../utils/error-codes';
import {
  directoryToReveal,
  revealInFileManager,
  type RevealResult,
} from '../../utils/file-manager';

/**
 * POST /api/files/reveal
 *
 * "Show in file manager" for the file browser and the task history.
 *
 * Body: `{ path?: string, type?: 'illustration' | 'novel', resolveOnly?: boolean }`
 *
 *  - `path` names a downloaded file (absolute or relative to the download
 *    directory); its *parent* directory is revealed, matching what "show in
 *    Finder/Explorer" does everywhere else.
 *  - without `path` the configured download directory itself is revealed — the
 *    "open downloads folder" button.
 *  - `resolveOnly` answers with the directory it would open and never touches
 *    the OS. The WebUI uses it to resolve a path first, so a desktop host can
 *    open the *local* directory itself instead of asking the backend.
 *
 * The response is deliberately explicit about *why* nothing opened: a host
 * without a file manager (`FILE_REVEAL_UNSUPPORTED`) is a normal deployment,
 * not an error to retry, and the UI answers it by offering the path to copy.
 *
 * The reveal function is injectable so tests never spawn a real file manager.
 */
export interface RevealHandlerDeps {
  reveal: (dirPath: string) => RevealResult;
}

/**
 * The configured download directory for one target type.
 *
 * Read from the raw config on purpose: `loadConfig` refuses a config whose
 * Pixiv token is still a placeholder (a fresh install, before login) and the
 * download folder is knowable without a token. Revealing a folder must not be
 * the one thing a not-yet-logged-in user cannot do.
 *
 * Falls back to PixivFlow's own defaults (`./downloads` + `/illustrations` |
 * `/novels`), mirroring `src/config/defaults.ts`, so the answer is the same
 * whether the setting is absent or explicit.
 */
export function downloadDirectoryFor(
  type: 'illustration' | 'novel',
  storage: { downloadDirectory?: string; illustrationDirectory?: string; novelDirectory?: string } | undefined
): string | undefined {
  const explicit = type === 'novel' ? storage?.novelDirectory : storage?.illustrationDirectory;
  if (explicit) return explicit;

  const root = storage?.downloadDirectory;
  if (!root) return undefined;
  return join(root, type === 'novel' ? 'novels' : 'illustrations');
}

const defaultDeps: RevealHandlerDeps = { reveal: revealInFileManager };

export function createRevealHandler(deps: RevealHandlerDeps = defaultDeps) {
  return async function revealFile(req: Request, res: Response): Promise<void> {
    try {
      const config = readConfigRaw(getConfigPath());

      const body = (req.body ?? {}) as {
        path?: unknown;
        type?: unknown;
        resolveOnly?: unknown;
      };
      const type = body.type === 'novel' ? 'novel' : 'illustration';
      const resolveOnly = body.resolveOnly === true;

      const baseDir = downloadDirectoryFor(type, config?.storage);

      if (!baseDir) {
        res.status(400).json({ errorCode: ErrorCode.FILE_PATH_INVALID });
        return;
      }

      if (body.path === undefined || body.path === null || body.path === '') {
        // "Open the downloads folder": no path, so the configured directory is
        // the target — and it need not exist yet (nothing downloaded so far).
        const target = resolve(baseDir);
        respond(res, target, resolveOnly, existsSync(target), deps);
        return;
      }

      if (typeof body.path !== 'string') {
        res.status(400).json({ errorCode: ErrorCode.FILE_PATH_REQUIRED });
        return;
      }

      const requested = body.path;
      const absolute = requested.startsWith('/') || /^[A-Za-z]:[\\/]/.test(requested);
      const candidate = absolute ? resolve(requested) : resolve(join(baseDir, requested));

      // Confinement: a path that escapes the configured directory is refused
      // before anything is opened. The separator check keeps `/data-out`
      // (a sibling whose name merely starts with `/data`) out.
      const resolvedBase = resolve(baseDir);
      const insideBase =
        candidate === resolvedBase || candidate.startsWith(resolvedBase + sep);
      if (!insideBase) {
        logger.warn('Reveal refused: path outside the download directory', { candidate });
        res.status(400).json({ errorCode: ErrorCode.FILE_PATH_INVALID });
        return;
      }

      if (!existsSync(candidate)) {
        res.status(404).json({ errorCode: ErrorCode.FILE_NOT_FOUND });
        return;
      }

      let directory: string;
      try {
        directory = statSync(candidate).isDirectory() ? candidate : directoryToReveal(candidate);
      } catch {
        directory = directoryToReveal(candidate);
      }

      respond(res, directory, resolveOnly, true, deps);
    } catch (error) {
      logger.error('Failed to reveal file in the system file manager', { error });
      if (!res.headersSent) {
        res.status(500).json({ errorCode: ErrorCode.FILE_REVEAL_FAILED });
      }
    }
  };
}

/** Shared tail: either report the resolved directory, or open it. */
function respond(
  res: Response,
  directory: string,
  resolveOnly: boolean,
  exists: boolean,
  deps: RevealHandlerDeps
): void {
  if (resolveOnly) {
    res.json({ success: true, errorCode: ErrorCode.FILE_REVEAL_SUCCESS, path: directory, exists });
    return;
  }

  if (!exists) {
    res.status(404).json({ errorCode: ErrorCode.FILE_NOT_FOUND, path: directory });
    return;
  }

  const result = deps.reveal(directory);

  if (result.ok) {
    res.json({ success: true, errorCode: ErrorCode.FILE_REVEAL_SUCCESS, path: result.path });
    return;
  }

  if (result.reason === 'unsupported') {
    // A normal deployment answer: this host has no file manager to open. The
    // 200 keeps it out of the generic error path — the UI offers the path
    // instead of reporting a failure the user cannot act on.
    res.json({
      success: false,
      errorCode: ErrorCode.FILE_REVEAL_UNSUPPORTED,
      path: result.path,
    });
    return;
  }

  logger.warn('File manager refused to open the path', { path: result.path, detail: result.detail });
  res.status(500).json({
    errorCode: ErrorCode.FILE_REVEAL_FAILED,
    path: result.path,
  });
}

export const revealFile = createRevealHandler();
