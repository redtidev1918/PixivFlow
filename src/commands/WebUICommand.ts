/**
 * WebUI command
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { startWebUI } from '../webui/server/server';
import { PORTS } from '../webui/ports';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

/**
 * WebUI command - Start WebUI server
 */
export class WebUICommand extends BaseCommand {
  readonly name = 'webui';
  readonly description = 'Start WebUI server';
  readonly aliases: string[] = ['w'];
  readonly metadata = {
    category: CommandCategory.UTILITY,
    requiresAuth: false,
    longRunning: true,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const port = args.options.port 
        ? parseInt(String(args.options.port), 10) 
        : (process.env.PORT ? parseInt(process.env.PORT, 10) : PORTS.PROD_API);
      
      const host = (args.options.host as string) || process.env.HOST || 'localhost';
      
      // Find static path, with auto-build if needed
      let staticPath = this.findStaticPath(args);

      // If static path not found, try to auto-build
      if (!staticPath) {
        const projectRoot = this.findProjectRoot();
        if (projectRoot) {
          const frontendSourcePath = path.join(projectRoot, 'webui-frontend');
          const frontendDistPath = path.join(frontendSourcePath, 'dist');
          
          // Check if source exists
          if (fs.existsSync(frontendSourcePath)) {
            const indexPath = path.join(frontendDistPath, 'index.html');
            const distExists = fs.existsSync(indexPath);
            
            if (!distExists) {
              // Source exists but dist doesn't, build it
              context.logger.info('[WebUI] 🔨 Frontend source found but not built. Building now...');
              const buildResult = await this.buildFrontend(projectRoot, context);
              if (buildResult) {
                staticPath = frontendDistPath;
                context.logger.info('[WebUI] ✅ Frontend built successfully!');
              } else {
                context.logger.warn('[WebUI] ⚠️  Frontend build failed. Starting server without frontend.');
              }
            } else {
              // Dist exists, use it
              staticPath = frontendDistPath;
              context.logger.info('[WebUI] ✅ Found frontend build, using it.');
            }
          } else {
            context.logger.warn('[WebUI] ⚠️  Frontend source directory not found in project root.');
          }
        } else {
          // Project root not found, show help
          context.logger.warn('[WebUI] ⚠️  Project root not found. Cannot auto-build frontend.');
          this.printProjectRootHelp(context);
        }
      }

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
        context.logger.info('[WebUI] 💡 To serve the frontend, you can:');
        context.logger.info('[WebUI]    1. Run from the project source directory (auto-build will be attempted)');
        context.logger.info('[WebUI]    2. Build manually: cd /path/to/pixivflow && npm run webui:build');
        context.logger.info('[WebUI]    3. Use --static-path option: pixivflow webui --static-path /path/to/dist');
        context.logger.info('[WebUI]    4. Set STATIC_PATH environment variable');
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
   * Priority:
   * 1. Command line option (--static-path)
   * 2. Environment variable (STATIC_PATH)
   * 3. Current working directory (most common case)
   * 4. Command location and parent directories
   * 5. Global install location
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

    // 3. Check current working directory first (most common case)
    // This allows users to run `pixivflow webui` from the project root
    const cwdStaticPath = path.join(process.cwd(), 'webui-frontend', 'dist');
    if (fs.existsSync(cwdStaticPath)) {
      const indexPath = path.join(cwdStaticPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return cwdStaticPath;
      }
    }

    // 4. Check project root directory (relative to dist/)
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

    // 5. Check npm global installation path
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

    return undefined;
  }

  /**
   * Find project root directory (containing webui-frontend)
   * Priority:
   * 1. Current working directory (most common case when running from project root)
   * 2. Command location and parent directories
   * 3. Global install location and parent directories
   */
  private findProjectRoot(): string | undefined {
    // Priority 1: Check current working directory first (most common case)
    // This allows users to run `pixivflow webui` from the project root
    const cwdFrontendPath = path.join(process.cwd(), 'webui-frontend');
    if (fs.existsSync(cwdFrontendPath)) {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        return process.cwd();
      }
    }

    // Priority 2: Try to find from current command location
    let currentDir = __dirname;
    for (let i = 0; i < 10; i++) {
      const testPath = path.join(currentDir, 'webui-frontend');
      if (fs.existsSync(testPath)) {
        const packageJsonPath = path.join(currentDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          return currentDir;
        }
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }

    // Priority 3: If in node_modules (global install), try to find source repo
    if (__dirname.includes('node_modules')) {
      const nodeModulesIndex = __dirname.indexOf('node_modules');
      if (nodeModulesIndex !== -1) {
        // Try parent directories of node_modules
        const nodeModulesPath = __dirname.substring(0, nodeModulesIndex);
        let searchDir = nodeModulesPath;
        for (let i = 0; i < 5; i++) {
          const testPath = path.join(searchDir, 'webui-frontend');
          if (fs.existsSync(testPath)) {
            const packageJsonPath = path.join(searchDir, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
              return searchDir;
            }
          }
          const parent = path.dirname(searchDir);
          if (parent === searchDir) break;
          searchDir = parent;
        }
      }
    }

    return undefined;
  }

