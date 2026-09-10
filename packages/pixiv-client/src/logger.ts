/**
 * Minimal structured logger port. Default is silent; hosts inject their own
 * logger when wiring the client. The kit never logs credentials: the
 * transport emits request events with URLs/hosts only.
 */
export interface KitLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export const silentLogger: KitLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
