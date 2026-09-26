// webui/server/runtime-meta.ts
//
// Single source of runtime facts for the Runtime Contract endpoints
// (/status, /version). Version/name are read from package.json at startup and
// cached — that package is the authoritative SemVer source, NOT the generated
// src/version.ts which can drift from package.json.
import path from 'node:path';
import fs from 'node:fs';

export interface RuntimeMeta {
  /** package.json `name` (e.g. "pixivflow"). */
  name: string;
  /** package.json `version`, the authoritative SemVer (e.g. "2.46.0"). */
  version: string;
  /** Wall-clock time the runtime meta was first resolved (~server start). */
  startedAt: Date;
}

let cached: RuntimeMeta | null = null;

/**
 * Locate the repository package.json by walking up from a start directory.
 * Mirrors the walk-up strategy already used by server-static.ts.
 */
function findPackageJsonUp(startDir: string, maxUp = 16): string | null {
  let dir = startDir;
  for (let i = 0; i < maxUp; i++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Resolve runtime meta. Uses the package name self-reference when available
 * (installed / bundled layout, e.g. tauri resources/backend), falling back to
 * walking up from this file to the repository root (dev / source layout).
 */
export function runtimeMeta(): RuntimeMeta {
  if (cached) return cached;

  let pkgPath: string | null = null;
  try {
    pkgPath = require.resolve('pixivflow/package.json', { paths: [__dirname] });
  } catch {
    pkgPath = findPackageJsonUp(path.join(__dirname, '..', '..', '..'));
  }

  const meta: RuntimeMeta = { name: 'pixivflow', version: '0.0.0', startedAt: new Date() };
  if (pkgPath) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (typeof pkg.name === 'string' && pkg.name) meta.name = pkg.name;
      if (typeof pkg.version === 'string' && pkg.version) meta.version = pkg.version;
    } catch {
      // Keep defaults on unreadable package.json.
    }
  }
  cached = meta;
  return meta;
}