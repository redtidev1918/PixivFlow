#!/usr/bin/env node
import { loadConfig, getConfigPath as getConfigPathUtil } from './config';
import { StandaloneConfig } from './config/types';
import { logger } from './logger';
import { CommandRegistry } from './commands/CommandRegistry';
import { formatCommandResult, formatCommandFailure, commandFailureReason } from './commands/CommandResultRenderer';
import { registerAllCommands, RefreshCommand, DownloadCommand, SchedulerCommand, VersionCommand, HelpCommand } from './commands';
import { ArgumentParser } from './cli/ArgumentParser';
import { handleFatalError } from './cli/fatalError';
import { VersionRequest, HelpRequest } from './utils/errors';
import { CommandArgs, CommandContext } from './commands/types';
import { resolveSchedules } from './scheduler/schedules';

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

    // Commands that return their output instead of printing it need the entry
    // point to render it — otherwise the answer is computed and thrown away
    // (that is what made `pixivflow delivery status` print nothing).
    const metadata = typeof (command as any).getMetadata === 'function'
      ? (command as any).getMetadata()
      : undefined;

    if (!result.success) {
      // Failure Contract (Deploy `AGENTS.md` §25): an exit code alone is not an
      // answer. The failing stage and its reason must survive to both the
      // operator and the structured log — `error: {}` in a log line is exactly
      // what made a failing `reconcile` undiagnosable (the logger now expands
      // `Error` into `{name,message,stack}`).
      logger.error('Command execution failed', {
        command: commandName,
        stage: 'command.execute',
        reason: commandFailureReason(result, commandName),
        retryable: false,
        error: result.error,
      });
      if (metadata?.printsOwnErrors !== true) {
        console.error(formatCommandFailure(result, commandName));
      }
      // A batch command distinguishes "nothing succeeded" from "the process could
      // not run at all"; honour the explicit code when it provides one.
      process.exit(result.exitCode ?? 1);
    }

    if (metadata?.rendersResult === true) {
      const text = formatCommandResult(result, { json: args.options.json === true });
      if (text) {
        console.log(text);
      }
    }

    // Decide exit behavior based on command metadata (long running)
    const isLongRunning = metadata?.longRunning === true;
    if (!isLongRunning) {
      process.exit(result.exitCode ?? 0);
    }
  } catch (error) {
    // Pass the error itself: the logger expands it into
    // `{name, message, stack, cause, …contract fields}`. A pre-formatted
    // `error.stack` string dropped the `code` an operator greps for.
    logger.error('Unexpected error during command execution', {
      command: commandName,
      stage: 'command.execute',
      retryable: false,
      error: error instanceof Error ? error : String(error),
    });
    console.error(formatCommandFailure({ error: error instanceof Error ? error : undefined }, commandName));
    process.exit(1);
  }
}

/**
 * Executes the default behavior (download or scheduler) when no command is specified.
 */
async function executeDefaultBehavior(context: CommandContext, args: CommandArgs): Promise<void> {
  const commandName = resolveSchedules(context.config).some(schedule => schedule.enabled)
    ? 'scheduler'
    : 'download';
  const command = new (commandName === 'scheduler' ? SchedulerCommand : DownloadCommand)();
  
  logger.info(`No command specified. Running default: ${commandName}`);
  
  try {
    const result = await command.execute(context, args);
    if (!result.success) {
      logger.error('Default command execution failed', {
        command: commandName,
        stage: 'command.execute',
        reason: commandFailureReason(result, commandName),
        retryable: false,
        error: result.error,
      });
      console.error(formatCommandFailure(result, commandName));
      process.exit(result.exitCode ?? 1);
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
    const tokenOptionalCommands = new Set(['config', 'dirs', 'logs', 'setup', 'status', 'health', 'maintain', 'normalize', 'migrate-config', 'backup', 'monitor', 'outbox', 'runs', 'webui', 'w', 'diagnose', 'gateway', 'gateways', 'delivery']);
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
