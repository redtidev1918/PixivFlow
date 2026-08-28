import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual, createHash } from 'node:crypto';

export interface BasicAuthOptions {
  username: string;
  password: string;
  /** WWW-Authenticate realm. Default: PixivFlow */
  realm?: string;
  /** Paths that skip authentication. Default: ['/api/health', '/health'] */
  exemptPaths?: string[];
}

/**
 * Parse an Authorization: Basic header into credentials.
 * Returns null when the header is absent or malformed.
 */
export function parseBasicAuthHeader(header: unknown): { username: string; password: string } | null {
  if (typeof header !== 'string') return null;
  const [scheme, b64] = header.split(' ');
  if (scheme !== 'Basic' || !b64) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/** Constant-time comparison (lengths normalized via hash to avoid timing leaks). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Validate a Basic auth header against the configured credentials.
 * Shared by the HTTP middleware and the Socket.IO handshake guard.
 */
export function verifyBasicAuth(
  authorizationHeader: unknown,
  username: string,
  password: string
): boolean {
  const creds = parseBasicAuthHeader(authorizationHeader);
  if (!creds) return false;
  return safeEqual(creds.username, username) && safeEqual(creds.password, password);
}

/**
 * HTTP Basic Auth middleware. Opt-in via WEBUI_USERNAME / WEBUI_PASSWORD env.
 * OPTIONS preflight requests and exempt paths (health checks) pass through.
 */
export function createBasicAuthMiddleware(
  options: BasicAuthOptions
): (req: Request, res: Response, next: NextFunction) => void {
  const realm = options.realm ?? 'PixivFlow';
  const exempt = new Set(options.exemptPaths ?? ['/api/health', '/health']);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'OPTIONS' || exempt.has(req.path)) {
      next();
      return;
    }
    if (verifyBasicAuth(req.headers.authorization, options.username, options.password)) {
      next();
      return;
    }
    res.setHeader('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
    res.status(401).json({
      errorCode: 'UNAUTHORIZED',
      message: 'Authentication required. Set WEBUI_USERNAME / WEBUI_PASSWORD to configure credentials.',
    });
  };
}
