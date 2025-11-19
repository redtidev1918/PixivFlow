/**
 * Setup command - interactive configuration wizard
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
// Import SetupWizard - it's exported from setup-wizard.ts
// We need to dynamically import it since it's a standalone script

/**
 * Setup command implementation
 */
export class SetupCommand extends BaseCommand {
  readonly name = 'setup';
  readonly description = 'Interactive configuration wizard for first-time setup';
  readonly aliases = ['init', 'wizard'];
  readonly metadata = {
    category: CommandCategory.CONFIGURATION,
    requiresAuth: false,
    longRunning: false,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      // Dynamically import SetupWizard to avoid circular dependencies
      const { SetupWizard } = await import('../setup-wizard');
      const wizard = new SetupWizard();
      await wizard.run();

      return {
        success: true,
        message: 'Setup completed successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Setup failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  getUsage(): string {
    return `setup [options]

Interactive configuration wizard for first-time setup.

This command guides you through the initial configuration process,
including authentication setup and download target configuration.

Examples:
  pixivflow setup                              # Start setup wizard`;
  }
}

