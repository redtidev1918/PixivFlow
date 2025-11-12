import { logger } from '../../logger';

/**
 * Find an available port starting from the given port
 */
export async function findAvailablePort(
  startPort: number,
  host: string,
  maxAttempts: number = 10
): Promise<number> {
  const net = require('net');

  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = net.createServer();

      server.listen(port, host, () => {
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });

      // Timeout after 1 second
      setTimeout(() => {
        server.removeAllListeners();
        server.close();
        resolve(false);
      }, 1000);
    });

    if (isAvailable) {
      return port;
    }
  }

  throw new Error(
    `Could not find an available port after ${maxAttempts} attempts starting from ${startPort}`
  );
}

/**
 * Log server startup message
 */
export function logServerStart(host: string, port: number): void {
  const message = `WebUI server started on http://${host}:${port}`;
  logger.info(message);
  // Also output to stdout for Electron detection
  console.log(`[WebUI] ${message}`);
  console.log(`[WebUI] Server ready`);
  console.log(`[WebUI] PORT: ${port}`); // Output actual port for Electron detection
}

/**
 * Log server error message
 */
export function logServerError(error: string): void {
  logger.error('Server error', { error });
  console.error(`[WebUI] ERROR: ${error}`);
}

















































