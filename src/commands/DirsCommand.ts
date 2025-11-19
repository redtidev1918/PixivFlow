/**
 * Dirs command - display directory information
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { getDirectoryInfo, displayDirectoryInfo } from '../utils/directory-info';

/**
 * Dirs command implementation
 */
export class DirsCommand extends BaseCommand {
  readonly name = 'dirs';
  readonly description = 'Display directory information (where files are saved)';
  readonly aliases = ['directories', 'paths'];
  readonly metadata = {
    category: CommandCategory.UTILITY,
    requiresAuth: false,
    longRunning: false,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const info = getDirectoryInfo(context.config, context.configPath);
      displayDirectoryInfo(info, { verbose: args.options.verbose === true });
      
      return this.success('Directory information displayed');
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : String(error),
        { error }
      );
    }
  }

  getUsage(): string {
    return `dirs [options]

Display all directory paths where files are saved.

Options:
  --verbose, -v    Show detailed information

Examples:
  pixivflow dirs
  pixivflow dirs --verbose
`;
  }
}

