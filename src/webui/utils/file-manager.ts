import { dirname, resolve, relative, isAbsolute, sep } from 'path';
import { existsSync, statSync } from 'fs';

/**
 * Where a downloaded file actually lives.
 *
 * PixivFlow answers *where*, never "opens" anything: revealing a path is a
 * capability of the device in front of the user (the desktop host, or the
 * machine running a browser), not of the PixivFlow runtime. A container on
 * Fly.io has no Finder to open, so a spawned `xdg-open` there would be a lie
 * with a side effect. The runtime's whole job is to resolve, normalize and
 * confine the path, and to answer honestly about whether it exists.
 *
 * This module therefore owns no shell-out and no platform branch.
 */

export interface FileLocation {
  /** Absolute, confined path of the file (or directory) that was asked about. */
  path: string;
  /** The directory to show in a file manager. Equals `path` for a directory. */
  directory: string;
  exists: boolean;
  isDirectory: boolean;
}

/**
 * The directory a file manager would show for `target`: the parent directory
 * for a file, the directory itself for a directory.
 *
 * A missing target answers with its parent, so a stale database row still
 * produces a usable directory instead of an error.
 */
export function parentDirectory(target: string): string {
  try {
    return statSync(target).isDirectory() ? target : dirname(target);
  } catch {
    return dirname(target);
  }
}

/**
 * Resolve a caller-supplied path inside the configured download directory.
 *
 * Returns `null` for anything that must not be answered: a path escaping the
 * base directory, a sibling whose name merely starts with the base name
 * (`/data` vs `/data-out`), a NUL byte, or a malformed argument. Existence is
 * deliberately *not* part of this decision — a file deleted behind the app's
 * back should still answer where it used to be, with `exists: false`.
 */
export function confineToBaseDir(
  filePath: string,
  baseDir: string
): { path: string; directory: string; exists: boolean; isDirectory: boolean } | null {
  if (typeof filePath !== 'string' || filePath.includes('\0')) return null;
  if (typeof baseDir !== 'string' || baseDir.length === 0) return null;

  const base = resolve(baseDir);
  const candidate = isAbsolute(filePath)
    ? resolve(filePath)
    : resolve(base, filePath);

  // Confinement compares against `base + separator`: a prefix check alone would
  // accept `/downloads-out` for a base of `/downloads`.
  if (candidate !== base && !candidate.startsWith(base + sep)) return null;

  let exists = false;
  let isDirectory = false;
  try {
    const stat = statSync(candidate);
    exists = true;
    isDirectory = stat.isDirectory();
  } catch {
    exists = false;
  }

  return {
    path: candidate,
    directory: isDirectory ? candidate : parentDirectory(candidate),
    exists,
    isDirectory,
  };
}
