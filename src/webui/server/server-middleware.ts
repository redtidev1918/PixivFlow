import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { logger } from '../../logger';
import { WebUIServerOptions } from './types';

/**
 * Setup middleware for Express app
 */
export function setupMiddleware(app: Express, options: WebUIServerOptions): void {
  // JSON and URL-encoded body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS configuration
  if (options.enableCors !== false) {
    app.use(
      cors({
        origin: options.corsOrigin || '*',
        credentials: true,
      })
    );
  }

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    next();
  });
}

/**
 * Error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('API Error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

