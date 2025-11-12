/**
 * Migrate config command
 */

import { BaseCommand } from './Command';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { getConfigPath } from '../config';
import { ConfigPathMigrator } from '../utils/config-path-migrator';

/**
 * Migrate config command - Migrate configuration paths (convert absolute to relative)
 */
export class MigrateConfigCommand extends BaseCommand {
  readonly name = 'migrate-config';
  readonly description = 'Migrate configuration paths (convert absolute to relative)';
  readonly aliases = ['mc'];

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const configPathArg = (args.options.config as string) || undefined;
      const configPath = getConfigPath(configPathArg);
      const dryRun = !!(args.options['dry-run'] || args.options.dryRun);
      const json = !!(args.options.json || args.options.j);

      if (!json) {
        console.log(`[i]: Migrating configuration paths in: ${configPath}`);
        if (dryRun) {
          console.log('[i]: Dry run mode - no changes will be made');
        }
      }

      const migrator = new ConfigPathMigrator(process.cwd());
      const result = migrator.migrateConfigFile(configPath, dryRun);

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.changes.length > 0) {
          console.log(`\n[+]: Found ${result.changes.length} path(s) to migrate:`);
          result.changes.forEach((change) => {
            console.log(`  - ${change.field}:`);
            console.log(`    Old: ${change.oldPath}`);
            console.log(`    New: ${change.newPath}`);
            console.log(`    Reason: ${change.reason}`);
          });

          if (dryRun) {
            console.log('\n[i]: This was a dry run. Use without --dry-run to apply changes.');
          } else if (result.updated) {
            console.log('\n[+]: Configuration file has been updated!');
          }
        } else {
          console.log('[i]: No paths need migration. Configuration is already portable.');
        }

        if (result.errors.length > 0) {
          console.log(`\n[!]: ${result.errors.length} error(s) encountered:`);
          result.errors.forEach((error) => {
            console.log(`  - ${error.field}: ${error.error}`);
          });
        }
      }

      const success = result.errors.length === 0;
      return success 
        ? this.success('Migration completed', result)
        : this.failure('Migration completed with errors', result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[!]: Migration failed:', errorMessage);
      return this.failure(errorMessage, { error });
    }
  }

  getUsage(): string {
    return `migrate-config [options]
  
Options:
  --config <path>        Path to config file
  --dry-run              Preview changes without applying them
  -j, --json             Output response as JSON

Examples:
  pixivflow migrate-config
  pixivflow migrate-config --dry-run`;
  }
}
















































