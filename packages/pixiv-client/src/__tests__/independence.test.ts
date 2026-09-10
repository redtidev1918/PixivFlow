import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';

/**
 * Architectural guard: the kit must stay independent of PixivFlow.
 * The package lives in a workspace but may only depend on its own declared
 * deps; any import reaching into the host product breaks reuse/split-out.
 */
describe('kit independence', () => {
  const root = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
  };
  const srcRoot = root; // __dirname/.. is src/ under ts-jest
  walk(srcRoot);

  it('never imports PixivFlow product symbols', () => {
    const forbiddenSubstrings = [
      'TargetConfig',
      'StandaloneConfig',
      'better-sqlite3',
      'puppeteer',
      'playwright',
    ];
    const violations: string[] = [];
    for (const file of files) {
      const rel = file.replace(root, '.');
      // Strip comments: JSDoc deliberately names forbidden host concepts to
      // document the boundary; the guard is about real code/imports.
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const banned of forbiddenSubstrings) {
        if (src.includes(banned)) violations.push(`${rel} references ${banned}`);
      }
      for (const m of src.matchAll(/from\s+['"](\.[^'"]*)['"]/g)) {
        const resolved = resolve(dirname(file), m[1]);
        const inside = relative(srcRoot, resolved);
        if (inside.startsWith('..')) {
          violations.push(`${rel} relative import escapes src: ${m[1]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('declares every runtime dependency it imports', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...BUILTINS]);
    const missing = new Set<string>();
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'".][^'"]*)['"]/g)) {
        let spec = m[1];
        if (spec.startsWith('node:')) continue; // node builtin
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        if (!declared.has(name)) missing.add(name);
      }
    }
    expect([...missing]).toEqual([]);
  });
});

const BUILTINS = new Set([
  'crypto', 'events', 'fs', 'http', 'https', 'net', 'os', 'path',
  'stream', 'timers', 'url', 'util', 'zlib',
]);
