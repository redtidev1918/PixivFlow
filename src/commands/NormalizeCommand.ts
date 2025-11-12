/**
 * Normalize command
 */

import { BaseCommand } from './Command';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { getConfigPath, loadConfig } from '../config';
import { Database } from '../storage/Database';
import { FileService } from '../download/FileService';
import { FileNormalizationService } from '../download/FileNormalizationService';

/**
 * Normalize command - Normalize and reorganize downloaded files
 */
export class NormalizeCommand extends BaseCommand {
  readonly name = 'normalize';
  readonly description = 'Normalize and reorganize downloaded files';
  readonly aliases = ['nf'];

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    let database: Database | null = null;
    try {
      const configPathArg = (args.options.config as string) || undefined;
      const configPath = getConfigPath(configPathArg);
      const config = loadConfig(configPath);

      const dryRun = !!(args.options['dry-run'] || args.options.dryRun);
      const json = !!(args.options.json || args.options.j);
      const normalizeNames = !(args.options['no-normalize-names'] || args.options.noNormalizeNames);
      const reorganize = !(args.options['no-reorganize'] || args.options.noReorganize);
      const updateDatabase = !(args.options['no-update-db'] || args.options.noUpdateDb);
      const type = (args.options.type as string) || 'all';

      if (!json) {
        console.log('[i]: Starting file normalization...');
        if (dryRun) {
          console.log('[i]: Dry run mode - no changes will be made');
        }
        console.log(`[i]: Type: ${type}`);
        console.log(`[i]: Normalize names: ${normalizeNames}`);
        console.log(`[i]: Reorganize: ${reorganize}`);
        console.log(`[i]: Update database: ${updateDatabase}`);
      }

      // Initialize database and file service
      database = new Database(config.storage!.databasePath!);
      database.migrate();

      const fileService = new FileService(config.storage!);
      const normalizationService = new FileNormalizationService(
        config.storage!,
        fileService,
        database
      );

      // Run normalization
      const result = await normalizationService.normalizeFiles({
        dryRun,
        normalizeNames,
        reorganize,
        updateDatabase,
        type: type as 'illustration' | 'novel' | 'all',
      });

      database.close();
      database = null;

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\n[+]: File normalization completed!');
        console.log(`[i]: Total files: ${result.totalFiles}`);
        console.log(`[i]: Processed: ${result.processedFiles}`);
        console.log(`[i]: Moved: ${result.movedFiles}`);
        console.log(`[i]: Renamed: ${result.renamedFiles}`);
        console.log(`[i]: Database updated: ${result.updatedDatabase}`);
        console.log(`[i]: Skipped: ${result.skippedFiles}`);

        if (result.errors.length > 0) {
          console.log(`\n[!]: ${result.errors.length} error(s) encountered:`);
          result.errors.forEach((error) => {
            console.log(`  - ${error.file}: ${error.error}`);
          });
        }

        if (dryRun) {
          console.log('\n[i]: This was a dry run. Use without --dry-run to apply changes.');
        }
      }

      const success = result.errors.length === 0;
      return success 
        ? this.success('Normalization completed', result)
        : this.failure('Normalization completed with errors', result);
    } catch (error) {
      if (database) {
        try {
          database.close();
        } catch (closeError) {
          // Ignore close errors
        }
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[!]: Normalization failed:', errorMessage);
      return this.failure(errorMessage, { error });
    }
  }

  getUsage(): string {
    return `normalize [options]
  
Options:
  --config <path>              Path to config file
  --dry-run                    Preview changes without applying them
  --type <type>                Type: illustration, novel, or all (default: all)
  --no-normalize-names         Skip name normalization
  --no-reorganize               Skip file reorganization
  --no-update-db                Skip database updates
  -j, --json                   Output response as JSON

Examples:
  pixivflow normalize
  pixivflow normalize --dry-run
  pixivflow normalize --type novel`;
  }
}

















































