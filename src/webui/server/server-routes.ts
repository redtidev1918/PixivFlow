import express, { Express, Request, Response } from 'express';

// Routes
import authRoutes from '../routes/auth';
import configRoutes from '../routes/config';
import downloadRoutes from '../routes/download';
import statsRoutes from '../routes/stats';
import logsRoutes from '../routes/logs';
import filesRoutes from '../routes/files';

/**
 * Setup API routes for Express app
 */
export function setupRoutes(app: Express): void {
  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/download', downloadRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/logs', logsRoutes);
  app.use('/api/files', filesRoutes);
}































































