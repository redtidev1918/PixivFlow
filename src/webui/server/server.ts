/**
 * WebUI Server Architecture
 * 
 * This module implements the Express.js-based WebUI server for PixivFlow.
 * 
 * Architecture Overview:
 * - Structure:
 *   - routes/     : API endpoints (RESTful) - auth, config, download, stats, logs, files
 *   - services/   : Business logic layer (handled by existing modules)
 *   - middleware/ : Request processing (CORS, body parsing, error handling)
 *   - websocket/  : Real-time communication (logs, download status)
 *   - server/     : Server setup and configuration
 * 
 * - Request Flow:
 *   Request → Middleware → Route Handler → Service/Business Logic → Database/FileSystem → Response
 * 
 * - Real-time Communication:
 *   WebSocket (Socket.IO) for streaming logs and download status updates
 * 
 * - Static File Serving:
 *   Serves the React frontend build when STATIC_PATH is configured
 * 
 * @see src/webui/routes/ for API route definitions
 * @see src/webui/websocket/ for WebSocket handlers
 * @see webui-frontend/ for the React frontend application
 */

import express, { Express } from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { logger } from '../../logger';
import { Database } from '../../storage/Database';
import { loadConfig, getConfigPath } from '../../config';

// WebSocket handlers
import { setupLogStream } from '../websocket/LogStream';

// Server setup modules
import { setupMiddleware, errorHandler } from './server-middleware';
import { setupRoutes } from './server-routes';
import { setupStaticFiles } from './server-static';
import { findAvailablePort, logServerStart, logServerError } from './server-utils';
import { PORTS } from '../ports';
import { WebUIServerOptions } from './types';

export { WebUIServerOptions } from './types';

export class WebUIServer {
  private app: Express;
  private server: ReturnType<typeof createServer>;
  private io: SocketServer;
  private port: number;
  private host: string;

  public getPort(): number {
    return this.port;
  }

  constructor(options: WebUIServerOptions = {}) {
    this.port = options.port || (process.env.PORT ? parseInt(process.env.PORT, 10) : PORTS.PROD_API);
    this.host = options.host || 'localhost';

    // Initialize Express app
    this.app = express();

    // Setup middleware
    setupMiddleware(this.app, options);

    // Setup API routes
    setupRoutes(this.app);

    // Setup static file serving
    setupStaticFiles(this.app, options.staticPath);

    // Error handler (must be last)
    this.app.use(errorHandler);

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

  public async start(): Promise<number> {
    return new Promise(async (resolve, reject) => {
      let actualPort = this.port;

      // Try to start on the requested port
      this.server.listen(this.port, this.host, () => {
        logServerStart(this.host, actualPort);
        resolve(actualPort);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          const errorMsg = `Port ${this.port} is already in use. Please free up the port or specify another one.`;
          logger.error(errorMsg);
          logServerError(errorMsg);
          reject(new Error(errorMsg));
        } else {
          logServerError(err.message);
          reject(err);
        }
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
export async function startWebUI(
  options?: WebUIServerOptions
): Promise<number> {
  // Initialize database to ensure tables exist
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    // Set up log file path (use data directory from database path for Electron app)
    let logPath: string;
    if (
      config.storage?.databasePath &&
      path.isAbsolute(config.storage.databasePath)
    ) {
      const dataDir = path.dirname(config.storage.databasePath);
      logPath = path.join(dataDir, 'pixiv-downloader.log');
    } else {
      logPath = path.join(process.cwd(), 'data', 'pixiv-downloader.log');
    }
    logger.setLogPath(logPath);
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
  const actualPort = await server.start();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down WebUI server...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return actualPort;
}

