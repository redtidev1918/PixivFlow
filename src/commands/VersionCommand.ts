/**
 * Version command - displays the application version
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { BUILD } from '../version';

/** Human-readable version with the baked-in commit SHA. */
export function versionString(): string {
  return `${BUILD.version} (commit ${BUILD.commit})`;
}

/**
 * Version command implementation
 */
export class VersionCommand extends BaseCommand {
  readonly name = 'version';
  readonly description = 'Show PixivFlow version';
  readonly aliases = ['v'];
  readonly metadata = {
    category: CommandCategory.UTILITY,
    requiresAuth: false,
    longRunning: false,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const line = `PixivFlow v${versionString()}`;
      console.log(line);
      return { success: true, message: `Version: ${versionString()}`, data: BUILD };
    } catch (error) {
      context.logger.error('Failed to read version information', { error });
      console.error('Error: Could not read version information.');
      return {
        success: false,
        message: 'Failed to read version',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}


