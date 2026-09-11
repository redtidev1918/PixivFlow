#!/usr/bin/env node
/**
 * Black-box package smoke: validates the artifact npm users actually install.
 *
 * Pipeline (each line is a release-gate claim about `npm install -g pixivflow`):
 *   preflight: the running Node satisfies engines.node; CI pins this job to the exact
 *      declared floor so the artifact is proven on the oldest supported runtime.
 *   1. npm pack -> tarball (+ file list JSON)
 *   2. artifact content assertions (dist, bundled workspace, docs, config)
 *   3. clean global install into an isolated prefix
 *   4. install-script gate: REQUIRED INSTALL SCRIPTS = 0. The allowlist in
 *      scripts/package-smoke-allowlist.json must itself stay empty -- a non-empty
 *      allowlist fails the gate, so it can never be used to park a problem.
 *   5. no native build: no node-gyp/prebuild-install in the install log, no
 *      binding.gyp and no compiled *.node in the installed tree.
 *   6. no automatic browser download: no browser-downloading package
 *      (`puppeteer`, `playwright`, ...) and no populated browser cache. The
 *      gate points PUPPETEER_CACHE_DIR / PLAYWRIGHT_BROWSERS_PATH at a temp
 *      directory, so an unexpected download is observable rather than landing
 *      in the developer's real cache.
 *   7. packed manifest boundary: engines.node pins the `node:sqlite` floor, no
 *      native/download runtime dependency, and every package the login layer
 *      `require`s at runtime is a real dependency (not a hoisted devDependency).
 *   8. CLI boot: `pixivflow --version` / `--help` from the installed bin
 *   9. storage smoke: open the installed Database, run migrations, metadata
 *      write/read roundtrip, close
 *  10. login bootstrap: the browser layer loads from the artifact, resolves
 *      puppeteer-core, and can explain a missing browser — i.e. a user who runs
 *      `pixivflow login` gets guidance, not MODULE_NOT_FOUND.
 *
 * Usage:
 *   node scripts/package-smoke.mjs            # full smoke (CI + local)
 *   node scripts/package-smoke.mjs --strict   # fail on ANY lifecycle script even
 *                                             # if it were allowlisted. Same
 *                                             # verdict as the default today (the
 *                                             # allowlist must be empty); kept as
 *                                             # the detector's own negative control.
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

// -------------------------- preflight: runtime meets the declared Node floor
// `node:sqlite` is unflagged from v22.13.0. Below that the storage step fails with a database
// error that hides the real cause, so the runtime is checked up front against engines.node --
// and CI pins this job to that exact version so the artifact is proven on the oldest
// supported runtime, not just on a recent one.
step('runtime meets the declared Node floor', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const range = manifest.engines?.node ?? '';
  const min = range.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!min) throw new Error(`engines.node pins no minimum version: ${JSON.stringify(range)}`);
  const [minMajor, minMinor, minPatch] = min[0].split('.').map(Number);
  const [curMajor, curMinor, curPatch] = process.versions.node.split('.').map(Number);
  const below =
    curMajor < minMajor ||
    (curMajor === minMajor && curMinor < minMinor) ||
    (curMajor === minMajor && curMinor === minMinor && curPatch < minPatch);
  if (below) {
    throw new Error(
      `running Node ${process.versions.node} but package.json requires ${range}` +
        ` (node:sqlite is unflagged from v22.13.0)`
    );
  }
  return `Node ${process.versions.node} satisfies ${range}`;
});

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
  return `${packedFiles.length} files packed; all required entries present`;
});

// --------------------------------------------- 3. clean global install
let prefix;
let installLog = '';
step('clean global install', () => {
  prefix = path.join(tmp, 'prefix');
  fs.mkdirSync(prefix, { recursive: true });
  // Hermetic browser caches. The claim under test is that nothing downloads a browser, so
  // every known cache is pointed at a temp directory: an unexpected download then shows up
  // as an observable artifact in this workspace instead of silently landing in the
  // runner's real ~/.cache. PUPPETEER_SKIP_DOWNLOAD is deliberately NOT set — the gate has
  // to hold with downloading permitted, not because it was switched off.
  const install = run(
    'npm',
    ['install', '-g', '--prefix', prefix, '--no-audit', '--no-fund', tarballPath],
    {
      cwd: tmp,
      env: {
        ...process.env,
        npm_config_update_notifier: 'false',
        PUPPETEER_CACHE_DIR: path.join(tmp, 'browser-cache', 'puppeteer'),
        PLAYWRIGHT_BROWSERS_PATH: path.join(tmp, 'browser-cache', 'playwright'),
      },
    }
  );
  installLog = `${install.stdout ?? ''}\n${install.stderr ?? ''}`;
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

  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')).allowed ?? [];
  const allowedNames = new Set(allowlist.map((a) => a.name));
  const violations = offenders.filter((o) => !allowedNames.has(o.name));
  const stale = [...allowedNames].filter((n) => !offenders.some((o) => o.name === n));

  const summary = offenders
    .map((o) => `${o.name} [${o.scripts.join(',')}]`)
    .join(', ');
  process.stdout.write(`   tree: ${offenders.length} package(s) with lifecycle scripts\n`);
  if (summary) process.stdout.write(`   found: ${summary}\n`);
  for (const s of stale) process.stdout.write(`   STALE allowlist entry (no longer needed): ${s}\n`);

  if (violations.length || (strict && offenders.length)) {
    throw new Error(
      `required install scripts detected: ` +
        violations.map((v) => `${v.name} [${v.scripts.join(',')}]`).join(', ') +
        `\n   Packaging policy: REQUIRED INSTALL SCRIPTS = 0.` +
        `\n   Fix the dependency boundary; the allowlist must not grow.`
    );
  }
  // The allowlist is an escape hatch by design, so "must not grow" is enforced rather than
  // trusted: a non-empty allowlist means someone parked a problem instead of fixing it.
  if (allowlist.length) {
    throw new Error(
      `package-smoke-allowlist.json has ${allowlist.length} entry/entries (` +
        allowlist.map((a) => a.name).join(', ') +
        `), but the packaging policy is zero install scripts.` +
        `\n   Remove the dependency that needs the script instead of allowlisting it.`
    );
  }
  return 'zero lifecycle scripts in the installed dependency tree';
});

// ---------------------------------------------------- installed-tree walkers
/** Every file under `root`, depth-first. Best effort: unreadable dirs are skipped. */
function walkInstalledFiles(root) {
  const out = [];
  const queue = [root];
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
      if (entry.isDirectory()) queue.push(full);
      else out.push(full);
    }
  }
  return out;
}

