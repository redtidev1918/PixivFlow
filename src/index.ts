#!/usr/bin/env node
import { loadConfig, getConfigPath } from './config';
import { DownloadManager } from './download/DownloadManager';
import { FileService } from './download/FileService';
import { logger } from './logger';
import { PixivAuth } from './pixiv/AuthClient';
import { PixivClient } from './pixiv/PixivClient';
import { Scheduler } from './scheduler/Scheduler';
import { Database } from './storage/Database';
import { createTokenMaintenanceService } from './utils/token-maintenance';
import { CommandRegistry } from './commands/CommandRegistry';
import { registerAllCommands } from './commands';
import { ArgumentParser } from './cli/ArgumentParser';
import { getConfigPath as getConfigPathUtil } from './config';
import { updateConfigWithToken } from './utils/login-helper';
import { generateDefaultConfig } from './config/defaults';
import { AuthenticationError } from './utils/errors';
import * as fs from 'fs/promises';
import * as path from 'path';

// Use ArgumentParser from CLI module
const parseArgs = ArgumentParser.parse;

/**
 * Main entry point for PixivFlow CLI
 * 
 * This file has been refactored to use the new command system.
 * All command handlers have been moved to individual command classes in src/commands/.
 */

/**
 * Main bootstrap function
 */
async function bootstrap() {
  // Initialize command registry
  const registry = new CommandRegistry();
  registerAllCommands(registry);

  // Parse command line arguments
  const parsedArgs = parseArgs(process.argv.slice(2));
  const commandName = parsedArgs.command;

  // Prepare command context
  const configPath = getConfigPathUtil((parsedArgs.options.config as string) || undefined);
  
  // Special handling for refresh command: update config file with token before loading
  // This allows refresh command to work even when config file has placeholder token
  if (commandName === 'refresh' || commandName === 'r') {
    const refreshToken = parsedArgs.positional[0] || (parsedArgs.options.token as string);
    if (refreshToken) {
      try {
        // Check if config file exists
        try {
          await fs.access(configPath);
          // Config file exists, update it with the token
          await updateConfigWithToken(configPath, refreshToken);
          logger.info('Updated config file with refresh token before validation');
        } catch {
          // Config file doesn't exist, create it with default structure
          const defaultConfig = generateDefaultConfig();
          defaultConfig.pixiv.refreshToken = refreshToken;
          // Ensure directory exists
          const configDir = path.dirname(configPath);
          await fs.mkdir(configDir, { recursive: true });
          await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
          logger.info('Created config file with refresh token');
        }
      } catch (error) {
        // If updating config fails, log warning but continue
        // The refresh command will still work with the provided token
        logger.warn('Failed to update config file with refresh token, continuing anyway', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  
  // Skip config validation for login commands - they will create/update the config
  const isLoginCommand = commandName === 'login' || 
                         commandName === 'l' || 
                         commandName === 'login-interactive' || 
                         commandName === 'li' ||
                         commandName === 'login-headless';
  
  const config = loadConfig(configPath, isLoginCommand);
  const context = {
    config,
    logger,
    configPath,
  };

  // Convert parsed args to CommandArgs format
  const commandArgs: import('./commands/types').CommandArgs = {
    options: parsedArgs.options,
    positional: parsedArgs.positional,
  };

  // Handle help
  // Case 1: help command explicitly called (pixivflow help or pixivflow help <command>)
  if (commandName === 'help' || commandName === '-h' || commandName === '--help') {
    const helpCommand = registry.find('help');
    if (helpCommand) {
      const result = await helpCommand.execute(context, commandArgs);
      process.exit(result.success ? 0 : 1);
    }
    return;
  }

  // Case 2: --help or -h option used with a command (pixivflow <command> --help)
  if (parsedArgs.options.help || parsedArgs.options.h) {
    if (commandName) {
      // Show help for specific command
      const helpCommand = registry.find('help');
      if (helpCommand) {
        // Pass the command name as positional argument
        const helpArgs: import('./commands/types').CommandArgs = {
          options: {},
          positional: [commandName],
        };
        const result = await helpCommand.execute(context, helpArgs);
        process.exit(result.success ? 0 : 1);
      }
    } else {
      // No command specified, show general help
      const helpCommand = registry.find('help');
      if (helpCommand) {
        const result = await helpCommand.execute(context, commandArgs);
        process.exit(result.success ? 0 : 1);
      }
    }
    return;
  }

  // Case 3: No command specified, show general help
  if (!commandName) {
    const helpCommand = registry.find('help');
    if (helpCommand) {
      const result = await helpCommand.execute(context, commandArgs);
      process.exit(result.success ? 0 : 1);
    }
    return;
  }

  // Find and execute command
  const command = registry.find(commandName);
  if (command) {
    try {
      // Validate arguments if command has validation
      if (command.validate) {
        const validation = command.validate(commandArgs);
        if (!validation.valid) {
          console.error('[!]: Invalid arguments:');
          validation.errors.forEach((error) => {
            console.error(`  - ${error}`);
          });
          if (command.getUsage) {
            console.error(`\nUsage:\n${command.getUsage()}`);
          }
          process.exit(1);
        }
      }

      const result = await command.execute(context, commandArgs);
      
      // Handle command result
      if (!result.success) {
        const errorMessage = result.error?.message || 'Command failed';
        if (result.error) {
          logger.error('Command execution failed', { error: result.error });
        }
        process.exit(1);
      } else {
        // For scheduler and webui commands, don't exit (they run indefinitely)
        if (commandName !== 'scheduler' && commandName !== 'webui' && commandName !== 'w') {
          process.exit(0);
        }
      }
    } catch (error) {
      logger.error('Unexpected error during command execution', {
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      process.exit(1);
    }
    return;
  }

  // Default behavior: run downloader (backward compatibility)
  // If no command is provided and scheduler is enabled, start scheduler
  // Otherwise, run download once
  try {
    const configPathArg = (parsedArgs.options.config as string) || undefined;
    const resolvedConfigPath = getConfigPath(configPathArg);
    const resolvedConfig = loadConfig(resolvedConfigPath);

    const database = new Database(resolvedConfig.storage!.databasePath!);
    database.migrate();

    const auth = new PixivAuth(resolvedConfig.pixiv, resolvedConfig.network!, database, resolvedConfigPath);
    const pixivClient = new PixivClient(auth, resolvedConfig);
    const fileService = new FileService(resolvedConfig.storage!);
    const downloadManager = new DownloadManager(resolvedConfig, pixivClient, database, fileService);

    await downloadManager.initialise();

    // Start token maintenance service for automatic token refresh
    const tokenMaintenance = createTokenMaintenanceService(
      auth,
      resolvedConfig.pixiv,
      resolvedConfig.network!,
      resolvedConfig
    );
    if (tokenMaintenance) {
      tokenMaintenance.start();
    }

    const runJob = async () => {
      try {
        // Apply initial delay if configured
        if (resolvedConfig.initialDelay && resolvedConfig.initialDelay > 0) {
          logger.info(`Waiting ${resolvedConfig.initialDelay}ms before starting download...`);
          await new Promise(resolve => setTimeout(resolve, resolvedConfig.initialDelay!));
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
      } catch (error) {
        // Handle authentication errors during download
        if (error instanceof AuthenticationError) {
          console.error('\n❌ Authentication Error During Download');
          console.error('════════════════════════════════════════════════════════════════');
          console.error(error.message);
          console.error('');
          console.error('💡 Your refresh token has expired or is invalid.');
          console.error('   Please login again to get a new refresh token:');
          console.error('');
          console.error('   • Interactive login:  pixivflow login');
          console.error('   • (If you have source code: npm run login)');
          console.error('');
          console.error('════════════════════════════════════════════════════════════════\n');
          logger.error('Authentication failed during download', {
            error: error.message,
          });
          throw error; // Re-throw to be handled by outer catch
        }
        throw error; // Re-throw other errors
      }
    };

    const runOnce = !!(parsedArgs.options.once || process.argv.includes('--once'));

    if (runOnce || !resolvedConfig.scheduler!.enabled) {
      if (!resolvedConfig.scheduler!.enabled && !runOnce) {
        logger.info('Scheduler disabled, running once and exiting');
      }
      await runJob();
      if (tokenMaintenance) {
        tokenMaintenance.stop();
      }
      database.close();
      process.exit(0);
    }

    const scheduler = new Scheduler(resolvedConfig.scheduler!);
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
    // Handle authentication errors with friendly user guidance
    if (error instanceof AuthenticationError) {
      console.error('\n❌ Authentication Error');
      console.error('════════════════════════════════════════════════════════════════');
      console.error(error.message);
      console.error('');
      console.error('💡 Your refresh token has expired or is invalid.');
      console.error('   Please login again to get a new refresh token:');
      console.error('');
      console.error('   • Interactive login:  pixivflow login');
      console.error('   • (If you have source code: npm run login)');
      console.error('');
      console.error('════════════════════════════════════════════════════════════════\n');
      logger.error('Authentication failed - refresh token expired or invalid', {
        error: error.message,
      });
      process.exit(1);
    }
    
    logger.error('Fatal error while starting PixivFlow', {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    process.exit(1);
  }
}

bootstrap();

