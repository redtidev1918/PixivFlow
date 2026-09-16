import { Request, Response } from 'express';
import { Database } from '../../../storage/Database';
import { loadConfig, getConfigPath } from '../../../config';
import { logger } from '../../../logger';

function db(): Database {
  const config = loadConfig(getConfigPath());
  const database = new Database(config.storage!.databasePath!);
  database.migrate();
  return database;
}

/** GET /admin/system-errors?limit=&error_type=&bot_id=&stage=&resolved=&from=&to= */
export async function listSystemErrors(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    database = db();
    const rows = database.systemErrors.list({
      limit: Number(req.query.limit ?? 50),
      errorType: req.query.error_type ? String(req.query.error_type) : undefined,
      botId: req.query.bot_id ? String(req.query.bot_id) : undefined,
      stage: req.query.stage ? String(req.query.stage) : undefined,
      resolved: req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined,
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
    });
    res.json({ data: rows });
  } catch (error) {
    logger.error('list system errors failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'list failed' });
  } finally {
    database?.close();
  }
}

/** POST /admin/system-errors/:id/resolve */
export async function resolveSystemError(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'invalid id' }); return; }
    database = db();
    const result = database.systemErrors.markResolved(id);
    res.json({ success: result.changes > 0, changes: result.changes });
  } catch (error) {
    logger.error('resolve system error failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'resolve failed' });
  } finally {
    database?.close();
  }
}
