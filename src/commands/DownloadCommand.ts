/**
 * Download command
 */

import { BaseCommand } from './Command';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { getConfigPath, loadConfig } from '../config';
import { Database } from '../storage/Database';
import { PixivAuth } from '../pixiv/AuthClient';
import { PixivClient } from '../pixiv/PixivClient';
import { FileService } from '../download/FileService';
import { DownloadManager } from '../download/DownloadManager';
import { withResources, createResource } from '../utils/resource-manager';
import { parsePixivUrl, parsedUrlToTargetConfig } from '../utils/pixiv-url-parser';
import { AuthenticationError, ConfigError } from '../utils/errors';

/**
 * Download command - Run download job once
 */
export class DownloadCommand extends BaseCommand {
  readonly name = 'download';
  readonly description = 'Run download job once';
  readonly aliases: string[] = [];

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const configPathArg = (args.options.config as string) || undefined;
      const configPath = getConfigPath(configPathArg);
      let config = loadConfig(configPath);

      // Support custom targets via --targets parameter or --url parameter
      const targetsArg = (args.options.targets as string) || undefined;
      const urlArg = (args.options.url as string) || undefined;
      
      if (urlArg) {
        // Parse URL and convert to target config
        const parsed = parsePixivUrl(urlArg);
        if (!parsed || (!parsed.id && !parsed.seriesId && !parsed.userId)) {
          return this.failure(`Invalid Pixiv URL: ${urlArg}. Supported formats: https://www.pixiv.net/artworks/{id}, https://www.pixiv.net/novel/show.php?id={id}, https://www.pixiv.net/novel/series/{id}, https://www.pixiv.net/users/{userId}`);
        }
        
        try {
          const targetConfig = parsedUrlToTargetConfig(parsed);
          config = { ...config, targets: [targetConfig] };
          const idInfo = targetConfig.illustId || targetConfig.novelId || targetConfig.seriesId || targetConfig.userId;
          context.logger.info(`Using URL target: ${urlArg} -> ${targetConfig.type} ${targetConfig.userId ? 'User' : 'ID'} ${idInfo}`);
        } catch (error) {
          context.logger.error('Failed to convert URL to target config', { 
            error: error instanceof Error ? error.message : String(error) 
          });
          return this.failure('Failed to convert URL to target config', { error });
        }
      } else if (targetsArg) {
        try {
          const customTargets = JSON.parse(targetsArg);
          // If it's an array, use it directly; if it's an object, wrap it in an array
          if (Array.isArray(customTargets)) {
            config = { ...config, targets: customTargets };
          } else if (customTargets && typeof customTargets === 'object') {
            // Check if it has a 'targets' property (full config) or is a single target
            if (customTargets.targets && Array.isArray(customTargets.targets)) {
              config = { ...config, targets: customTargets.targets };
            } else {
              // Single target object, wrap in array
              config = { ...config, targets: [customTargets] };
            }
          }
          const targetCount = Array.isArray(customTargets) 
            ? customTargets.length 
            : (customTargets.targets && Array.isArray(customTargets.targets) 
                ? customTargets.targets.length 
                : 1);
          context.logger.info(`Using custom targets from command line: ${targetCount} target(s)`);
        } catch (error) {
          context.logger.error('Failed to parse --targets parameter', { 
            error: error instanceof Error ? error.message : String(error) 
          });
          return this.failure('Failed to parse --targets parameter', { error });
        }
      }

      // Apply initial delay if configured
      if (config.initialDelay && config.initialDelay > 0) {
        context.logger.info(`Waiting ${config.initialDelay}ms before starting download...`);
        await new Promise(resolve => setTimeout(resolve, config.initialDelay!));
      }

      const database = new Database(config.storage!.databasePath!);
      database.migrate();

