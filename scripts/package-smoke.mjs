#!/usr/bin/env node
/**
 * Black-box package smoke: validates the artifact npm users actually install.
 *
 * Pipeline:
 *   1. npm pack -> tarball (+ file list JSON)
 *   2. artifact content assertions (dist, bundled workspace, docs, config)
 *   3. clean global install into an isolated prefix
 *   4. install-script gate: zero required lifecycle scripts in the runtime
 *      dependency tree, except entries in scripts/package-smoke-allowlist.json
 *      (explicit, documented, reviewed — see §19 of the packaging policy)
 *   5. CLI boot: `pixivflow --version` / `--help` from the installed bin
 *   6. storage smoke: open the installed Database, run migrations, metadata
 *      write/read roundtrip, close
 *
 * Usage:
 *   node scripts/package-smoke.mjs            # full smoke (CI + local)
 *   node scripts/package-smoke.mjs --strict   # ignore the allowlist, fail on
 *                                             # ANY lifecycle script (used to
 *                                             # prove the gate detects packages)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const failures = [];
const steps = [];

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} exited ${res.status}\n${res.stdout || ''}\n${res.stderr || ''}`
    );
  }
  return res;
}

function step(name, fn) {
  process.stdout.write(`\n== ${name} ...\n`);
  try {
    const detail = fn();
    if (detail) process.stdout.write(`   ok: ${detail}\n`);
    steps.push({ name, ok: true });
  } catch (error) {
    process.stdout.write(`   FAIL: ${error.message}\n`);
    failures.push({ name, error: error.message });
    steps.push({ name, ok: false });
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixivflow-pkg-smoke-'));
process.stdout.write(`workspace: ${tmp}\n`);

// ------------------------------------------------ 0. build (CI-clean tree)
// `npm pack` does NOT run prepublishOnly, so a fresh checkout packs a tarball
// without dist/. Build explicitly so the artifact always reflects HEAD.
step('npm run build', () => {
  run('npm', ['run', 'build'], { cwd: repoRoot });
  return 'dist/ built';
});

// ---------------------------------------------------------------- 1. pack
let packResult;
step('npm pack', () => {
  const res = run('npm', ['pack', '--json', '--pack-destination', tmp], { cwd: repoRoot });
  const parsed = JSON.parse(res.stdout);
  packResult = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!packResult?.filename) throw new Error('npm pack --json returned no filename');
  return `${packResult.filename} (${Math.round(packResult.size / 1024)} KiB, ${packResult.files?.length ?? '?'} files)`;
});

const tarballPath = path.join(tmp, packResult.filename);
// npm pack --json reports paths WITHOUT the `package/` root; accept either form.
const packedFiles = (packResult.files ?? []).map((f) => {
  const p = f.path.replace(/\\/g, '/');
  return p.startsWith('package/') ? p.slice('package/'.length) : p;
});

// ------------------------------------------------- 2. artifact contents
step('artifact contents (dist / bundled workspace / docs / config)', () => {
  const required = [
    'dist/index.js',
    'package.json',
    'README.md',
    'LICENSE',
    'config/examples/standalone.config.example.json',
    'config/fly-two-bots.example.json',
  ];
  const missing = required.filter((f) => !packedFiles.includes(f));
  if (missing.length) throw new Error(`missing from tarball: ${missing.join(', ')}`);
  // Note: npm pack --json's file list does NOT include bundled dependencies'
  // contents, so @redtidev/pixiv-client is asserted against the INSTALLED
  // tree in the next step instead.
});

// --------------------------------------------- 3. clean global install
let prefix;
step('clean global install', () => {
  prefix = path.join(tmp, 'prefix');
  fs.mkdirSync(prefix, { recursive: true });
  run('npm', ['install', '-g', '--prefix', prefix, '--no-audit', '--no-fund', tarballPath], {
    cwd: tmp,
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
  // Workspace inclusion: @redtidev/pixiv-client must be present AND resolvable
  // from the installed package (a missing workspace is exactly the
  // MODULE_NOT_FOUND release-defect class observed with the executor image).
  const pkgRoot = installedPkgRoot();
  const kitDistDir = path.join(pkgRoot, 'node_modules', '@redtidev', 'pixiv-client', 'dist');
  if (!fs.existsSync(kitDistDir)) {
    throw new Error('@redtidev/pixiv-client dist/ missing from the installed tree');
  }
  const requireFromInstall = createRequire(path.join(pkgRoot, 'package.json'));
  requireFromInstall.resolve('@redtidev/pixiv-client');
  return `installed + @redtidev/pixiv-client resolvable (${fs.readdirSync(kitDistDir).length} dist entries)`;
});

function installedPkgRoot() {
  const candidates =
    process.platform === 'win32'
      ? [path.join(prefix, 'node_modules', 'pixivflow')]
      : [path.join(prefix, 'lib', 'node_modules', 'pixivflow')];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`installed pixivflow not found under ${prefix}`);
  return found;
}

// ------------------------------------- 4. install-script gate (zero policy)
const ALLOWLIST_PATH = path.join(repoRoot, 'scripts', 'package-smoke-allowlist.json');
step('install-script gate', () => {
  const pkgRoot = installedPkgRoot();
  const nmDir = path.join(pkgRoot, 'node_modules');
  if (!fs.existsSync(nmDir)) throw new Error(`no node_modules under ${pkgRoot}`);

  const offenders = [];
  const queue = [nmDir];
  while (queue.length) {
    const dir = queue.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('@')) queue.push(full); // scope dir
        else queue.push(full);
        continue;
      }
      if (entry.name !== 'package.json') continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(full, 'utf8'));
        const scripts = manifest.scripts ?? {};
        const lifecycle = ['preinstall', 'install', 'postinstall'].filter((k) => scripts[k]);
        if (lifecycle.length) {
          offenders.push({
            name: manifest.name || path.relative(nmDir, path.dirname(full)),
            scripts: lifecycle,
            via: path.relative(nmDir, path.dirname(full)),
          });
        }
      } catch {
        /* unreadable manifest -> ignore */
      }
    }
  }

  const allowlist = strict
    ? []
    : JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')).allowed ?? [];
  const allowedNames = new Set(allowlist.map((a) => a.name));
  const violations = offenders.filter((o) => !allowedNames.has(o.name));
  const stale = [...allowedNames].filter((n) => !offenders.some((o) => o.name === n));

  const summary = offenders
    .map((o) => `${o.name} [${o.scripts.join(',')}]`)
    .join(', ');
  process.stdout.write(`   tree: ${offenders.length} package(s) with lifecycle scripts\n`);
  if (summary) process.stdout.write(`   found: ${summary}\n`);
  for (const s of stale) process.stdout.write(`   STALE allowlist entry (no longer needed): ${s}\n`);

  if (violations.length) {
    throw new Error(
      `required install scripts detected (not covered by the allowlist): ` +
        violations.map((v) => `${v.name} [${v.scripts.join(',')}]`).join(', ') +
        `\n   Packaging policy: zero required third-party install scripts.` +
        `\n   Fix the dependency boundary; do not grow the allowlist.`
    );
  }
  if (strict && offenders.length) {
    throw new Error(
      `--strict: lifecycle scripts present: ` +
        offenders.map((o) => `${o.name} [${o.scripts.join(',')}]`).join(', ')
    );
  }
  return strict ? 'strict mode: no exceptions honored' : 'all lifecycle scripts are explicit allowlist entries';
});

