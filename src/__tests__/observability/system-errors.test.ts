import { Database } from '../../storage/Database';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classifySystemError } from '../../observability';
import { logger } from '../../logger';

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-obs-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('system_errors observability', () => {
  it('records, lists and resolves structured errors', () => {
    withDb((db) => {
      db.systemErrors.record({
        service: 'pixivflow', bot_id: 'bot1', schedule_id: 'bot1-daily',
        slot_id: 'bot1-daily@2026-09-16T2200', stage: 'pixiv_download',
        error_type: 'PIXIV_RATE_LIMITED', message: 'rate limit', http_status: 429, retryable: true,
      });
      const rows = db.systemErrors.list({ botId: 'bot1' });
      expect(rows).toHaveLength(1);
      expect(rows[0].error_type).toBe('PIXIV_RATE_LIMITED');
      expect(db.systemErrors.countSince('bot1', 24)).toBe(1);
      const resolved = db.systemErrors.markResolved(rows[0].id);
      expect(resolved.changes).toBe(1);
      expect(db.systemErrors.list({ resolved: false })).toHaveLength(0);
      expect(db.systemErrors.list({ resolved: true })).toHaveLength(1);
    });
  });

  it('classifies 429 vs auth vs not-found correctly', () => {
    expect(classifySystemError(new Error('rate limit'), 429)).toEqual({ error_type: 'PIXIV_RATE_LIMITED', retryable: true });
    expect(classifySystemError(new Error('token expired login required'))).toEqual({ error_type: 'PIXIV_AUTH_FAILED', retryable: false });
    expect(classifySystemError(new Error('not found'), 404)).toEqual({ error_type: 'PIXIV_NOT_FOUND', retryable: false });
    expect(classifySystemError(new Error('operation aborted'), null, 'pixiv_download')).toEqual({ error_type: 'NETWORK_TIMEOUT', retryable: true });
  });

  it('emits JSON log lines when format is json', () => {
    const logs: string[] = [];
    const origWrite = console.info;
    console.info = (line: unknown) => logs.push(String(line));
    logger.setFormat('json');
    logger.runWithContext({ bot_id: 'bot1', stage: 'download' }, () => {
      logger.info('download_started', { pixiv_id: '123' });
    });
    logger.setFormat('text');
    console.info = origWrite;
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed).toMatchObject({ level: 'info', message: 'download_started', bot_id: 'bot1', stage: 'download', pixiv_id: '123' });
  });
});
