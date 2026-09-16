import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { basename, join } from 'path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { gzipSync } from 'node:zlib';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'text' | 'json';

export interface LogContext {
  service?: string;
  component?: string;
  bot_id?: string;
  schedule_id?: string;
  slot_id?: string;
  pixiv_id?: string;
  stage?: string;
  trace_id?: string;
  [key: string]: unknown;
}

interface LogMeta {
  [key: string]: unknown;
}

const ctxStore = new AsyncLocalStorage<LogContext>();

function defaultMaxBytes(): number {
  const parsed = Number.parseInt(process.env.PIXIV_LOG_MAX_BYTES ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20 * 1024 * 1024;
}

function retentionDays(): number {
  const parsed = Number.parseInt(process.env.PIXIV_LOG_RETENTION_DAYS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

class Logger {
  private static readonly levelOrder: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  private threshold: LogLevel = 'info';
  private format: LogFormat = process.env.PIXIV_LOG_FORMAT === 'json' ? 'json' : 'text';
  private logPath: string | null = null;

  public setLevel(level: LogLevel): void {
    this.threshold = level;
  }

  public setFormat(format: LogFormat): void {
    this.format = format;
  }

  /** Run `fn` with a log context that is merged into every log line emitted inside. */
  public runWithContext<T>(ctx: LogContext, fn: () => T): T {
    return ctxStore.run(ctx, fn);
  }

  public setLogPath(path: string): void {
    this.logPath = path;
    const logDir = join(path, '..');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  public debug(message: string, meta?: LogMeta): void {
    this.write('debug', message, meta);
  }

  public info(message: string, meta?: LogMeta): void {
    this.write('info', message, meta);
  }

  public warn(message: string, meta?: LogMeta): void {
    this.write('warn', message, meta);
  }

  public error(message: string, meta?: LogMeta): void {
    this.write('error', message, meta);
  }

  private write(level: LogLevel, message: string, meta?: LogMeta): void {
    if (Logger.levelOrder[level] < Logger.levelOrder[this.threshold]) return;

    const ctx = ctxStore.getStore();
    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(ctx ?? {}),
      ...(meta ?? {}),
    };

    const logLine = this.format === 'json'
      ? JSON.stringify(record)
      : `[${record.timestamp}] [${level.toUpperCase()}] ${message}${meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''}`;

    switch (level) {
      case 'debug': console.debug(logLine); break;
      case 'info': console.info(logLine); break;
      case 'warn': console.warn(logLine); break;
      case 'error': console.error(logLine); break;
      default: console.log(logLine);
    }

    if (this.logPath) {
      try {
        this.rotateIfNeeded();
        appendFileSync(this.logPath, logLine + '\n', 'utf-8');
      } catch (error) {
        console.error('Failed to write to log file', error);
      }
    }
  }

  /**
   * Rotate the current log file when it exceeds the size cap:
   * rename to <name>-<ts>.log.gz, then prune archived logs older than
   * retention days. Run inside write (low-traffic scheduler, acceptable;
   * use a background job if this ever becomes a high-rate service).
   */
  private rotateIfNeeded(): void {
    if (!this.logPath) return;
    let size = 0;
    try {
      if (existsSync(this.logPath)) size = statSync(this.logPath).size;
    } catch { return; }
    if (size < defaultMaxBytes()) return;

    try {
      const dir = join(this.logPath, '..');
      const base = basename(this.logPath);
      const name = base.replace(/\.log$/, '');
      const stamped = join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
      renameSync(this.logPath, stamped);
      writeFileSync(`${stamped}.gz`, gzipSync(readFileSync(stamped)));
      unlinkSync(stamped);
      this.pruneArchives(dir, `${name}-`, retentionDays());
    } catch (error) {
      console.error('Failed to rotate log file', error);
    }
  }

  private pruneArchives(dir: string, prefix: string, days: number): void {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.startsWith(prefix) || !entry.endsWith('.log.gz')) continue;
      try {
        const p = join(dir, entry);
        if (statSync(p).mtimeMs < cutoff) unlinkSync(p);
      } catch {
        // best effort
      }
    }
  }
}

export const logger = new Logger();
