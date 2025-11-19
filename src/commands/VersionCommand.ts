/**
 * Version command - displays the application version
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

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
      // Go up from dist/commands/ to the project root
      const packageJsonPath = path.resolve(__dirname, '../../package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const { version } = JSON.parse(packageJsonContent);
      
      console.log(`PixivFlow v${version}`);
      
      return {
        success: true,
        message: `Version: ${version}`,
        data: { version }
      };
    } catch (error) {
      context.logger.error('Failed to read version from package.json', { error });
      console.error('Error: Could not read version information.');
      return {
        success: false,
        message: 'Failed to read version',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}


