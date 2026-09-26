import { Request, Response } from 'express';
import { resolve } from 'path';
import { getConfigPath } from '../../../config';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';
import { readConfigRaw } from '../config-utils';
import { confineToBaseDir } from '../../utils/file-manager';

/**
 * GET /api/files/location
 *
 * "Where on disk is this file?" — the read-only half of "open the folder".
 *
 * Query: `type?` (`illustration` | `novel`), `path?` (absolute or relative to
 * the configured download directory).
 *
 * Without `path` the configured download directory itself is answered, which
 * is what the download page's "open the folder" button resolves before it
 * hands the path to the host. With `path`, the file's own directory is
 * answered as `directory` — and `path` itself is echoed, because the host
 * wants to *select* the file, not merely to open its folder.
 *
 * This endpoint never opens anything: no `open`, no `explorer`, no
 * `xdg-open`. Whether a path can be shown to the user is a property of the
 * device in front of them (the desktop host, or the machine running the
 * browser), never of the PixivFlow runtime — a container has no file manager
 * to spawn, and pretending otherwise would put a side effect on a GET.
 *
 * The configured directory is read from the raw config on purpose: a fresh
 * install whose Pixiv token is still a placeholder cannot `loadConfig`, and
 * "where are my downloads?" must not depend on being logged in.
 */
export function downloadDirectoryFor(
  type: 'illustration' | 'novel',
  storage: { downloadDirectory?: string; illustrationDirectory?: string; novelDirectory?: string } | undefined
): string | undefined {
  const explicit = type === 'novel' ? storage?.novelDirectory : storage?.illustrationDirectory;
  if (explicit) return explicit;

  const root = storage?.downloadDirectory;
  if (!root) return undefined;
  // Mirrors `src/config/defaults.ts` + `src/config/path-resolution.ts`: the
  // per-type directories are subdirectories of the download root.
  return type === 'novel' ? resolve(root, 'novels') : resolve(root, 'illustrations');
}

export function createLocationHandler() {
  return async function fileLocation(req: Request, res: Response): Promise<void> {
    try {
      const config = readConfigRaw(getConfigPath());

      const rawType = req.query.type;
      const type = rawType === 'novel' ? 'novel' : 'illustration';
      const rawPath = req.query.path;

      if (rawPath !== undefined && typeof rawPath !== 'string') {
        res.status(400).json({ errorCode: ErrorCode.FILE_PATH_REQUIRED });
        return;
      }

      const baseDir = downloadDirectoryFor(type, config?.storage);
      if (!baseDir) {
        res.status(400).json({ errorCode: ErrorCode.FILE_PATH_INVALID });
        return;
      }

      if (rawPath === undefined || rawPath === '') {
        // "Where is the download folder?" — answer even when nothing has been
        // downloaded yet, with the directory it will be.
        const target = resolve(baseDir);
        const location = confineToBaseDir(target, baseDir);
        if (!location) {
          res.status(400).json({ errorCode: ErrorCode.FILE_PATH_INVALID });
          return;
        }
        res.json({ success: true, ...location });
        return;
      }

      const location = confineToBaseDir(rawPath, baseDir);
      if (!location) {
        logger.warn('File location refused: path outside the download directory', {
          requested: rawPath,
        });
        res.status(400).json({ errorCode: ErrorCode.FILE_PATH_INVALID });
        return;
      }

      res.json({ success: true, ...location });
    } catch (error) {
      logger.error('Failed to resolve a file location', { error });
      if (!res.headersSent) {
        res.status(500).json({ errorCode: ErrorCode.FILE_LIST_FAILED });
      }
    }
  };
}

export const fileLocation = createLocationHandler();
