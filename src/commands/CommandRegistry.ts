/**
 * Command registry for managing and routing commands
 */

import { Command } from './Command';
import { CommandArgs, CommandContext, CommandResult } from './types';

/**
 * Command registry that manages all available commands
 */
export class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  /**
   * Register a command
   * @param command Command to register
   */
  register(command: Command): void {
    // Register by primary name
    this.commands.set(command.name, command);

    // Register by aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        if (this.commands.has(alias)) {
          throw new Error(`Alias "${alias}" is already registered`);
        }
        this.commands.set(alias, command);
      }
    }
  }

  /**
   * Register multiple commands
   * @param commands Commands to register
   */
  registerAll(commands: Command[]): void {
    for (const command of commands) {
      this.register(command);
    }
  }

  /**
   * Get a command by name or alias
   * @param name Command name or alias
   * @returns Command or undefined if not found
   */
  get(name: string): Command | undefined {
    return this.commands.get(name);
  }

  /**
   * Find a command by name or alias
   * @param nameOrAlias Command name or alias
   * @returns Command or undefined if not found
   */
  find(nameOrAlias: string): Command | undefined {
    return this.get(nameOrAlias);
  }

  /**
   * Get all registered commands (unique by primary name)
   * @returns Array of unique commands
   */
  getAll(): Command[] {
    const seen = new Set<string>();
    const result: Command[] = [];

    for (const command of this.commands.values()) {
      if (!seen.has(command.name)) {
        seen.add(command.name);
        result.push(command);
      }
    }

    return result;
  }

  /**
   * Check if a command is registered
   * @param name Command name or alias
   * @returns True if command is registered
   */
  has(name: string): boolean {
    return this.commands.has(name);
  }

  /**
   * Execute a command
   * @param name Command name or alias
   * @param context Command execution context
   * @param args Command arguments
   * @returns Command execution result
   */
  async execute(
    name: string,
    context: CommandContext,
    args: CommandArgs
  ): Promise<CommandResult> {
    const command = this.get(name);
    if (!command) {
      return {
        success: false,
        error: new Error(`Command "${name}" not found`),
      };
    }

    // Validate arguments if validation is available
    if (command.validate) {
      const validation = command.validate(args);
      if (!validation.valid) {
        return {
          success: false,
          error: new Error(`Invalid arguments: ${validation.errors.join(', ')}`),
        };
      }
    }

    // Execute command
    try {
      return await command.execute(context, args);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Get command count
   * @returns Number of unique commands
   */
  size(): number {
    return this.getAll().length;
  }

  /**
   * Clear all registered commands
   */
  clear(): void {
    this.commands.clear();
  }
}

/**
 * Global command registry instance
 */
export const commandRegistry = new CommandRegistry();
























