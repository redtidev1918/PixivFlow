#!/usr/bin/env node
import { loadConfig, getConfigPath } from './config';
import { DownloadManager } from './download/DownloadManager';
import { FileService } from './download/FileService';
import { logger } from './logger';
import { PixivAuth } from './pixiv/AuthClient';
import { PixivClient } from './pixiv/PixivClient';
import { Scheduler } from './scheduler/Scheduler';
import { Database } from './storage/Database';
import { TerminalLogin, LoginInfo } from './terminal-login';
import { updateConfigWithToken, ensureValidToken } from './utils/login-helper';
import { createTokenMaintenanceService } from './utils/token-maintenance';
import { ConfigPathMigrator } from './utils/config-path-migrator';
import { FileNormalizationService } from './download/FileNormalizationService';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): {
  command?: string;
  options: Record<string, string | boolean>;
  positional: string[];
} {
  const result: {
    command?: string;
    options: Record<string, string | boolean>;
    positional: string[];
  } = {
    options: {},
    positional: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        result.options[key] = nextArg;
        i++;
      } else {
        result.options[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        result.options[key] = nextArg;
        i++;
      } else {
        result.options[key] = true;
      }
    } else if (!result.command) {
      result.command = arg;
    } else {
      result.positional.push(arg);
    }
  }

  return result;
}

/**
 * Output login result
 */
