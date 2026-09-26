import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { logger } from '../../logger';

/**
 * Get package version dynamically
 * Handles multiple scenarios:
 * 1. Running from source (src/webui/server/)
 * 2. Running from built dist (dist/webui/server/)
 * 3. Running from global npm install
 */
function getPackageVersion(): string {
  try {
    // Strategy 1: Try to find package.json by traversing up from __dirname
    // __dirname will be: dist/webui/server/ (built) or src/webui/server/ (source)
    let currentDir = __dirname;
    for (let i = 0; i < 10; i++) {
      const packageJsonPath = path.join(currentDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          if (pkg.name === 'pixivflow' && pkg.version) {
            return pkg.version;
          }
        } catch (err) {
          // Continue searching
        }
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
    
    // Strategy 2: Try to resolve from require (for npm packages)
    try {
      // When installed as npm package, try to resolve the package
      const packagePath = require.resolve('pixivflow/package.json');
      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        return pkg.version || 'unknown';
      }
    } catch {
      // Not installed as npm package, continue
    }
    
    // Strategy 3: Try current working directory
    const cwdPackageJson = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(cwdPackageJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(cwdPackageJson, 'utf-8'));
        if (pkg.name === 'pixivflow' && pkg.version) {
          return pkg.version;
        }
      } catch {
        // Ignore
      }
    }
  } catch (error) {
    logger.warn('Failed to read package version', { error });
  }
  
  return 'unknown';
}

/**
 * Inject a dismissible security notice into the served SPA index.html when the
 * server is genuinely reachable without credentials.
 *
 * That is a narrow state: a loopback-only bind (localhost / 127.0.0.1 / ::1) is
 * the intended credential-free local mode — the desktop distribution and every
 * "first local start" live there — and a non-loopback bind without credentials
 * is refused outright unless the operator explicitly set
 * WEBUI_ALLOW_PUBLIC_NO_AUTH=true. So the notice belongs to exactly one case:
 * an operator who overrode that refusal and is now serving the config secrets,
 * the downloaded files and the download/exec controls to the network.
 *
 * The notice is an overlay (position:fixed), never a layout element: an SPA
 * shell that owns 100vh must not gain a scrollbar because the host prepended a
 * banner — that showed up as the whole UI sliding up and down.
 */
export function injectAuthBanner(
  indexHtml: string,
  basicAuthEnabled: boolean,
  exposedWithoutCredentials = false
): string {
  if (basicAuthEnabled || !exposedWithoutCredentials || indexHtml.includes('pixivflow-auth-banner')) {
    return indexHtml;
  }
  const banner = [
    '<div id="pixivflow-auth-banner" role="status" style="position:fixed;left:16px;right:16px;bottom:16px;max-width:960px;margin:0 auto;box-sizing:border-box;z-index:9999;display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:10px;background:#fff7e0;border:1px solid #f0d99a;box-shadow:0 8px 24px rgba(0,0,0,.18);color:#6b5300;font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
    '  <span>⚠️ <strong>安全提醒 / Security:</strong> 这个 WebUI 未启用认证，却绑定在非本机地址上（WEBUI_USERNAME / WEBUI_PASSWORD 未设置）——仅当 WEBUI_ALLOW_PUBLIC_NO_AUTH=true 时才会如此。网络上任何人都能读取配置密钥、下载文件并触发下载。请设置用户名密码并重启服务。</span>',
    '  <button type="button" title="知道了 / Got it" style="margin-left:auto;border:0;background:transparent;color:#6b5300;cursor:pointer;font-size:18px;line-height:1;flex:0 0 auto;" onclick="this.parentElement.remove()">✕</button>',
    '</div>',
  ].join('\n');
  return indexHtml.replace('</body>', banner + '\n</body>');
}

/**
 * Setup static file serving for SPA frontend (injects the exposure notice when
 * the server is reachable without credentials).
 */
export function setupStaticFiles(
  app: Express,
  staticPath?: string,
  basicAuthEnabled = false,
  exposedWithoutCredentials = false
): void {
  if (!staticPath) {
    // Root path handler when static files are not configured
    app.get('/', (req: Request, res: Response) => {
      res.json({
        message: 'PixivFlow WebUI API Server',
        version: getPackageVersion(),
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
  let servedIndexHtml: string | null = null;

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
    servedIndexHtml = injectAuthBanner(
      fs.readFileSync(indexPath, 'utf8'),
      basicAuthEnabled,
      exposedWithoutCredentials
    );
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
      res.type('html').send(servedIndexHtml);
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
      res.type('html').send(servedIndexHtml);
    } else {
      next();
    }
  });
}



















