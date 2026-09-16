import { Express, Request, Response } from 'express';

// Routes
import authRoutes from '../routes/auth';
import configRoutes from '../routes/config';
import downloadRoutes from '../routes/download';
import statsRoutes from '../routes/stats';
import logsRoutes from '../routes/logs';
import adminLogsRoutes from '../routes/admin-logs';
import systemErrorsRoutes from '../routes/system-errors';
import filesRoutes from '../routes/files';

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
}































































