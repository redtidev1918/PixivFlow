import { Server as SocketServer, Socket } from 'socket.io';
import { logger } from '../../logger';
import { createReadStream, existsSync, watchFile, unwatchFile } from 'fs';
import { join, isAbsolute, dirname } from 'path';
import { loadConfig, getConfigPath } from '../../config';
import readline from 'readline';

interface LogStreamOptions {
  logPath?: string;
  maxLines?: number;
}

export function setupLogStream(io: SocketServer, options: LogStreamOptions = {}): void {
  // Get log path from config if not provided (use data directory from database path for Electron app)
  let logPath: string;
  if (options.logPath) {
    logPath = options.logPath;
  } else {
    try {
      const configPath = getConfigPath();
      const config = loadConfig(configPath);
      if (config.storage?.databasePath && isAbsolute(config.storage.databasePath)) {
        const dataDir = dirname(config.storage.databasePath);
        logPath = join(dataDir, 'pixiv-downloader.log');
      } else {
        logPath = join(process.cwd(), 'data', 'pixiv-downloader.log');
      }
    } catch (error) {
      // Fallback to default if config loading fails
      logPath = join(process.cwd(), 'data', 'pixiv-downloader.log');
    }
  }
  const maxLines = options.maxLines || 1000;

  io.on('connection', (socket: Socket) => {
    logger.info('WebSocket client connected', { socketId: socket.id });

    // Send recent logs on connection
    if (existsSync(logPath)) {
      sendRecentLogs(socket, logPath, maxLines);
    }

    // Watch log file for changes
    let watcher: NodeJS.Timeout | null = null;
    let lastPosition = 0;

    if (existsSync(logPath)) {
      // Get initial file size
      const stats = require('fs').statSync(logPath);
      lastPosition = stats.size;

      // Watch for file changes
      watcher = setInterval(() => {
        try {
          const currentStats = require('fs').statSync(logPath);
          if (currentStats.size > lastPosition) {
            // File has grown, read new lines
            readNewLogs(socket, logPath, lastPosition);
            lastPosition = currentStats.size;
          }
        } catch (error) {
          logger.error('Error watching log file', { error });
        }
      }, 1000); // Check every second
    }

    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', { socketId: socket.id });
      if (watcher) {
        clearInterval(watcher);
      }
    });
  });
}

function sendRecentLogs(socket: Socket, logPath: string, maxLines: number): void {
  try {
    const readStream = createReadStream(logPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity,
    });

    const lines: string[] = [];
    rl.on('line', (line) => {
      lines.push(line);
      if (lines.length > maxLines) {
        lines.shift();
      }
    });

    rl.on('close', () => {
      socket.emit('logs', {
        type: 'initial',
        lines: lines.slice(-maxLines),
      });
    });
  } catch (error) {
    logger.error('Failed to send recent logs', { error });
  }
}

function readNewLogs(socket: Socket, logPath: string, startPosition: number): void {
  try {
    const readStream = createReadStream(logPath, {
      encoding: 'utf-8',
      start: startPosition,
    });

    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      socket.emit('logs', {
        type: 'new',
        line,
      });
    });
  } catch (error) {
    logger.error('Failed to read new logs', { error });
  }
}