      // Use resource manager to ensure cleanup
      await withResources(async (manager) => {
        manager.register(createResource(() => {
          database.close();
        }, 'Database'));

        const auth = new PixivAuth(config.pixiv, config.network!, database, configPath);
        const pixivClient = new PixivClient(auth, config);
        const fileService = new FileService(config.storage!);
        const downloadManager = new DownloadManager(config, pixivClient, database, fileService);

        await downloadManager.initialise();
        
        // Display directory information at the start
        const { getDirectoryInfo, displayInitializationInfo } = await import('../utils/directory-info');
        const dirInfo = getDirectoryInfo(config, configPath);
        displayInitializationInfo(dirInfo);
        
        context.logger.info('='.repeat(60));
        context.logger.info('Starting Pixiv download job');
        context.logger.info('='.repeat(60));
        
        const startTime = Date.now();
        await downloadManager.runAllTargets();
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        context.logger.info('='.repeat(60));
        context.logger.info(`Pixiv download job finished (took ${duration}s)`);
        context.logger.info('='.repeat(60));
      });

      return this.success('Download completed successfully');
    } catch (error) {
      // Handle authentication errors with friendly guidance
      if (error instanceof AuthenticationError) {
        const friendlyMessage = [
          '\n❌ Authentication Error',
          '════════════════════════════════════════════════════════════════',
          error.message,
          '',
          '💡 Your refresh token has expired or is invalid.',
          '   Please login again to get a new refresh token:',
          '',
          '   • Interactive login:  pixivflow login',
          '   • Headless login:     pixivflow login-headless',
          '',
          '════════════════════════════════════════════════════════════════',
        ].join('\n');
        
        console.error(friendlyMessage);
        context.logger.error('Authentication failed - refresh token expired or invalid', {
          error: error.message,
        });
        return this.failure(error.message, { error });
      }
      
      // Handle config errors with friendly guidance
      if (error instanceof ConfigError) {
        console.error('\n' + error.message);
        context.logger.error('Configuration error', {
          error: error.message,
        });
        return this.failure(error.message, { error });
      }
      
      // Handle other errors
      context.logger.error('Fatal error while running download', {
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      return this.failure(
        error instanceof Error ? error.message : String(error),
        { error }
      );
    }
  }

  getUsage(): string {
    return `download [options]
  
Options:
  --config <path>        Path to config file
  --targets <json>       Custom targets JSON (overrides config file targets)
  --url <url>            Download from Pixiv URL or ID (overrides config file targets)

Supported URL formats:
  • Standard artworks:        https://www.pixiv.net/artworks/{id}
  • With language code:       https://www.pixiv.net/en/artworks/{id}
  • Short format:             https://www.pixiv.net/i/{id}
  • Legacy format:            https://www.pixiv.net/member_illust.php?illust_id={id}
  • User's artwork:           https://www.pixiv.net/users/{userId}/artworks/{id}
  • Novel:                    https://www.pixiv.net/novel/show.php?id={id}
  • User's novel:             https://www.pixiv.net/users/{userId}/novels/{id}
  • Novel series:             https://www.pixiv.net/novel/series/{id}
  • User profile:             https://www.pixiv.net/users/{userId}
  • Direct ID:                {id} (treated as illustration)

Examples:
  pixivflow download
  pixivflow download --targets '[{"type":"novel","tag":"アークナイツ","limit":5}]'
  pixivflow download --url "https://www.pixiv.net/artworks/12345678"
  pixivflow download --url "https://www.pixiv.net/en/artworks/12345678"
  pixivflow download --url "https://www.pixiv.net/i/12345678"
  pixivflow download --url "https://www.pixiv.net/member_illust.php?illust_id=12345678"
  pixivflow download --url "https://www.pixiv.net/novel/show.php?id=26132156"
  pixivflow download --url "https://www.pixiv.net/users/123456/artworks/789012"
  pixivflow download --url "https://www.pixiv.net/users/123456"
  pixivflow download --url "12345678"`;
  }
}





















