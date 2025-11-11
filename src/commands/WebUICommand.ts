/**
 * WebUI command
 */

import { BaseCommand } from './Command';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { startWebUI } from '../webui/server/server';
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
        : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
      
      const host = (args.options.host as string) || process.env.HOST || 'localhost';
      
      // Find static path
      const staticPath = this.findStaticPath(args);

      // Debug logging
      context.logger.info('[WebUI] Starting server...');
      context.logger.info('[WebUI] PORT:', { port });
      context.logger.info('[WebUI] HOST:', { host });
      context.logger.info('[WebUI] STATIC_PATH:', { staticPath: staticPath || '(not found)' });

      if (staticPath) {
        const resolvedPath = path.resolve(staticPath);
        context.logger.info('[WebUI] STATIC_PATH (resolved):', { resolvedPath });
        if (!fs.existsSync(resolvedPath)) {
          context.logger.warn('[WebUI] ⚠️  Warning: STATIC_PATH does not exist!');
        } else {
          const indexPath = path.join(resolvedPath, 'index.html');
          if (!fs.existsSync(indexPath)) {
            context.logger.warn('[WebUI] ⚠️  Warning: index.html not found in static path!');
          }
        }
      } else {
        context.logger.info('[WebUI] ⚠️  STATIC_PATH not found - frontend will not be served');
        context.logger.info('[WebUI] 💡 To serve the frontend, either:');
        context.logger.info('[WebUI]    1. Set STATIC_PATH environment variable');
        context.logger.info('[WebUI]    2. Build the frontend: npm run webui:build');
        context.logger.info('[WebUI]    3. Ensure webui-frontend/dist exists with index.html');
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
   */
  private findStaticPath(args: CommandArgs): string | undefined {
    // 1. Check command line option
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

    // 3. Check project root directory (relative to dist/)
    // When running from global install, __dirname will be in node_modules
    // Try to find the project root by looking for webui-frontend
    try {
      // Try to find project root by looking for common markers
      let currentDir = __dirname;
      for (let i = 0; i < 10; i++) {
        const testPath = path.join(currentDir, 'webui-frontend', 'dist');
        if (fs.existsSync(testPath)) {
          const indexPath = path.join(testPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            return testPath;
          }
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir) break;
        currentDir = parent;
      }
    } catch (err) {
      // Ignore errors
    }

    // 4. Check current working directory
    const cwdStaticPath = path.join(process.cwd(), 'webui-frontend', 'dist');
    if (fs.existsSync(cwdStaticPath)) {
      const indexPath = path.join(cwdStaticPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return cwdStaticPath;
      }
    }

    return undefined;
  }

  getUsage(): string {
    return `webui [options]

Start the WebUI server for managing PixivFlow.

Options:
  --port <number>     Port to listen on (default: 3000)
  --host <string>     Host to bind to (default: localhost)
  --static-path <path> Path to frontend static files

Environment Variables:
  PORT                Port to listen on
  HOST                Host to bind to
  STATIC_PATH         Path to frontend static files

Examples:
  pixivflow webui
  pixivflow webui --port 8080
  pixivflow webui --host 0.0.0.0
  pixivflow webui --static-path ./webui-frontend/dist`;
  }
}

