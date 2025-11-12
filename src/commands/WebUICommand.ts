/**
 * WebUI command
 */

import { BaseCommand } from './Command';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { startWebUI } from '../webui/server/server';
import { PORTS } from '../webui/ports';
import path from 'path';
import fs from 'fs';

/**
 * WebUI command - Start WebUI server
 */
export class WebUICommand extends BaseCommand {
  readonly name = 'webui';
  readonly description = 'Start WebUI server';
  readonly aliases: string[] = ['w'];

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const port = args.options.port 
        ? parseInt(String(args.options.port), 10) 
        : (process.env.PORT ? parseInt(process.env.PORT, 10) : PORTS.PROD_API);
      
      const host = (args.options.host as string) || process.env.HOST || 'localhost';
      
      // Find static path from command line option or environment variable only
      // Frontend is now a separate project and should be deployed independently
      const staticPath = this.findStaticPath(args);

      // Debug logging
      context.logger.info('[WebUI] Starting API server...');
      context.logger.info('[WebUI] PORT:', { port });
      context.logger.info('[WebUI] HOST:', { host });
      context.logger.info('[WebUI] STATIC_PATH:', { staticPath: staticPath || '(not configured)' });

      if (staticPath) {
        const resolvedPath = path.resolve(staticPath);
        context.logger.info('[WebUI] STATIC_PATH (resolved):', { resolvedPath });
        if (!fs.existsSync(resolvedPath)) {
          context.logger.warn('[WebUI] ⚠️  Warning: STATIC_PATH does not exist!');
        } else {
          const indexPath = path.join(resolvedPath, 'index.html');
          if (!fs.existsSync(indexPath)) {
            context.logger.warn('[WebUI] ⚠️  Warning: index.html not found in static path!');
          } else {
            context.logger.info('[WebUI] ✅ Static files will be served from:', { resolvedPath });
          }
        }
      } else {
        context.logger.info('[WebUI] 📡 Running in API-only mode (no static files)');
        context.logger.info('[WebUI] 💡 To serve frontend static files, you can:');
        context.logger.info('[WebUI]    1. Use --static-path option: pixivflow webui --static-path /path/to/frontend/dist');
        context.logger.info('[WebUI]    2. Set STATIC_PATH environment variable');
        context.logger.info('[WebUI]');
        context.logger.info('[WebUI] 📝 Note: Frontend is a separate project and should be built and deployed independently.');
        context.logger.info('[WebUI]    The backend is a pure API server and can be used as an npm package.');
      }

      const actualPort = await startWebUI({
        port,
        host,
        enableCors: true,
        staticPath,
      });

      context.logger.info(`[WebUI] Server started successfully on http://${host}:${actualPort}`);

      // Keep process alive
      return this.success('WebUI server started', { 
        message: `WebUI is running at http://${host}:${actualPort}. Press Ctrl+C to stop.`,
        port: actualPort,
        host,
      });
    } catch (error) {
      context.logger.error('Failed to start WebUI server', {
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      return this.failure(
        error instanceof Error ? error.message : String(error),
        { error }
      );
    }
  }

  /**
   * Find static file path for frontend
   * Only checks explicit configuration (command line option or environment variable)
   * Frontend is now a separate project and should be deployed independently
   */
  private findStaticPath(args: CommandArgs): string | undefined {
    // 1. Check command line option (highest priority)
    if (args.options.staticPath) {
      const optionPath = path.resolve(String(args.options.staticPath));
      if (fs.existsSync(optionPath)) {
        const indexPath = path.join(optionPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          return optionPath;
        }
      }
    }

    // 2. Check environment variable
    if (process.env.STATIC_PATH) {
      const envPath = path.resolve(process.env.STATIC_PATH);
      if (fs.existsSync(envPath)) {
        const indexPath = path.join(envPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          return envPath;
        }
      }
    }

    return undefined;
  }


  getUsage(): string {
    return `webui [options]

Start the WebUI API server for managing PixivFlow.

The backend is a pure API server and can be used as an npm package.
The frontend is a separate project and should be built and deployed independently.

Options:
  --port <number>     Port to listen on (default: 3000)
  --host <string>     Host to bind to (default: localhost)
  --static-path <path> Path to frontend static files (optional)

Environment Variables:
  PORT                Port to listen on
  HOST                Host to bind to
  STATIC_PATH         Path to frontend static files (optional)

Examples:
  pixivflow webui                                    # Start API server only
  pixivflow webui --port 8080                        # Use custom port
  pixivflow webui --host 0.0.0.0                     # Bind to all interfaces
  pixivflow webui --static-path /path/to/frontend/dist # Serve static files from custom path`;
  }
}

