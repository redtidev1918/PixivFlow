import { spawnSync } from 'child_process';
import { dirname, resolve, relative, isAbsolute } from 'path';
import { existsSync, statSync } from 'fs';

/**
 * "Show this file in the system file manager" — the narrow OS integration the
 * file browser and the task history need.
 *
 * This module owns exactly one shell-out, so it also owns the rules that keep
 * that shell-out safe:
 *
 *  - the path is never taken from a request verbatim: the caller resolves it
 *    against a configured download directory first (`resolveWithinBaseDir`),
 *    so a crafted `../../..` path is rejected before anything is opened;
 *  - the platform opener is invoked with an argument array and `shell: false`,
 *    never through a shell string, so a path can never be parsed as a command;
 *  - "unsupported" and "failed" stay distinct results, because the UI must be
 *    able to tell "this host has no file manager" (offer the path to copy)
 *    apart from "the opener refused this path".
 */

/** Why a reveal attempt did not open a file manager. */
export type RevealFailure = 'unsupported' | 'failed';

export interface RevealResult {
  ok: boolean;
  /** Directory that was (or would have been) revealed; absolute. */
  path: string;
  reason?: RevealFailure;
  /** Opener stderr/stdout excerpt, already truncated. Never contains a secret. */
  detail?: string;
}

/**
 * Whether this process can hand a path to a file manager at all.
 *
 * A server-side deployment (Linux container, headless VPS, Fly.io) has no
 * desktop session, so revealing there would be meaningless — the UI must fall
 * back to copying the path. `darwin` / `win32` always have an opener; a Linux
 * host is only usable when `xdg-open` is actually installed and a display is
 * present.
 */
export function isFileManagerAvailable(): boolean {
  if (process.platform === 'darwin' || process.platform === 'win32') return true;
  if (process.platform !== 'linux') return false;
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return false;
  return whichSync('xdg-open') !== null;
}

/** Resolve an executable on PATH without spawning a shell. */
function whichSync(binary: string): string | null {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [binary], { encoding: 'utf-8', shell: false });
  if (result.status !== 0) return null;
  const first = (result.stdout ?? '').split('\n')[0]?.trim();
  return first ? first : null;
}

/**
 * The directory a file manager should open for `target`: the parent directory
 * for a file, the directory itself for a directory.
 */
export function directoryToReveal(target: string): string {
  try {
    return statSync(target).isDirectory() ? target : dirname(target);
  } catch {
    // Missing target: still answer with the parent, so the caller can report
    // the path it would have opened instead of failing on a stat race.
    return dirname(target);
  }
}

/** First non-empty line of a child process buffer, clipped. */
function clipDetail(value: string | undefined | null): string | undefined {
  const first = (value ?? '').split('\n').map((line) => line.trim()).filter(Boolean)[0];
  if (!first) return undefined;
  return first.length > 200 ? `${first.slice(0, 200)}...` : first;
}

/**
 * Open `dirPath` in the platform file manager.
 *
 * The call waits for the opener to exit: `open`/`xdg-open` return immediately
 * (they hand the request to the desktop session), so a non-zero status is a
 * real "this could not be opened" signal rather than a timing artifact.
 */
export function revealInFileManager(dirPath: string): RevealResult {
  const path = resolve(dirPath);

  if (!isFileManagerAvailable()) {
    return { ok: false, path, reason: 'unsupported' };
  }

  try {
    const result =
      process.platform === 'darwin'
        ? spawnSync('open', [path], { encoding: 'utf-8', shell: false, timeout: 10_000 })
        : process.platform === 'win32'
          ? spawnSync('explorer', [path], { encoding: 'utf-8', shell: false, timeout: 10_000 })
          : spawnSync('xdg-open', [path], { encoding: 'utf-8', shell: false, timeout: 10_000 });

    if (result.error) {
      return { ok: false, path, reason: 'failed', detail: clipDetail(result.error.message) };
    }

    if (result.status !== 0) {
      return {
        ok: false,
        path,
        reason: 'failed',
        detail: clipDetail(result.stderr) ?? clipDetail(result.stdout),
      };
    }

    return { ok: true, path };
  } catch (error) {
    return {
      ok: false,
      path,
      reason: 'failed',
      detail: clipDetail(error instanceof Error ? error.message : String(error)),
    };
  }
}

/**
 * Resolve a caller-supplied path against one or more allowed base directories.
 *
 * Returns the absolute, existing path when it is inside a base directory, and
 * `null` for anything else: a missing path, a path escaping every base, or a
 * path that does not exist. Callers turn `null` into their own error code, so
 * this stays a pure decision function.
 */
export function resolveWithinBaseDir(
  filePath: string,
  baseDirs: string[]
): string | null {
  if (filePath.includes('\0')) return null;

  const bases = baseDirs
    .filter((dir): dir is string => typeof dir === 'string' && dir.length > 0)
    .map((dir) => resolve(dir));
  if (bases.length === 0) return null;

  const candidates: string[] = [];
  if (isAbsolute(filePath)) {
    candidates.push(resolve(filePath));
  } else {
    for (const base of bases) candidates.push(resolve(base, filePath));
  }

  for (const candidate of candidates) {
    const inside = bases.some((base) => {
      const rel = relative(base, candidate);
      // Empty rel = the base itself; a leading '..' = outside the base.
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    });
    if (!inside) continue;
    if (!existsSync(candidate)) continue;
    return candidate;
  }

  return null;
}
