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
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'fs';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { logger } from '../../logger';
import { Database } from '../../storage/Database';
import { loadConfig, getConfigPath } from '../../config';

// WebSocket handlers
import { setupLogStream } from '../websocket/LogStream';
import { setupDownloadStatus } from '../websocket/DownloadStatus';
import { createBasicAuthMiddleware, verifyBasicAuth } from './auth-middleware';

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
  private basicAuthEnabled = false;
  private basicAuth?: { username: string; password: string };
  private tlsScheme: 'http' | 'https' = 'http';

  public getPort(): number {
    return this.port;
  }

  constructor(options: WebUIServerOptions = {}) {
    this.port = options.port || (process.env.PORT ? parseInt(process.env.PORT, 10) : PORTS.PROD_API);
    this.host = options.host || 'localhost';

    // TLS opt-in via WEBUI_TLS_CERT / WEBUI_TLS_KEY (both required)
    const tlsCertPath = process.env.WEBUI_TLS_CERT;
    const tlsKeyPath = process.env.WEBUI_TLS_KEY;
    if (tlsCertPath && tlsKeyPath) {
      options = { ...options, tls: { certPath: tlsCertPath, keyPath: tlsKeyPath } };
      this.tlsScheme = 'https';
    }

    // Initialize Express app
    this.app = express();

    // Setup middleware
    setupMiddleware(this.app, options);

    // Optional HTTP Basic Auth (opt-in via WEBUI_USERNAME + WEBUI_PASSWORD).
    // Covers API routes, static files and Socket.IO handshakes; health checks
    // stay open so container healthchecks keep working.
    const authUser = process.env.WEBUI_USERNAME;
    const authPass = process.env.WEBUI_PASSWORD;
    if (authUser && authPass) {
      this.basicAuthEnabled = true;
      this.basicAuth = { username: authUser, password: authPass };
      logger.info('WebUI basic auth enabled');
      this.app.use(
        createBasicAuthMiddleware({
          username: authUser,
          password: authPass,
          exemptPaths: ['/api/health', '/health'],
        })
      );
    } else {
      logger.warn(
        'WebUI authentication is DISABLED (set WEBUI_USERNAME and WEBUI_PASSWORD to enable basic auth)'
      );
    }

    // Setup API routes
    setupRoutes(this.app);

    // Setup static file serving
    setupStaticFiles(this.app, options.staticPath);

    // Error handler (must be last)
    this.app.use(errorHandler);

    // Create HTTP or HTTPS server (TLS opt-in via WEBUI_TLS_CERT/KEY)
    if (options.tls) {
      try {
        this.server = createHttpsServer(
          {
            cert: readFileSync(options.tls.certPath),
            key: readFileSync(options.tls.keyPath),
          },
          this.app
        );
        logger.info('WebUI TLS enabled', {
          certPath: options.tls.certPath,
          keyPath: options.tls.keyPath,
        });
      } catch (error) {
        logServerError(
          `Failed to load TLS certificate/key: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    } else {
      this.server = createServer(this.app);
    }

    // Initialize Socket.IO
    this.io = new SocketServer(this.server, {
      cors: {
        origin: options.corsOrigin || '*',
        credentials: true,
      },
    });

    // Setup WebSocket handlers
    setupLogStream(this.io);
    setupDownloadStatus(this.io);

    // Socket.IO handshake guard (mirrors the HTTP basic auth above)
    if (this.basicAuth) {
      const ba = this.basicAuth;
      this.io.use((socket, next) => {
        if (
          verifyBasicAuth(
            socket.handshake.headers.authorization,
            ba.username,
            ba.password
          )
        ) {
          next();
        } else {
          next(new Error('WebUI authentication required'));
        }
      });
    }
  }

  public async start(): Promise<number> {
    return new Promise(async (resolve, reject) => {
      let actualPort = this.port;

      // Opt-in automatic port fallback: PIXIV_WEBUI_AUTO_PORT=true picks the
      // next free port instead of failing on EADDRINUSE.
      if (process.env.PIXIV_WEBUI_AUTO_PORT === 'true') {
        try {
          const available = await findAvailablePort(this.port, this.host);
          if (available !== this.port) {
            logger.warn(`Port ${this.port} busy; falling back to ${available} (PIXIV_WEBUI_AUTO_PORT)`, {
              requestedPort: this.port,
              actualPort: available,
            });
          }
          actualPort = available;
          this.port = available;
        } catch (error) {
          logServerError(error instanceof Error ? error.message : String(error));
          reject(error);
          return;
        }
      }

      // Try to start on the resolved port
      this.server.listen(actualPort, this.host, () => {
        logServerStart(this.host, actualPort, this.tlsScheme);
        resolve(actualPort);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          const errorMsg = `Port ${this.port} is already in use. Free the port, pass --port/-e PORT, or set PIXIV_WEBUI_AUTO_PORT=true to pick the next free port automatically.`;
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

