/**
 * Base command interface
 */

import { CommandArgs, CommandContext, CommandResult, ValidationResult } from './types';
import { CommandMetadata, DEFAULT_METADATA } from './metadata';

/**
 * Base command interface that all commands must implement
 */
export interface Command {
  /**
   * Command name (primary identifier)
   */
  readonly name: string;

  /**
   * Command description (for help text)
   */
  readonly description: string;

  /**
   * Whether the command requires a valid Pixiv token to run.
   * Defaults to true.
   */
  readonly requiresToken?: boolean;
  
  /**
   * Command aliases (alternative names)
   */
  readonly aliases?: string[];

  /**
   * Command metadata for better organization
   */
  readonly metadata?: CommandMetadata;

  /**
   * Execute the command
   * @param context Command execution context
   * @param args Command arguments
   * @returns Command execution result
   */
  execute(context: CommandContext, args: CommandArgs): Promise<CommandResult>;

  /**
   * Validate command arguments (optional)
   * @param args Command arguments
   * @returns Validation result
   */
  validate?(args: CommandArgs): ValidationResult;

  /**
   * Get command usage information (optional)
   * @returns Usage string
   */
  getUsage?(): string;
}

/**
 * Abstract base command class with common functionality
 */
export abstract class BaseCommand implements Command {
  abstract readonly name: string;
  abstract readonly description: string;
  readonly aliases?: string[];
  readonly requiresToken: boolean = true;
  readonly metadata?: CommandMetadata;

  abstract execute(context: CommandContext, args: CommandArgs): Promise<CommandResult>;

  validate?(args: CommandArgs): ValidationResult {
    return { valid: true, errors: [] };
  }

  getUsage?(): string {
    return `${this.name}: ${this.description}`;
  }

  /**
   * Create a success result
   */
  protected success(message?: string, data?: unknown): CommandResult {
    return { success: true, message, data };
  }

  /**
   * Create a failure result
   */
  protected failure(error: Error | string, data?: unknown): CommandResult {
    const errorObj = error instanceof Error ? error : new Error(error);
    return { success: false, error: errorObj, data };
  }

  /**
   * Check if command name or alias matches
   */
  matches(name: string): boolean {
    if (this.name === name) {
      return true;
    }
    if (this.aliases) {
      return this.aliases.includes(name);
    }
    return false;
  }

  /**
   * Get command metadata with defaults
   */
  getMetadata(): CommandMetadata {
    return this.metadata || DEFAULT_METADATA;
  }
}

