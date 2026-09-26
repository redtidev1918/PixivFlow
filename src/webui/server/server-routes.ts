import { Express, Request, Response } from 'express';
import { runtimeMeta } from './runtime-meta';

// Routes
import authRoutes from '../routes/auth';
import configRoutes from '../routes/config';
import downloadRoutes from '../routes/download';
import statsRoutes from '../routes/stats';
import logsRoutes from '../routes/logs';
import adminLogsRoutes from '../routes/admin-logs';
import systemErrorsRoutes from '../routes/system-errors';
import filesRoutes from '../routes/files';
import schedulerRoutes from '../routes/scheduler';

/**
 * Setup API routes for Express app
 */
export function setupRoutes(app: Express): void {
  // Health check
  // Both /api/health and /health are provided: the alias keeps container
  // healthchecks and reverse proxies simple (same payload on both).
  const healthHandler = (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  };

  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

  // Runtime Contract: process/runtime liveness+version facts.
  // Both /api/... and /... aliases are provided, mirroring the health pattern.
  // Payloads are deliberately non-sensitive (no downloads, tokens or config),
  // which is why they sit alongside the healthcheck in the auth-exempt path set.
  const statusHandler = (_req: Request, res: Response) => {
    const meta = runtimeMeta();
    res.json({
      schemaVersion: 1,
      state: 'ok',
      pid: process.pid,
      startedAt: meta.startedAt.toISOString(),
      uptimeSec: Math.round(process.uptime()),
      version: meta.version,
    });
  };

  const versionHandler = (_req: Request, res: Response) => {
    const meta = runtimeMeta();
    res.json({ schemaVersion: 1, name: meta.name, version: meta.version });
  };

  app.get('/api/status', statusHandler);
  app.get('/status', statusHandler);
  app.get('/api/version', versionHandler);
  app.get('/version', versionHandler);

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/download', downloadRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/logs', logsRoutes);
  // Admin observability API (protected by WebUI basic auth when enabled).
  app.use('/admin/logs', adminLogsRoutes);
  app.use('/admin/system-errors', systemErrorsRoutes);
  app.use('/api/files', filesRoutes);
  // WebUI Control Center Phase 1: read-only scheduler projection.
  app.use('/api/scheduler', schedulerRoutes);
}
