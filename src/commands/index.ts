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
import { WebUICommand } from './WebUICommand';
import { HealthCommand } from './HealthCommand';
import { StatusCommand } from './StatusCommand';
import { LogsCommand } from './LogsCommand';
import { ConfigCommand } from './ConfigCommand';
import { BackupCommand } from './BackupCommand';
import { MaintainCommand } from './MaintainCommand';
import { MonitorCommand } from './MonitorCommand';
import { SetupCommand } from './SetupCommand';
import { DirsCommand } from './DirsCommand';

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
  registry.register(new WebUICommand());
  registry.register(new HealthCommand());
  registry.register(new StatusCommand());
  registry.register(new LogsCommand());
  registry.register(new ConfigCommand());
  registry.register(new BackupCommand());
  registry.register(new MaintainCommand());
  registry.register(new MonitorCommand());
  registry.register(new SetupCommand());
  registry.register(new DirsCommand());
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
  WebUICommand,
  HealthCommand,
  StatusCommand,
  LogsCommand,
  ConfigCommand,
  BackupCommand,
  MaintainCommand,
  MonitorCommand,
  SetupCommand,
  DirsCommand,
};
















