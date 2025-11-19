#!/usr/bin/env node
import { loadConfig, getConfigPath as getConfigPathUtil } from './config';
import { StandaloneConfig } from './config/types';
import { logger } from './logger';
import { CommandRegistry } from './commands/CommandRegistry';
import { registerAllCommands, RefreshCommand, DownloadCommand, SchedulerCommand, VersionCommand, HelpCommand } from './commands';
import { ArgumentParser } from './cli/ArgumentParser';
import { AuthenticationError, ConfigError, VersionRequest, HelpRequest } from './utils/errors';
import { CommandArgs, CommandContext } from './commands/types';

/**
 * Handles fatal errors, prints user-friendly messages, and exits the process.
 */
function handleFatalError(error: unknown): void {
  if (error instanceof ConfigError) {
    console.error(`\n❌ Configuration Error: ${error.message}\n`);
    logger.error('Configuration error', { error: error.message });
  } else if (error instanceof AuthenticationError) {
    console.error('\n❌ Authentication Error');
    console.error('════════════════════════════════════════════════════════════════');
    console.error(error.message);
    console.error('');
    console.error('💡 Your refresh token may have expired or is invalid.');
    console.error('   Please login again to get a new refresh token:');
    console.error('');
    console.error('   • Interactive login:  pixivflow login');
    console.error('   • Headless login:     pixivflow login-headless');
    console.error('════════════════════════════════════════════════════════════════\n');
    logger.error('Authentication failed', { error: error.message });
  } else {
    logger.error('Fatal error during application startup', {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  }
  process.exit(1);
}

/**
 * Executes the given command.
 */
async function executeCommand(registry: CommandRegistry, commandName: string, context: CommandContext, args: CommandArgs): Promise<void> {
  const command = registry.find(commandName);
  if (!command) {
    console.error(`\n❌ Unknown command: ${commandName}`);
    
    // Provide command suggestions
    const suggestions = registry.getSuggestions(commandName);
    if (suggestions) {
      console.error(suggestions);
    }
    
    console.error('\n💡 Run "pixivflow help" to see all available commands');
    console.error('   Or "pixivflow help <command>" for specific command help\n');
    
    logger.warn(`Command not found: ${commandName}`);
    process.exit(1);
  }

  try {
    if (command.validate) {
      const validation = command.validate(args);
      if (!validation.valid) {
        console.error('[!]: Invalid arguments:');
        validation.errors.forEach((error) => console.error(`  - ${error}`));
        if (command.getUsage) {
          console.error(`\nUsage:\n${command.getUsage()}`);
        }
        process.exit(1);
      }
    }

    const result = await command.execute(context, args);
    if (!result.success) {
      logger.error('Command execution failed', { command: commandName, error: result.error });
      process.exit(1);
    }

    // Decide exit behavior based on command metadata (long running)
    const isLongRunning = typeof (command as any).getMetadata === 'function'
      ? (command as any).getMetadata().longRunning === true
      : false;
    if (!isLongRunning) {
      process.exit(0);
    }
  } catch (error) {
    logger.error('Unexpected error during command execution', {
      command: commandName,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    process.exit(1);
  }
}

/**
 * Executes the default behavior (download or scheduler) when no command is specified.
 */
async function executeDefaultBehavior(context: CommandContext, args: CommandArgs): Promise<void> {
  const commandName = context.config.scheduler?.enabled ? 'scheduler' : 'download';
  const command = new (commandName === 'scheduler' ? SchedulerCommand : DownloadCommand)();
  
  logger.info(`No command specified. Running default: ${commandName}`);
  
  try {
    const result = await command.execute(context, args);
    if (!result.success) {
      logger.error('Default command execution failed', { command: commandName, error: result.error });
      process.exit(1);
    }
    if (commandName === 'download') {
        process.exit(0);
    }
  } catch (error) {
    handleFatalError(error);
  }
}

/**
 * Main bootstrap function for the CLI.
 */
async function bootstrap() {
  const registry = new CommandRegistry();
  registerAllCommands(registry);

  let parsedArgs;
  try {
    parsedArgs = ArgumentParser.parse(process.argv.slice(2));
  } catch (error) {
    if (error instanceof VersionRequest) {
      await new VersionCommand().execute({} as CommandContext, { options: {}, positional: [] });
      return;
    }
    if (error instanceof HelpRequest) {
      const helpArgs: CommandArgs = { options: {}, positional: [error.command].filter((c): c is string => !!c) };
      await new HelpCommand().execute({} as CommandContext, helpArgs);
      return;
    }
    throw error;
  }

  const { command: commandName, options, positional } = parsedArgs;
  const commandArgs: CommandArgs = { options, positional };

  // --- Pre-execution hooks ---
  const configPath = getConfigPathUtil(options.config as string | undefined);
  const command = registry.find(commandName || '');
  if (command && command.name === 'refresh') {
    await RefreshCommand.preExecute(commandArgs, configPath);
  }

  // --- Config loading and context creation ---
  let config: StandaloneConfig;
  try {
    const isLoginCommand = ['login', 'l', 'login-interactive', 'li', 'login-headless'].includes(commandName || '');
    const tokenOptionalCommands = new Set(['config', 'dirs', 'logs', 'setup', 'status', 'health', 'maintain', 'normalize', 'migrate-config', 'backup', 'monitor', 'webui', 'w']);
    const isTokenOptional = commandName ? tokenOptionalCommands.has(commandName) : true;
    
    config = loadConfig(configPath, isLoginCommand || isTokenOptional || !commandName);
  } catch (error) {
    return handleFatalError(error);
  }

  const context: CommandContext = { config, logger, configPath };

  // --- Command execution ---
  if (commandName) {
    await executeCommand(registry, commandName, context, commandArgs);
  } else {
    await executeDefaultBehavior(context, commandArgs);
  }
}

bootstrap().catch(handleFatalError);