function outputLoginResult(loginInfo: LoginInfo, json: boolean = false): void {
  if (json) {
    console.log(JSON.stringify(loginInfo.response || loginInfo, null, 2));
  } else {
    console.log('[+]: Success!');
    console.log(`access_token: ${loginInfo.access_token}`);
    console.log(`refresh_token: ${loginInfo.refresh_token}`);
    console.log(`expires_in: ${loginInfo.expires_in}`);
    if (loginInfo.user) {
      console.log(`user: ${loginInfo.user.name} (${loginInfo.user.account})`);
    }
  }
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Usage: pixivflow [command] [options]

╔════════════════════════════════════════════════════════════════╗
║              PixivFlow - 完全独立的后端 CLI 工具                ║
║              所有功能都可以在无前端环境下完美运行               ║
╚════════════════════════════════════════════════════════════════╝

Commands:
  login, l                    Login interactively (using Python gppt)
  login-interactive, li       Login interactively (explicit)
  login-headless, lh          Login in headless mode (requires -u and -p)
  refresh, r <token>          Refresh access token using refresh token
  download                    Run download job once
  random, rd                  Login (if needed) and download a random image
  scheduler                   Start scheduler (default if enabled in config)
  migrate-config, mc          Migrate configuration paths (convert absolute to relative)
  normalize, nf               Normalize and reorganize downloaded files
  help, -h, --help            Show this help message

Options:
  -u, --username <id>         Pixiv ID (email, username, or account name)
  -p, --password <password>   Your Pixiv password
  -j, --json                  Output response as JSON
  --once                      Run download job once and exit
  --config <path>             Path to config file (default: config/standalone.config.json)
  --targets <json>            Custom targets JSON (overrides config file targets)

Examples:
  pixivflow login                    # Interactive login (prompts for username/password in terminal)
  pixivflow login -u user@example.com -p password  # Login with credentials (no browser window)
  pixivflow lh -u user@example.com -p password  # Headless login (no browser window)
  pixivflow refresh <refresh_token>  # Refresh token
  pixivflow download                 # Run download once
  pixivflow download --targets '[{"type":"novel","tag":"アークナイツ","limit":5,"mode":"ranking","rankingMode":"day","rankingDate":"YESTERDAY","filterTag":"アークナイツ"}]'  # Download with custom targets
  pixivflow random                   # Login (if needed) and download a random image
  pixivflow scheduler                # Start scheduler
  pixivflow normalize                # Normalize and reorganize downloaded files
  pixivflow normalize --dry-run      # Preview changes without applying them
  pixivflow normalize --type novel   # Only normalize novel files

Note: 
  - Login requires Python 3.9+ and gppt package (pip install gppt or pip3 install gppt)
  - This is a standalone CLI tool that works independently of any frontend
  - All core features (download, login, scheduler) work perfectly without WebUI
`);
}

/**
 * Prompt for password with hidden input
 * Uses raw mode to hide password characters
 */
function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    
    let password = '';
    let wasRawMode = false;
    
    // Save current stdin settings
    if (process.stdin.isTTY) {
      wasRawMode = (process.stdin as any).isRaw || false;
      process.stdin.setRawMode(true);
    }
    
    process.stdin.resume();
    // Don't set encoding in raw mode - handle buffers directly
    // When encoding is not set, stdin emits Buffer objects
    
    const onData = (data: Buffer) => {
      // Convert buffer to string for processing
      const input = data.toString('utf8');
      
      // Process each character
      for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const code = char.charCodeAt(0);
        
        // Enter key (13 = \r, 10 = \n)
        if (code === 13 || code === 10) {
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(wasRawMode);
          }
          process.stdout.write('\n');
          resolve(password);
          return;
        }
        
        // Backspace (127) or Delete (8)
        if (code === 127 || code === 8) {
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b'); // Move cursor back, overwrite with space, move back again
          }
          continue;
        }
        
        // Ctrl+C (3)
        if (code === 3) {
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(wasRawMode);
          }
          process.stdout.write('\n');
          process.exit(130); // Exit with SIGINT code
          return;
        }
        
        // Ctrl+D (4) - EOF
        if (code === 4) {
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(wasRawMode);
          }
          process.stdout.write('\n');
          resolve(password);
          return;
        }
        
        // Ignore other control characters (0-31 except those handled above)
        if (code < 32) {
          continue;
        }
        
        // Add character to password (but don't display it)
        password += char;
        process.stdout.write('*'); // Show asterisk instead of actual character
      }
    };
    
    process.stdin.on('data', onData);
  });
}

/**
 * Prompt user for credentials in terminal
 */
async function promptForCredentials(): Promise<{ username: string; password: string }> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('[+]: ID can be email address, username, or account name.');
    
    rl.question('[?]: Pixiv ID: ', async (pixivId) => {
      rl.close();
      // Use secure password input
      const password = await promptPassword('[?]: Password: ');
      resolve({ username: pixivId.trim(), password: password.trim() });
    });
  });
}

/**
 * Handle login command
 */
async function handleLogin(args: {
  options: Record<string, string | boolean>;
  positional: string[];
}): Promise<void> {
  const json = !!(args.options.json || args.options.j);
  let username = (args.options.username || args.options.u) as string | undefined;
  let password = (args.options.password || args.options.p) as string | undefined;
  const configPath = (args.options.config as string) || undefined;

  try {
    // Check if credentials were provided via command line arguments
    const credentialsProvided = !!(username && password);
    
    // Use headless mode only if credentials were provided via command line
    // Otherwise use interactive mode (opens browser window for manual login)
    const useHeadless = credentialsProvided;
    
    if (!useHeadless) {
      // Interactive mode: no need to input credentials, just open browser
      console.log('[i]: Interactive login mode');
      console.log('[i]: A Chrome browser window will open. Please login manually in the browser.');
      console.log('[i]: You do NOT need to enter credentials here - just wait for the browser to open.');
      console.log('[i]: After you complete login in the browser, the token will be automatically retrieved.');
    }
    
    const login = new TerminalLogin({
      headless: useHeadless,
      username: useHeadless ? username : undefined,
      password: useHeadless ? password : undefined,
    });

    const loginInfo = await login.login({
      headless: useHeadless,
      username: useHeadless ? username : undefined,
      password: useHeadless ? password : undefined,
    });

    // Try to update config file with refresh token
    const finalConfigPath = configPath || 
      process.env.PIXIV_DOWNLOADER_CONFIG || 
      path.resolve('config/standalone.config.json');
    
    try {
      await updateConfigWithToken(finalConfigPath, loginInfo.refresh_token);
      if (!json) {
        console.log(`[+]: Config updated at ${finalConfigPath}`);
      }
    } catch (error) {
      // Config update failed, but login succeeded
      if (!json) {
        logger.warn('Login successful but config update failed', { error });
      }
    }

    outputLoginResult(loginInfo, json);
  } catch (error) {
    console.error('[!]: Login failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Handle headless login command
 */
async function handleLoginHeadless(args: {
  options: Record<string, string | boolean>;
  positional: string[];
}): Promise<void> {
  const json = !!(args.options.json || args.options.j);
  const username = (args.options.username || args.options.u) as string | undefined;
  const password = (args.options.password || args.options.p) as string | undefined;
  const configPath = (args.options.config as string) || undefined;

  if (!username || !password) {
    console.error('[!]: Headless login requires username (-u) and password (-p)');
    console.error('Usage: pixivflow login-headless -u <username> -p <password>');
    process.exit(1);
  }

  try {
    const login = new TerminalLogin({
      headless: true,
      username,
      password,
    });

    const loginInfo = await login.login({
      headless: true,
      username,
      password,
    });

    // Try to update config file with refresh token
    const finalConfigPath = configPath || 
      process.env.PIXIV_DOWNLOADER_CONFIG || 
      path.resolve('config/standalone.config.json');
    
    try {
      await updateConfigWithToken(finalConfigPath, loginInfo.refresh_token);
      if (!json) {
        console.log(`[+]: Config updated at ${finalConfigPath}`);
      }
    } catch (error) {
      // Config update failed, but login succeeded
      if (!json) {
        logger.warn('Login successful but config update failed', { error });
      }
    }

    outputLoginResult(loginInfo, json);
  } catch (error) {
    console.error('[!]: Login failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Handle refresh command
 */
async function handleRefresh(args: {
  options: Record<string, string | boolean>;
  positional: string[];
}): Promise<void> {
  const json = !!(args.options.json || args.options.j);
  const refreshToken = args.positional[0] || (args.options.token as string);

  if (!refreshToken) {
    console.error('[!]: Refresh token is required');
    console.error('Usage: pixivflow refresh <refresh_token>');
    process.exit(1);
  }

  try {
    const loginInfo = await TerminalLogin.refresh(refreshToken);
    outputLoginResult(loginInfo, json);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    if (!json) {
      console.error('[!]: Token refresh failed:', errorMessage);
      if (errorStack && process.env.DEBUG) {
        console.error('[!]: Stack trace:', errorStack);
      }
      logger.error('Token refresh failed', { error: errorMessage, stack: errorStack });
    } else {
      console.error(JSON.stringify({ error: errorMessage, success: false }, null, 2));
    }
    process.exit(1);
  }
}

/**
 * Handle download command
 */
async function handleDownload(args?: {
  options: Record<string, string | boolean>;
  positional: string[];
}): Promise<void> {
  try {
    const configPathArg = args ? (args.options.config as string) || undefined : undefined;
    const configPath = getConfigPath(configPathArg);
    let config = loadConfig(configPath);

    // Support custom targets via --targets parameter
    const targetsArg = args ? (args.options.targets as string) || undefined : undefined;
    if (targetsArg) {
      try {
        const customTargets = JSON.parse(targetsArg);
        // If it's an array, use it directly; if it's an object, wrap it in an array
        if (Array.isArray(customTargets)) {
          config = { ...config, targets: customTargets };
        } else if (customTargets && typeof customTargets === 'object') {
          // Check if it has a 'targets' property (full config) or is a single target
          if (customTargets.targets && Array.isArray(customTargets.targets)) {
            config = { ...config, targets: customTargets.targets };
          } else {
            // Single target object, wrap in array
            config = { ...config, targets: [customTargets] };
          }
        }
        const targetCount = Array.isArray(customTargets) 
          ? customTargets.length 
          : (customTargets.targets && Array.isArray(customTargets.targets) 
              ? customTargets.targets.length 
              : 1);
        logger.info(`Using custom targets from command line: ${targetCount} target(s)`);
      } catch (error) {
        logger.error('Failed to parse --targets parameter', { error });
        console.error('[!]: Invalid JSON in --targets parameter:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }

    // Apply initial delay if configured
    if (config.initialDelay && config.initialDelay > 0) {
      logger.info(`Waiting ${config.initialDelay}ms before starting download...`);
      await new Promise(resolve => setTimeout(resolve, config.initialDelay!));
    }

    const database = new Database(config.storage!.databasePath!);
    database.migrate();

    const auth = new PixivAuth(config.pixiv, config.network!, database, configPath);
    const pixivClient = new PixivClient(auth, config);
    const fileService = new FileService(config.storage!);
    const downloadManager = new DownloadManager(config, pixivClient, database, fileService);

    await downloadManager.initialise();
    
    logger.info('='.repeat(60));
    logger.info('Starting Pixiv download job');
    logger.info('='.repeat(60));
    
    const startTime = Date.now();
    await downloadManager.runAllTargets();
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    logger.info('='.repeat(60));
    logger.info(`Pixiv download job finished (took ${duration}s)`);
    logger.info('='.repeat(60));

    database.close();
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error while running download', {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    process.exit(1);
  }
}

// 热门标签列表，用于随机选择
const POPULAR_TAGS = [
  '風景', 'イラスト', 'オリジナル', '女の子', '男の子',
  '猫', '犬', '空', '海', '桜', '花', '星空', '夕日',
  'illustration', 'art', 'anime', 'manga', 'cute',
  'beautiful', 'nature', 'sky', 'sunset', 'flower'
];

// 小说热门标签列表
const POPULAR_NOVEL_TAGS = [
  'オリジナル', '創作', '小説', '物語', 'ストーリー',
  '恋愛', 'ファンタジー', '日常', '青春', '冒険',
  'ミステリー', 'ホラー', 'SF', '歴史', '現代',
  'original', 'story', 'novel', 'romance', 'fantasy',
  'daily', 'youth', 'adventure', 'mystery', 'horror'
];

/**
 * Handle random download command
 * This will ensure user is logged in, then download a random work (illustration or novel)
 */
async function handleRandomDownload(args: {
  options: Record<string, string | boolean>;
  positional: string[];
}): Promise<void> {
  try {
    const configPath = (args.options.config as string) || undefined;
    const username = (args.options.username || args.options.u) as string | undefined;
    const password = (args.options.password || args.options.p) as string | undefined;
    const headless = !!(args.options.headless || args.options.h);
    
    // Check if user wants to download novel or illustration
    // Default to novel if --novel is specified, otherwise check --type, default to illustration
    const typeArg = args.options.type as string | undefined;
    const novelFlag = !!(args.options.novel || args.options.n);
    const illustrationFlag = !!(args.options.illustration || args.options.i);
    
    let targetType: 'illustration' | 'novel' = 'illustration';
    if (novelFlag) {
      targetType = 'novel';
    } else if (illustrationFlag) {
      targetType = 'illustration';
    } else if (typeArg) {
      if (typeArg.toLowerCase() === 'novel') {
        targetType = 'novel';
      } else if (typeArg.toLowerCase() === 'illustration') {
        targetType = 'illustration';
      }
    } else {
      // Default to illustration (as documented)
      targetType = 'illustration';
    }

    // Parse count parameter (default: 1)
    // Support both --limit and --count for compatibility
    const countArg = args.options.limit || args.options.count || args.options.c || args.options.l;
    const downloadCount = countArg ? parseInt(String(countArg), 10) : 1;
    if (isNaN(downloadCount) || downloadCount < 1) {
      logger.warn(`Invalid count value: ${countArg}, using default: 1`);
    }
    const limit = isNaN(downloadCount) || downloadCount < 1 ? 1 : downloadCount;

    // Ensure valid token exists (login if needed)
    // In Docker environment, skip auto-login if PIXIV_SKIP_AUTO_LOGIN is set
    // because interactive login doesn't work in containers
    logger.info('Checking authentication status...');
    const skipAutoLogin = process.env.PIXIV_SKIP_AUTO_LOGIN === 'true';
    logger.debug(`handleRandomDownload: PIXIV_SKIP_AUTO_LOGIN=${process.env.PIXIV_SKIP_AUTO_LOGIN}, skipAutoLogin=${skipAutoLogin}, autoLogin=${!skipAutoLogin}`);
    await ensureValidToken({
      configPath,
      headless,
      username,
      password,
      autoLogin: !skipAutoLogin,
    });

    // Load config after ensuring token
    const resolvedConfigPath = getConfigPath(configPath);
    const config = loadConfig(resolvedConfigPath);

    // Use tag search with random selection for both novels and illustrations
    let tempConfig;
    if (targetType === 'novel') {
      // Use tag search with random selection for novels
      const tagList = POPULAR_NOVEL_TAGS;
      const randomTag = tagList[Math.floor(Math.random() * tagList.length)];
      logger.info(`Randomly selected tag: ${randomTag} (type: ${targetType})`);
      
      tempConfig = {
        ...config,
        targets: [
          {
            type: targetType,
            tag: randomTag,
            limit: limit,
            searchTarget: 'partial_match_for_tags' as const,
            random: true, // Enable random selection
          },
        ],
      };
    } else {
      // Use tag search with random selection for illustrations
      const tagList = POPULAR_TAGS;
      const randomTag = tagList[Math.floor(Math.random() * tagList.length)];
      logger.info(`Randomly selected tag: ${randomTag} (type: ${targetType})`);
      
      tempConfig = {
        ...config,
        targets: [
          {
            type: targetType,
            tag: randomTag,
            limit: limit,
            searchTarget: 'partial_match_for_tags' as const,
            random: true, // Enable random selection
          },
        ],
      };
    }
    const database = new Database(config.storage!.databasePath!);
    database.migrate();

    const auth = new PixivAuth(config.pixiv, config.network!, database, resolvedConfigPath);
    const pixivClient = new PixivClient(auth, config);
    const fileService = new FileService(config.storage!);
    const downloadManager = new DownloadManager(tempConfig, pixivClient, database, fileService);

    await downloadManager.initialise();
    logger.info(`Starting random ${targetType} download (count: ${limit})...`);
    await downloadManager.runAllTargets();
    logger.info(`Random ${targetType} download completed!`);

    database.close();
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error during random download', {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    process.exit(1);
  }
}

/**
 * Handle scheduler command
 */
async function handleScheduler(): Promise<void> {
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    const database = new Database(config.storage!.databasePath!);
    database.migrate();

    const auth = new PixivAuth(config.pixiv, config.network!, database, configPath);
    const pixivClient = new PixivClient(auth, config);
    const fileService = new FileService(config.storage!);
    const downloadManager = new DownloadManager(config, pixivClient, database, fileService);

    await downloadManager.initialise();

    // Start token maintenance service for automatic token refresh
    const tokenMaintenance = createTokenMaintenanceService(
      auth,
      config.pixiv,
      config.network!,
      config
    );
    if (tokenMaintenance) {
      tokenMaintenance.start();
    }

    const runJob = async () => {
      // Apply initial delay if configured
      if (config.initialDelay && config.initialDelay > 0) {
        logger.info(`Waiting ${config.initialDelay}ms before starting download...`);
        await new Promise(resolve => setTimeout(resolve, config.initialDelay!));
      }
      
      logger.info('='.repeat(60));
      logger.info('Starting scheduled Pixiv download job');
      logger.info('='.repeat(60));
      
      const startTime = Date.now();
      await downloadManager.runAllTargets();
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      logger.info('='.repeat(60));
      logger.info(`Scheduled download job finished (took ${duration}s)`);
      logger.info('='.repeat(60));
    };

    const scheduler = new Scheduler(config.scheduler!);
    scheduler.start(runJob);

    const cleanup = () => {
      logger.info('Shutting down PixivFlow');
      scheduler.stop();
      if (tokenMaintenance) {
        tokenMaintenance.stop();
      }
      database.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (error) {
    logger.error('Fatal error while starting PixivFlow', {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    process.exit(1);
  }
}

/**
 * Handle migrate-config command
 */
async function handleMigrateConfig(args: {
  options: Record<string, string | boolean>;
  positional: string[];
}): Promise<void> {
  try {
    const configPathArg = (args.options.config as string) || undefined;
    const configPath = getConfigPath(configPathArg);
    const dryRun = !!(args.options['dry-run'] || args.options.dryRun);
    const json = !!(args.options.json || args.options.j);

    if (!json) {
      console.log(`[i]: Migrating configuration paths in: ${configPath}`);
      if (dryRun) {
        console.log('[i]: Dry run mode - no changes will be made');
      }
    }

    const migrator = new ConfigPathMigrator(process.cwd());
    const result = migrator.migrateConfigFile(configPath, dryRun);

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.changes.length > 0) {
        console.log(`\n[+]: Found ${result.changes.length} path(s) to migrate:`);
        result.changes.forEach((change) => {
          console.log(`  - ${change.field}:`);
          console.log(`    Old: ${change.oldPath}`);
          console.log(`    New: ${change.newPath}`);
          console.log(`    Reason: ${change.reason}`);
        });

        if (dryRun) {
          console.log('\n[i]: This was a dry run. Use without --dry-run to apply changes.');
        } else if (result.updated) {
          console.log('\n[+]: Configuration file has been updated!');
        }
      } else {
        console.log('[i]: No paths need migration. Configuration is already portable.');
      }

      if (result.errors.length > 0) {
        console.log(`\n[!]: ${result.errors.length} error(s) encountered:`);
        result.errors.forEach((error) => {
          console.log(`  - ${error.field}: ${error.error}`);
        });
      }
    }

    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('[!]: Migration failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Handle normalize command
 */
async function handleNormalize(args: {
  options: Record<string, string | boolean>;
  positional: string[];
}): Promise<void> {
  let database: Database | null = null;
  try {
    const configPathArg = (args.options.config as string) || undefined;
    const configPath = getConfigPath(configPathArg);
    const config = loadConfig(configPath);

    const dryRun = !!(args.options['dry-run'] || args.options.dryRun);
    const json = !!(args.options.json || args.options.j);
    const normalizeNames = !(args.options['no-normalize-names'] || args.options.noNormalizeNames);
    const reorganize = !(args.options['no-reorganize'] || args.options.noReorganize);
    const updateDatabase = !(args.options['no-update-db'] || args.options.noUpdateDb);
    const type = (args.options.type as string) || 'all';

    if (!json) {
      console.log('[i]: Starting file normalization...');
      if (dryRun) {
        console.log('[i]: Dry run mode - no changes will be made');
      }
      console.log(`[i]: Type: ${type}`);
      console.log(`[i]: Normalize names: ${normalizeNames}`);
      console.log(`[i]: Reorganize: ${reorganize}`);
      console.log(`[i]: Update database: ${updateDatabase}`);
    }

    // Initialize database and file service
    database = new Database(config.storage!.databasePath!);
    database.migrate();

    const fileService = new FileService(config.storage!);
    const normalizationService = new FileNormalizationService(
      config.storage!,
      fileService,
      database
    );

    // Run normalization
    const result = await normalizationService.normalizeFiles({
      dryRun,
      normalizeNames,
      reorganize,
      updateDatabase,
      type: type as 'illustration' | 'novel' | 'all',
    });

    database.close();
    database = null;

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n[+]: File normalization completed!');
      console.log(`[i]: Total files: ${result.totalFiles}`);
      console.log(`[i]: Processed: ${result.processedFiles}`);
      console.log(`[i]: Moved: ${result.movedFiles}`);
      console.log(`[i]: Renamed: ${result.renamedFiles}`);
      console.log(`[i]: Database updated: ${result.updatedDatabase}`);
      console.log(`[i]: Skipped: ${result.skippedFiles}`);

      if (result.errors.length > 0) {
        console.log(`\n[!]: ${result.errors.length} error(s) encountered:`);
        result.errors.forEach((error) => {
          console.log(`  - ${error.file}: ${error.error}`);
        });
      }

      if (dryRun) {
        console.log('\n[i]: This was a dry run. Use without --dry-run to apply changes.');
      }
    }

    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    console.error('[!]: Normalization failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Main bootstrap function
 */
async function bootstrap() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.command;

  // Handle help
  if (
    !command ||
    command === 'help' ||
    command === '-h' ||
    command === '--help' ||
    args.options.help ||
    args.options.h
  ) {
    showHelp();
    return;
  }

  // Handle login commands
  if (command === 'login' || command === 'l' || command === 'login-interactive' || command === 'li') {
    await handleLogin(args);
    return;
  }

  if (command === 'login-headless' || command === 'lh') {
    await handleLoginHeadless(args);
    return;
  }

  if (command === 'refresh' || command === 'r') {
    await handleRefresh(args);
    return;
  }

  // Handle download command
  if (command === 'download') {
    await handleDownload(args);
    return;
  }

  // Handle random download command
  if (command === 'random' || command === 'rd') {
    await handleRandomDownload(args);
    return;
  }

  // Handle scheduler command
  if (command === 'scheduler') {
    await handleScheduler();
    return;
  }

  // Handle migrate-config command
  if (command === 'migrate-config' || command === 'mc') {
    await handleMigrateConfig(args);
    return;
  }

  // Handle normalize command
  if (command === 'normalize' || command === 'nf') {
    await handleNormalize(args);
    return;
  }

  // Default behavior: run downloader (backward compatibility)
  try {
    const configPathArg = (args.options.config as string) || undefined;
    const configPath = getConfigPath(configPathArg);
    const config = loadConfig(configPath);

    const database = new Database(config.storage!.databasePath!);
    database.migrate();

    const auth = new PixivAuth(config.pixiv, config.network!, database, configPath);
    const pixivClient = new PixivClient(auth, config);
    const fileService = new FileService(config.storage!);
    const downloadManager = new DownloadManager(config, pixivClient, database, fileService);

    await downloadManager.initialise();

    // Start token maintenance service for automatic token refresh
    const tokenMaintenance = createTokenMaintenanceService(
      auth,
      config.pixiv,
      config.network!,
      config
    );
    if (tokenMaintenance) {
      tokenMaintenance.start();
    }

    const runJob = async () => {
      // Apply initial delay if configured
      if (config.initialDelay && config.initialDelay > 0) {
        logger.info(`Waiting ${config.initialDelay}ms before starting download...`);
        await new Promise(resolve => setTimeout(resolve, config.initialDelay!));
      }
      
      logger.info('='.repeat(60));
      logger.info('Starting Pixiv download job');
      logger.info('='.repeat(60));
      
      const startTime = Date.now();
      await downloadManager.runAllTargets();
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      logger.info('='.repeat(60));
      logger.info(`Pixiv download job finished (took ${duration}s)`);
      logger.info('='.repeat(60));
    };

    const runOnce = !!(args.options.once || process.argv.includes('--once'));

    if (runOnce || !config.scheduler!.enabled) {
      if (!config.scheduler!.enabled && !runOnce) {
        logger.info('Scheduler disabled, running once and exiting');
      }
      await runJob();
      if (tokenMaintenance) {
        tokenMaintenance.stop();
      }
      database.close();
      process.exit(0);
    }

    const scheduler = new Scheduler(config.scheduler!);
    scheduler.start(runJob);

    const cleanup = () => {
      logger.info('Shutting down PixivFlow');
      scheduler.stop();
      if (tokenMaintenance) {
        tokenMaintenance.stop();
      }
      database.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (error) {
    logger.error('Fatal error while starting PixivFlow', {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    process.exit(1);
  }
}

bootstrap();

