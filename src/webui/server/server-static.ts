import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { logger } from '../../logger';

/**
 * Setup static file serving for SPA frontend
 */
export function setupStaticFiles(app: Express, staticPath?: string): void {
  if (!staticPath) {
    // Root path handler when static files are not configured
    app.get('/', (req: Request, res: Response) => {
      res.json({
        message: 'PixivFlow WebUI API Server',
        version: '2.0.0',
        endpoints: {
          health: '/api/health',
          auth: '/api/auth',
          config: '/api/config',
          download: '/api/download',
          stats: '/api/stats',
          logs: '/api/logs',
          files: '/api/files',
        },
        note: 'Frontend is not configured. To serve the frontend, set STATIC_PATH environment variable or run in development mode with separate frontend server on port 5173.',
      });
    });
    return;
  }

  const resolvedStaticPath = path.resolve(staticPath);
  const indexPath = path.join(resolvedStaticPath, 'index.html');

  // Verify static path and index.html exist
  if (!fs.existsSync(resolvedStaticPath)) {
    logger.warn('Static path does not exist', { path: resolvedStaticPath });
  } else if (!fs.existsSync(indexPath)) {
    logger.warn('index.html not found in static path', {
      path: resolvedStaticPath,
      indexPath,
    });
  } else {
    logger.info('Serving static files', { path: resolvedStaticPath });
  }

  // Serve static files (CSS, JS, images, etc.)
  app.use(
    express.static(resolvedStaticPath, {
      index: false, // We'll handle index.html explicitly
      maxAge: '1d', // Cache static assets for 1 day
    })
  );

  // Explicitly handle root path first
  app.get('/', (req: Request, res: Response, next: NextFunction) => {
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath, (err) => {
        if (err) {
          logger.error('Failed to send index.html for root path', {
            error: err.message,
            path: indexPath,
          });
          next(err);
        }
      });
    } else {
      logger.warn('index.html not found, cannot serve frontend', {
        path: indexPath,
      });
      next();
    }
  });

  // SPA fallback - handle all non-API routes (for client-side routing)
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    // Skip if already handled (shouldn't happen, but safety check)
    if (req.path === '/') {
      return next();
    }
    // Send index.html for all other routes (SPA routing)
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath, (err) => {
        if (err) {
          logger.error('Failed to send index.html for SPA route', {
            error: err.message,
            path: indexPath,
            requestedPath: req.path,
          });
          next(err);
        }
      });
    } else {
      next();
    }
  });
}















