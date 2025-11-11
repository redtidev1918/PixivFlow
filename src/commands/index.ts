/**
 * Command exports and registration
 */

import { CommandRegistry } from './CommandRegistry';
import { HelpCommand } from './HelpCommand';
import { LoginCommand } from './LoginCommand';
import { LoginHeadlessCommand } from './LoginHeadlessCommand';
import { RefreshCommand } from './RefreshCommand';
import { DownloadCommand } from './DownloadCommand';
import { RandomDownloadCommand } from './RandomDownloadCommand';
import { SchedulerCommand } from './SchedulerCommand';
import { MigrateConfigCommand } from './MigrateConfigCommand';
import { NormalizeCommand } from './NormalizeCommand';

/**
 * Create and register all commands
 */
export function registerAllCommands(registry: CommandRegistry): void {
  registry.register(new HelpCommand());
  registry.register(new LoginCommand());
  registry.register(new LoginHeadlessCommand());
  registry.register(new RefreshCommand());
  registry.register(new DownloadCommand());
  registry.register(new RandomDownloadCommand());
  registry.register(new SchedulerCommand());
  registry.register(new MigrateConfigCommand());
  registry.register(new NormalizeCommand());
}

/**
 * Export all command classes
 */
export {
  HelpCommand,
  LoginCommand,
  LoginHeadlessCommand,
  RefreshCommand,
  DownloadCommand,
  RandomDownloadCommand,
  SchedulerCommand,
  MigrateConfigCommand,
  NormalizeCommand,
};