function readManifest(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Packages whose install hooks fetch a browser binary over the network. */
const BROWSER_DOWNLOADING_PACKAGES = new Set(['puppeteer', 'playwright', '@playwright/test']);

// -------------------------------------------------- 5. no native build
step('no native build (no node-gyp, no compiled artifacts)', () => {
  const buildTooling = /node-gyp|prebuild-install|node-pre-gyp|gyp ERR!/i;
  const offendingLine = installLog.split('\n').find((line) => buildTooling.test(line));
  if (offendingLine) {
    throw new Error(`the install ran build tooling: ${offendingLine.trim()}`);
  }

  const pkgRoot = installedPkgRoot();
  const findings = walkInstalledFiles(path.join(pkgRoot, 'node_modules')).filter(
    (file) => file.endsWith('binding.gyp') || file.endsWith('.node')
  );
  if (findings.length) {
    throw new Error(
      `native build artifacts in the installed tree: ${findings.slice(0, 5).join(', ')}` +
        (findings.length > 5 ? ` (+${findings.length - 5} more)` : '')
    );
  }
  return 'no build tooling in the install log, no binding.gyp / *.node in the tree';
});

// --------------------------------------- 6. no automatic browser download
step('no automatic browser download', () => {
  const pkgRoot = installedPkgRoot();
  const downloaders = [];
  for (const file of walkInstalledFiles(path.join(pkgRoot, 'node_modules'))) {
    if (path.basename(file) !== 'package.json') continue;
    const manifest = readManifest(file);
    if (manifest && BROWSER_DOWNLOADING_PACKAGES.has(manifest.name)) downloaders.push(manifest.name);
  }
  if (downloaders.length) {
    throw new Error(`browser-downloading packages were installed: ${downloaders.join(', ')}`);
  }

  // PUPPETEER_CACHE_DIR / PLAYWRIGHT_BROWSERS_PATH were pointed here for the install, so a
  // non-empty directory is direct evidence that something fetched a browser anyway.
  const cacheRoot = path.join(tmp, 'browser-cache');
  const populated = fs.existsSync(cacheRoot)
    ? fs.readdirSync(cacheRoot).filter((entry) => {
        const p = path.join(cacheRoot, entry);
        return fs.statSync(p).isDirectory() && fs.readdirSync(p).length > 0;
      })
    : [];
  if (populated.length) {
    throw new Error(
      `a browser cache was populated, so an automatic download happened: ${populated.join(', ')}`
    );
  }
  return 'no browser-downloading package installed, no browser cache populated';
});

// ------------------------------------------- 7. packed manifest boundary
step('packed manifest boundary (engines / dependency declaration)', () => {
  const manifest = readManifest(path.join(installedPkgRoot(), 'package.json'));
  if (!manifest) throw new Error('installed package.json is unreadable');

  // `node:sqlite` is unflagged from Node v22.13.0. Below that the CLI cannot open the
  // database without --experimental-sqlite, so the declared floor has to say so.
  const enginesNode = manifest.engines?.node ?? '';
  if (!/22\.13\.0/.test(enginesNode)) {
    throw new Error(
      `engines.node must pin the node:sqlite floor (>=22.13.0); got ${JSON.stringify(enginesNode)}`
    );
  }

  const deps = manifest.dependencies ?? {};
  const forbidden = ['better-sqlite3', 'sqlite3', 'puppeteer', 'node-gyp', 'prebuild-install'];
  const present = forbidden.filter((name) => name in deps);
  if (present.length) {
    throw new Error(`runtime dependencies that break the zero-build contract: ${present.join(', ')}`);
  }

  // A runtime `require` must be a declared runtime dependency. `puppeteer-core` used to sit
  // in devDependencies and resolve only because npm hoisted it — which is exactly how a
  // global install breaks for users while every test in this repo still passes.
  if ('puppeteer-core' in (manifest.devDependencies ?? {})) {
    throw new Error('puppeteer-core is declared as a devDependency but is required at runtime');
  }
  if (!('puppeteer-core' in deps)) {
    throw new Error(
      'puppeteer-core must be declared in dependencies (the login layer uses it at runtime)'
    );
  }
  return `engines.node=${enginesNode}; no native/download runtime deps; puppeteer-core declared at runtime`;
});

// ----------------------------------------------------------- 8. CLI boot
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

// ------------------------------------------------------ 9. storage smoke
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

// ------------------------------------------------ 10. login bootstrap
// Runs inside the INSTALLED artifact (not the repo), so module resolution is exactly the
// user's. The failure this guards against is the historic one: `puppeteer-core` sitting in
// devDependencies, resolving locally because npm hoisted it, and blowing up with
// MODULE_NOT_FOUND for anyone who installs the published package.
const LOGIN_BOOTSTRAP_PROBE = `'use strict';
const path = require('node:path');
const { createRequire } = require('node:module');

const pkgRoot = process.argv[2];
const req = createRequire(path.join(pkgRoot, 'package.json'));

function fail(message) {
  process.stdout.write('LOGIN_BOOTSTRAP_FAIL: ' + message + '\\n');
  process.exit(1);
}

let core;
try {
  core = req('puppeteer-core');
} catch (error) {
  fail('puppeteer-core is not resolvable from the installed artifact: ' + error.message);
}
if (typeof core.launch !== 'function') fail('puppeteer-core resolved but exposes no launch()');

let getter;
try {
  getter = req('pixiv-token-getter');
} catch (error) {
  fail('pixiv-token-getter is not resolvable: ' + error.message);
}
if (typeof getter.findBrowserExecutable !== 'function') fail('findBrowserExecutable is not exported');
if (typeof getter.browserNotFoundMessage !== 'function') fail('browserNotFoundMessage is not exported');
const guidance = getter.browserNotFoundMessage();
if (typeof guidance !== 'string' || guidance.length < 40) {
  fail('the missing-browser message is not actionable guidance');
}

let launchModule;
try {
  launchModule = req(path.join(pkgRoot, 'dist', 'puppeteer-login-adapter', 'browser-launch.js'));
} catch (error) {
  fail('the login browser layer failed to load: ' + error.message);
}
if (typeof launchModule.launchSystemBrowser !== 'function') {
  fail('launchSystemBrowser is not exported by the login browser layer');
}

// A browser executable that cannot exist. Launching it walks the real runtime path
// (loadPuppeteerCore -> launchSystemBrowser -> core.launch) and must fail as a browser
// launch error -- never as a missing module, which is what a devDependency leak looks like.
const missingBrowser = path.join(pkgRoot, '__pixivflow_no_such_browser__');
launchModule
  .launchSystemBrowser({ executablePath: missingBrowser })
  .then(() => fail('launching a non-existent browser unexpectedly succeeded'))
  .catch((error) => {
    const message = String((error && error.message) || error);
    if (/MODULE_NOT_FOUND|Cannot find module/.test(message)) {
      fail('the login layer still depends on a module the install does not ship: ' + message);
    }
    if (/puppeteer-core is missing from this installation/.test(message)) {
      fail('puppeteer-core did not resolve at runtime: ' + message);
    }
    const discovered = getter.findBrowserExecutable();
    process.stdout.write(
      'LOGIN_BOOTSTRAP_OK: ' +
        JSON.stringify({
          puppeteerCore: true,
          systemBrowser: discovered ? path.basename(discovered) : 'none-in-this-environment',
          guidanceChars: guidance.length,
          launchFailureClass: (error && error.constructor && error.constructor.name) || 'Error',
        }) +
        '\\n'
    );
    process.exit(0);
  });
`;

step('login bootstrap (browser layer loads + resolves from the artifact)', () => {
  const pkgRoot = installedPkgRoot();
  const probePath = path.join(tmp, 'login-bootstrap-probe.cjs');
  fs.writeFileSync(probePath, LOGIN_BOOTSTRAP_PROBE);

  const res = run(process.execPath, [probePath, pkgRoot], { cwd: tmp, timeout: 120_000 });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  const failureLine = output.split('\n').find((line) => line.startsWith('LOGIN_BOOTSTRAP_FAIL:'));
  if (failureLine) throw new Error(failureLine.slice('LOGIN_BOOTSTRAP_FAIL: '.length));
  const okLine = output.split('\n').find((line) => line.startsWith('LOGIN_BOOTSTRAP_OK:'));
  if (!okLine) {
    throw new Error(`probe produced no verdict:\n${output.slice(0, 400)}`);
  }
  return okLine.slice('LOGIN_BOOTSTRAP_OK: '.length);
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