// ----------------------------------------------------------- 5. CLI boot
step('CLI boot (--version / --help)', () => {
  const binDir =
    process.platform === 'win32' ? prefix : path.join(prefix, 'bin');
  const binName = process.platform === 'win32' ? 'pixivflow.cmd' : 'pixivflow';
  const bin = path.join(binDir, binName);
  if (!fs.existsSync(bin)) throw new Error(`bin not found at ${bin}`);

  const version = run(bin, ['--version'], { cwd: tmp, timeout: 60_000 });
  if (!/\d+\.\d+\.\d+/.test(version.stdout)) {
    throw new Error(`--version printed no semver: ${JSON.stringify(version.stdout.slice(0, 120))}`);
  }
  const help = run(bin, ['--help'], { cwd: tmp, timeout: 60_000 });
  if (help.stdout.length < 40) throw new Error('--help output suspiciously short');
  return `version=${version.stdout.trim().slice(0, 40)}`;
});

// ------------------------------------------------------ 6. storage smoke
step('storage smoke (open / migrate / write / read / close)', () => {
  const pkgRoot = installedPkgRoot();
  const requireFromInstall = createRequire(path.join(pkgRoot, 'package.json'));
  const dbModulePath = requireFromInstall.resolve('pixivflow/dist/storage/Database.js');
  const { Database } = requireFromInstall(dbModulePath);

  const dbPath = path.join(tmp, 'smoke-data', 'pixivflow.db');
  const db = new Database(dbPath);
  db.migrate();

  const meta = db.metadata;
  meta.put('smoke-pixiv-id-1', 'illustration', { language: 'zh-cn', title: 'smoke entry' });
  const row = meta.get('smoke-pixiv-id-1', 'illustration');
  if (!row || row.title !== 'smoke entry') {
    throw new Error('metadata write/read roundtrip failed');
  }
  db.close();
  if (!fs.existsSync(dbPath)) throw new Error('database file was not created');
  return `migrated + roundtrip ok at ${dbPath}`;
});

// ---------------------------------------------------------------- report
const pass = failures.length === 0;
process.stdout.write(
  `\n${pass ? 'PACKAGE SMOKE: PASS' : 'PACKAGE SMOKE: FAIL'}\n` +
    steps.map((s) => `  ${s.ok ? '✓' : '✗'} ${s.name}`).join('\n') +
    '\n'
);
if (!pass) {
  for (const f of failures) process.stderr.write(`\nfailure [${f.name}]:\n${f.error}\n`);
  process.exit(1);
}
