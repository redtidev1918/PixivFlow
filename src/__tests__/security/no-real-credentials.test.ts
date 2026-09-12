/**
 * SECURITY GUARD — real credentials must never enter the repository again.
 *
 * This test is a permanent, offline regression gate implementing the
 * "synthetic test credentials" control from the SEV-1 remediation:
 *
 *   1. No Telegram Bot API token shape and no long-lived Pixiv refreshToken
 *      literal may appear in TRACKED files unless it is unmistakably synthetic.
 *   2. Known compromised values are blocked by sha256 fingerprint, so the
 *      secret itself never has to be written down to keep it out.
 *   3. A workflow may never archive or publish a rotated-credential path —
 *      that is exactly how the Pixiv refresh token leaked via Actions storage.
 *
 * The file list comes from `git ls-files`, so a developer's local, gitignored
 * config is out of scope: this guard is about what is *committed*.
 *
 * Nothing here ever prints a matched value: findings are reported as
 * `<REDACTED>` + `sha256:<digest>` only.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SELF_RELATIVE = 'src/__tests__/security/no-real-credentials.test.ts';

/** Telegram Bot API token: <bot_id 8-10 digits>:<35 char body>. */
const TELEGRAM_TOKEN = /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g;
/** Telegram supergroup / channel id. */
const TELEGRAM_CHAT_ID = /-100\d{10,}/g;
/** A refresh token literal: `"refreshToken": "<30+ url-safe chars>"`. */
const PIXIV_REFRESH_TOKEN = /"?refresh[_-]?token"?\s*[:=]\s*["']([A-Za-z0-9_-]{30,})["']/gi;

/**
 * sha256 fingerprints of credentials confirmed compromised during the
 * 2026-09-12 SEV-1 incident. Secrets are revoked; only the digest is kept.
 */
const COMPROMISED_SHA256 = new Set<string>([
  '57d41efb367ef1a8a2db263abb1c080a9067611b09f9ee072b9fb4eaaa5511d0', // bot token historically committed as a test fixture
  '489e0fb128cf777f892e0c5bec11123f12cc8526c5b9f60c0935c12a956d2404', // production chat id
  'fd9ea6f06073b3e3d6f3ec7ca43e15849032c7b501de276c2a6025657a9273c7', // Pixiv refresh token found in a local config copy
  '722c05473f2ad7d215c73d5a0959dc5b8b6c0f4deba81a62c3839ea7e02ab414', // Pixiv refresh token leaked via a sibling repo's public git history
]);

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** A token body is synthetic when it is obviously not a live credential. */
function isSyntheticTokenBody(body: string): boolean {
  if (/^(A{35}|a{35}|X{35}|0{35})$/.test(body)) return true;
  return /EXAMPLE|SYNTHETIC|FAKE|DUMMY|PLACEHOLDER|NOT_A_REAL|REDACTED|^test\d+$/i.test(body);
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', 'logs', 'cache', 'downloads']);
const TEXT_EXT = new Set([
  '.ts',
  '.js',
  '.cjs',
  '.mjs',
  '.json',
  '.yml',
  '.yaml',
  '.sh',
  '.md',
  '.txt',
]);

function isTextFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && TEXT_EXT.has(name.slice(dot));
}

/** Committed files only — a developer's local, ignored secrets are out of scope. */
function listTrackedFiles(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'buffer' });
    return out
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .filter(isTextFile);
  } catch {
    return walk(REPO_ROOT)
      .map((file) => relative(REPO_ROOT, file).split(sep).join('/'))
      .filter(isTextFile);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (isTextFile(entry)) {
      out.push(full);
    }
  }
  return out;
}

interface Finding {
  file: string;
  line: number;
  fingerprint: string;
  reason: string;
}

function scan(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (file === SELF_RELATIVE) continue;
    let content: string;
    try {
      content = readFileSync(join(REPO_ROOT, file), 'utf8');
    } catch {
      continue;
    }
    content.split(/\r?\n/).forEach((line, index) => {
      const consider = (value: string, shape: 'bot-token' | 'chat-id' | 'refresh-token'): void => {
        const digest = sha256(value);
        if (COMPROMISED_SHA256.has(digest)) {
          findings.push({ file, line: index + 1, fingerprint: `sha256:${digest}`, reason: 'known compromised credential' });
          return;
        }
        if (shape === 'bot-token' && !isSyntheticTokenBody(value.slice(value.indexOf(':') + 1))) {
          findings.push({ file, line: index + 1, fingerprint: `sha256:${digest}`, reason: 'real-looking bot token committed' });
          return;
        }
        if (shape === 'refresh-token' && !/EXAMPLE|SYNTHETIC|FAKE|DUMMY|PLACEHOLDER|NOT_A_REAL|REDACTED|^test\d+$|^A{30,}$/i.test(value)) {
          findings.push({ file, line: index + 1, fingerprint: `sha256:${digest}`, reason: 'real-looking refresh token committed' });
        }
      };

      for (const match of line.match(TELEGRAM_TOKEN) ?? []) consider(match, 'bot-token');
      for (const match of line.match(TELEGRAM_CHAT_ID) ?? []) consider(match, 'chat-id');
      PIXIV_REFRESH_TOKEN.lastIndex = 0;
      let refresh: RegExpExecArray | null;
      while ((refresh = PIXIV_REFRESH_TOKEN.exec(line)) !== null) consider(refresh[1], 'refresh-token');
    });
  }
  return findings;
}

describe('security guard: no real credentials committed to the repository', () => {
  const files = listTrackedFiles();
  const render = (findings: Finding[]): string[] =>
    findings.map((f) => `${f.file}:${f.line} <REDACTED> ${f.fingerprint} (${f.reason})`);

  it('scans a non-trivial number of committed files (guard is actually running)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('contains no real-looking or known-compromised credentials', () => {
    expect(render(scan(files))).toEqual([]);
  });
});

describe('security guard: workflows never publish rotated credentials', () => {
  const workflowDir = join(REPO_ROOT, '.github', 'workflows');

  it('no workflow archives or publishes a rotated-token / rotated-credential path', () => {
    if (!existsSync(workflowDir)) return;
    const offenders: string[] = [];
    for (const entry of readdirSync(workflowDir)) {
      if (!/\.ya?ml$/.test(entry)) continue;
      const content = readFileSync(join(workflowDir, entry), 'utf8');
      const touchesRotatedPath = /rotated[-_]?(token|credential)/i.test(content);
      const publishes = /upload-artifact|actions\/cache|gh\s+release|git\s+add/i.test(content);
      if (touchesRotatedPath && publishes) offenders.push(entry);
    }
    expect(offenders).toEqual([]);
  });
});
