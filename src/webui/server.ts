import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { logger } from '../logger';
import { Database } from '../storage/Database';
import { loadConfig, getConfigPath } from '../config';

// Routes
import authRoutes from './routes/auth';
import configRoutes from './routes/config';
import downloadRoutes from './routes/download';
import statsRoutes from './routes/stats';
import logsRoutes from './routes/logs';
import filesRoutes from './routes/files';

// WebSocket handlers
import { setupLogStream } from './websocket/LogStream';

export interface WebUIServerOptions {
  port?: number;
  host?: string;
  enableCors?: boolean;
  corsOrigin?: string | string[];
  staticPath?: string;
}

export class WebUIServer {
  private app: Express;
  private server: ReturnType<typeof createServer>;
  private io: SocketServer;
  private port: number;
  private host: string;

  constructor(options: WebUIServerOptions = {}) {
    this.port = options.port || 3000;
    this.host = options.host || 'localhost';

    // Initialize Express app
    this.app = express();

    // Middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS configuration
    if (options.enableCors !== false) {
      this.app.use(
        cors({
          origin: options.corsOrigin || '*',
          credentials: true,
        })
      );
    }

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      next();
    });

    // API routes
    this.setupRoutes();

    // Serve static files (frontend build)
    if (options.staticPath) {
      const staticPath = path.resolve(options.staticPath);
      const indexPath = path.join(staticPath, 'index.html');
      
      // Verify static path and index.html exist
      if (!fs.existsSync(staticPath)) {
        logger.warn('Static path does not exist', { path: staticPath });
      } else if (!fs.existsSync(indexPath)) {
        logger.warn('index.html not found in static path', { path: staticPath, indexPath });
      } else {
        logger.info('Serving static files', { path: staticPath });
      }

      // Serve static files (CSS, JS, images, etc.)
      this.app.use(express.static(staticPath, {
        index: false, // We'll handle index.html explicitly
        maxAge: '1d', // Cache static assets for 1 day
      }));

      // Explicitly handle root path first
      this.app.get('/', (req: Request, res: Response, next: NextFunction) => {
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath, (err) => {
            if (err) {
              logger.error('Failed to send index.html for root path', { 
                error: err.message, 
                path: indexPath 
              });
              next(err);
            }
          });
        } else {
          logger.warn('index.html not found, cannot serve frontend', { path: indexPath });
          next();
        }
      });

      // SPA fallback - handle all non-API routes (for client-side routing)
      this.app.get('*', (req: Request, res: Response, next: NextFunction) => {
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
                requestedPath: req.path
              });
              next(err);
            }
          });
        } else {
          next();
        }
      });
    } else {
      // Root path handler when static files are not configured
      this.app.get('/', (req: Request, res: Response) => {
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
    }

    // Error handler (must be last)
    this.app.use(this.errorHandler);

    // Create HTTP server
    this.server = createServer(this.app);

    // Initialize Socket.IO
    this.io = new SocketServer(this.server, {
      cors: {
        origin: options.corsOrigin || '*',
        credentials: true,
      },
    });

    // Setup WebSocket handlers
    setupLogStream(this.io);
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/config', configRoutes);
    this.app.use('/api/download', downloadRoutes);
    this.app.use('/api/stats', statsRoutes);
    this.app.use('/api/logs', logsRoutes);
    this.app.use('/api/files', filesRoutes);
  }

  private errorHandler(
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

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, () => {
        const message = `WebUI server started on http://${this.host}:${this.port}`;
        logger.info(message);
        // 同时输出到 stdout，方便 Electron 检测
        console.log(`[WebUI] ${message}`);
        console.log(`[WebUI] Server ready`);
        resolve();
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          const errorMsg = `Port ${this.port} is already in use`;
          logger.error(errorMsg);
          console.error(`[WebUI] ERROR: ${errorMsg}`);
        } else {
          logger.error('Server error', { error: err.message });
          console.error(`[WebUI] ERROR: ${err.message}`);
        }
        reject(err);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close(() => {
        this.server.close(() => {
          logger.info('WebUI server stopped');
          resolve();
        });
      });
    });
  }

  public getApp(): Express {
    return this.app;
  }

  public getIO(): SocketServer {
    return this.io;
  }
}

/**
 * Start WebUI server
 */
export async function startWebUI(options?: WebUIServerOptions): Promise<void> {
  // Set up log file path
  const logPath = path.join(process.cwd(), 'data', 'pixiv-downloader.log');
  logger.setLogPath(logPath);

  // Initialize database to ensure tables exist
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    if (config.storage?.databasePath) {
      const database = new Database(config.storage.databasePath);
      database.migrate();
      database.close();
      logger.info('Database initialized successfully');
    }
  } catch (error) {
    logger.warn('Failed to initialize database at startup', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Continue startup even if database initialization fails
    // Routes will handle database initialization on their own
  }

  const server = new WebUIServer(options);
  await server.start();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down WebUI server...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

