/**
 * Command system types and interfaces
 */

import { StandaloneConfig } from '../config';
import { logger } from '../logger';

/**
 * Command execution context
 */
export interface CommandContext {
  config: StandaloneConfig;
  logger: typeof logger;
  configPath: string;
}

/**
 * Command arguments
 */
export interface CommandArgs {
  options: Record<string, string | boolean>;
  positional: string[];
}

/**
 * Command validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: Error;
  /**
   * Explicit process exit code. Batch/CI commands need meaningful codes (a
   * partial run and a failed run are different outcomes for a supervisor), so a
   * command may override the default 0/1.
   */
  exitCode?: number;
}

