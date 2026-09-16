import { Request, Response } from 'express';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { gzipSync } from 'node:zlib';
import { logger } from '../../../logger';
import { loadConfig, getConfigPath } from '../../../config';

function logDir(): string {
  const config = loadConfig(getConfigPath());
  if (config.storage?.databasePath && (config.storage.databasePath as string).startsWith('/')) {
    return dirname(config.storage.databasePath);
  }
  const candidate = join(process.cwd(), 'data');
  return existsSync(candidate) ? candidate : dirname(join(process.cwd(), 'data', 'pixiv-downloader.log'));
}

function parseOrRaw(line: string): { parsed?: Record<string, unknown>; raw: string } {
  try { return { parsed: JSON.parse(line), raw: line }; } catch { return { raw: line }; }
}

function matchesFilter(
  line: string,
  q: { service?: string; bot_id?: string; level?: string; stage?: string; from?: string; to?: string }
): boolean {
  const { parsed, raw } = parseOrRaw(line);
  const val = (key: string): unknown => (parsed ? parsed[key] : undefined);
  const timestamp = (parsed?.timestamp as string) ?? raw.match(/\[([\d\-T:.]+Z)\]/)?.[1] ?? '';

  if (q.service && !(val('service') === q.service || raw.includes(q.service))) return false;
  if (q.bot_id && !(val('bot_id') === q.bot_id || raw.includes(q.bot_id))) return false;
  if (q.stage && !(val('stage') === q.stage || raw.includes(q.stage))) return false;
  if (q.level) {
    const lvl = val('level');
    if (lvl) { if (String(lvl).toLowerCase() !== q.level.toLowerCase()) return false; }
    else if (!raw.includes(`[${q.level.toUpperCase()}]`)) return false;
  }
  if (q.from && timestamp && timestamp < q.from) return false;
  if (q.to && timestamp && timestamp > q.to) return false;
  return true;
}

function fileInfo(full: string) {
  const st = statSync(full);
  return { name: full.split('/').pop(), size: st.size, updated: st.mtime.toISOString() };
}

/** GET /admin/logs — list log files (size + mtime) in the data dir. */
export async function getAdminLogs(_req: Request, res: Response): Promise<void> {
  try {
    const dir = logDir();
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { names = []; }
    const files = names
      .filter((n) => /^pixiv-downloader.*\.(log|gz)$/.test(n))
      .map((n) => fileInfo(join(dir, n)))
      .sort((a, b) => b.updated.localeCompare(a.updated));
    res.json({ files });
  } catch (error) {
    logger.error('admin logs list failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'list failed' });
  }
}

/** GET /admin/logs/download[?service=&bot_id=&level=&stage=&from=&to=&file=] */
export async function downloadLogs(req: Request, res: Response): Promise<void> {
  try {
    const requested = String(req.query.file ?? '');
    const file = requested && !requested.includes('/') && !requested.includes('..') ? requested : 'pixiv-downloader.log';
    const full = join(logDir(), file);
    if (!existsSync(full)) { res.status(404).json({ error: `log file not found: ${file}` }); return; }
    const lines = readFileSync(full, 'utf-8').split('\n').filter((l) => l.trim());
    const filtered = lines.filter((l) => matchesFilter(l, {
      service: req.query.service ? String(req.query.service) : undefined,
      bot_id: req.query.bot_id ? String(req.query.bot_id) : undefined,
      level: req.query.level ? String(req.query.level) : undefined,
      stage: req.query.stage ? String(req.query.stage) : undefined,
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
    }));
    const gz = gzipSync(filtered.join('\n') + (filtered.length ? '\n' : ''));
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${file}.filtered.gz"`);
    res.send(gz);
  } catch (error) {
    logger.error('admin logs download failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'download failed' });
  }
}