  /**
   * Print help information about finding project root
   */
  private printProjectRootHelp(context: CommandContext): void {
    context.logger.info('');
    context.logger.info('💡 To use the full WebUI with frontend, you need to:');
    context.logger.info('');
    context.logger.info('Option 1: Clone the source code repository');
    context.logger.info('  1. Clone the repository:');
    context.logger.info('     git clone https://github.com/zoidberg-xgd/pixivflow.git');
    context.logger.info('     cd pixivflow');
    context.logger.info('  2. Run the command from the project directory:');
    context.logger.info('     pixivflow webui');
    context.logger.info('');
    context.logger.info('Option 2: Find the global installation directory');
    context.logger.info('  1. Find npm global root:');
    context.logger.info('     npm root -g');
    context.logger.info('  2. The package is usually at:');
    context.logger.info('     $(npm root -g)/pixivflow');
    context.logger.info('  3. However, global packages typically don\'t include source code.');
    context.logger.info('     You need to clone the repository separately.');
    context.logger.info('');
    context.logger.info('Option 3: Use API-only mode');
    context.logger.info('  The server will start in API-only mode.');
    context.logger.info('  You can build and deploy the frontend separately.');
    context.logger.info('');
  }

  /**
   * Build frontend automatically
   * This will:
   * 1. Check if dependencies are installed, install if needed
   * 2. Build the frontend
   */
  private async buildFrontend(projectRoot: string, context: CommandContext): Promise<boolean> {
    const frontendDir = path.join(projectRoot, 'webui-frontend');
    const packageJsonPath = path.join(frontendDir, 'package.json');
    const nodeModulesPath = path.join(frontendDir, 'node_modules');
    
    // Check if frontend directory exists and has package.json
    if (!fs.existsSync(frontendDir) || !fs.existsSync(packageJsonPath)) {
      context.logger.warn('[WebUI] Frontend source directory not found');
      return false;
    }

    // Step 1: Install dependencies if needed
    if (!fs.existsSync(nodeModulesPath)) {
      context.logger.info('[WebUI] 📦 Frontend dependencies not found. Installing...');
      const installSuccess = await this.installFrontendDependencies(frontendDir, context);
      if (!installSuccess) {
        context.logger.warn('[WebUI] ⚠️  Failed to install frontend dependencies');
        context.logger.info('[WebUI] 💡 Please run manually: cd webui-frontend && npm install');
        return false;
      }
      context.logger.info('[WebUI] ✅ Frontend dependencies installed successfully');
    }

    // Step 2: Build frontend
    context.logger.info(`[WebUI] 🔨 Building frontend in: ${frontendDir}`);
    return await this.runFrontendBuild(frontendDir, context);
  }

  /**
   * Install frontend dependencies
   */
  private async installFrontendDependencies(frontendDir: string, context: CommandContext): Promise<boolean> {
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const npmCommand = isWindows ? 'npm.cmd' : 'npm';
      const installProcess = spawn(npmCommand, ['install'], {
        cwd: frontendDir,
        stdio: 'inherit',
        shell: false,
      });

      installProcess.on('close', (code) => {
        if (code === 0) {
          const nodeModulesPath = path.join(frontendDir, 'node_modules');
          if (fs.existsSync(nodeModulesPath)) {
            resolve(true);
          } else {
            context.logger.warn('[WebUI] Install completed but node_modules not found');
            resolve(false);
          }
        } else {
          context.logger.warn(`[WebUI] Install failed with exit code ${code}`);
          resolve(false);
        }
      });

      installProcess.on('error', (error) => {
        context.logger.error('[WebUI] Install process error:', {
          error: error instanceof Error ? error.message : String(error),
        });
        resolve(false);
      });
    });
  }

  /**
   * Run frontend build
   */
  private async runFrontendBuild(frontendDir: string, context: CommandContext): Promise<boolean> {
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const npmCommand = isWindows ? 'npm.cmd' : 'npm';
      const buildProcess = spawn(npmCommand, ['run', 'build'], {
        cwd: frontendDir,
        stdio: 'inherit',
        shell: false,
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          const distPath = path.join(frontendDir, 'dist');
          const indexPath = path.join(distPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            resolve(true);
          } else {
            context.logger.warn('[WebUI] Build completed but index.html not found');
            resolve(false);
          }
        } else {
          context.logger.warn(`[WebUI] Build failed with exit code ${code}`);
          resolve(false);
        }
      });

      buildProcess.on('error', (error) => {
        context.logger.error('[WebUI] Build process error:', {
          error: error instanceof Error ? error.message : String(error),
        });
        resolve(false);
      });
    });
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

Auto-Build Feature:
  If run from the project source directory and frontend is not built,
  the command will automatically build the frontend before starting.

Examples:
  pixivflow webui                                    # Auto-build if in source directory
  pixivflow webui --port 8080                        # Use custom port
  pixivflow webui --host 0.0.0.0                     # Bind to all interfaces
  pixivflow webui --static-path ./webui-frontend/dist # Use custom static path`;
  }
}

