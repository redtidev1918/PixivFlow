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
        context.logger.info('[WebUI] 💡 To serve the frontend, you need to:');
        context.logger.info('[WebUI]    1. Build the frontend first:');
        context.logger.info('[WebUI]       cd /path/to/pixivflow');
        context.logger.info('[WebUI]       npm run webui:build');
        context.logger.info('[WebUI]    2. Then start WebUI with one of these methods:');
        context.logger.info('[WebUI]       - Use --static-path option:');
        context.logger.info('[WebUI]         pixivflow webui --static-path /path/to/pixivflow/webui-frontend/dist');
        context.logger.info('[WebUI]       - Or set STATIC_PATH environment variable:');
        context.logger.info('[WebUI]         STATIC_PATH=/path/to/pixivflow/webui-frontend/dist pixivflow webui');
        context.logger.info('[WebUI]    3. Or run from the project directory (if webui-frontend/dist exists)');
        context.logger.info('[WebUI]');
        context.logger.info('[WebUI] 📝 Note: The frontend is not included in the npm package.');
        context.logger.info('[WebUI]    You need to build it separately from the source repository.');
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

    // 4. Check npm global installation path
    // When installed globally, try to find the package in node_modules
    try {
      // Try to resolve the package location
      // __dirname is in dist/commands, so we need to go up to find the package root
      let packageRoot = __dirname;
      for (let i = 0; i < 5; i++) {
        const packageJsonPath = path.join(packageRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          // Found package.json, check for webui-frontend
          const testPath = path.join(packageRoot, 'webui-frontend', 'dist');
          if (fs.existsSync(testPath)) {
            const indexPath = path.join(testPath, 'index.html');
            if (fs.existsSync(indexPath)) {
              return testPath;
            }
          }
          break;
        }
        const parent = path.dirname(packageRoot);
        if (parent === packageRoot) break;
        packageRoot = parent;
      }

      // Also check if we're in a global node_modules
      // Global packages are usually in: /usr/local/lib/node_modules or ~/.npm-global/lib/node_modules
      // Or on Windows: %AppData%\npm\node_modules
      if (__dirname.includes('node_modules')) {
        // We're in node_modules, try to find the package root
        const nodeModulesIndex = __dirname.indexOf('node_modules');
        if (nodeModulesIndex !== -1) {
          const nodeModulesPath = __dirname.substring(0, nodeModulesIndex + 'node_modules'.length);
          const packagePath = path.join(nodeModulesPath, 'pixivflow', 'webui-frontend', 'dist');
          if (fs.existsSync(packagePath)) {
            const indexPath = path.join(packagePath, 'index.html');
            if (fs.existsSync(indexPath)) {
              return packagePath;
            }
          }
        }
      }
    } catch (err) {
      // Ignore errors
    }

    // 5. Check current working directory
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

