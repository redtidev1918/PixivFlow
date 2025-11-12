/**
 * Random download command
 */

import { BaseCommand } from './Command';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { getConfigPath, loadConfig } from '../config';
import { Database } from '../storage/Database';
import { PixivAuth } from '../pixiv/AuthClient';
import { PixivClient } from '../pixiv/PixivClient';
import { FileService } from '../download/FileService';
import { DownloadManager } from '../download/DownloadManager';
import { ensureValidToken } from '../utils/login-helper';
import { withResources, createResource } from '../utils/resource-manager';

// 热门标签列表，用于随机选择
const POPULAR_TAGS = [
  '風景', 'イラスト', 'オリジナル', '女の子', '男の子',
  '猫', '犬', '空', '海', '桜', '花', '星空', '夕日',
  'illustration', 'art', 'anime', 'manga', 'cute',
  'beautiful', 'nature', 'sky', 'sunset', 'flower'
];

// 小说热门标签列表
const POPULAR_NOVEL_TAGS = [
  'オリジナル', '創作', '小説', '物語', 'ストーリー',
  '恋愛', 'ファンタジー', '日常', '青春', '冒険',
  'ミステリー', 'ホラー', 'SF', '歴史', '現代',
  'original', 'story', 'novel', 'romance', 'fantasy',
  'daily', 'youth', 'adventure', 'mystery', 'horror'
];

/**
 * Random download command - Login (if needed) and download a random image
 */
export class RandomDownloadCommand extends BaseCommand {
  readonly name = 'random';
  readonly description = 'Login (if needed) and download a random image';
  readonly aliases = ['rd'];

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const configPath = (args.options.config as string) || undefined;
      const username = (args.options.username || args.options.u) as string | undefined;
      const password = (args.options.password || args.options.p) as string | undefined;
      const headless = !!(args.options.headless || args.options.h);
      
      // Check if user wants to download novel or illustration
      // Default to novel if --novel is specified, otherwise check --type, default to illustration
      const typeArg = args.options.type as string | undefined;
      const novelFlag = !!(args.options.novel || args.options.n);
      const illustrationFlag = !!(args.options.illustration || args.options.i);
      
      let targetType: 'illustration' | 'novel' = 'illustration';
      if (novelFlag) {
        targetType = 'novel';
      } else if (illustrationFlag) {
        targetType = 'illustration';
      } else if (typeArg) {
        if (typeArg.toLowerCase() === 'novel') {
          targetType = 'novel';
        } else if (typeArg.toLowerCase() === 'illustration') {
          targetType = 'illustration';
        }
      } else {
        // Default to illustration (as documented)
        targetType = 'illustration';
      }

      // Parse count parameter (default: 1)
      // Support both --limit and --count for compatibility
      const countArg = args.options.limit || args.options.count || args.options.c || args.options.l;
      const downloadCount = countArg ? parseInt(String(countArg), 10) : 1;
      if (isNaN(downloadCount) || downloadCount < 1) {
        context.logger.warn(`Invalid count value: ${countArg}, using default: 1`);
      }
      const limit = isNaN(downloadCount) || downloadCount < 1 ? 1 : downloadCount;

      // Ensure valid token exists (login if needed)
      // In Docker environment, skip auto-login if PIXIV_SKIP_AUTO_LOGIN is set
      // because interactive login doesn't work in containers
      context.logger.info('Checking authentication status...');
      const skipAutoLogin = process.env.PIXIV_SKIP_AUTO_LOGIN === 'true';
      context.logger.debug(`RandomDownload: PIXIV_SKIP_AUTO_LOGIN=${process.env.PIXIV_SKIP_AUTO_LOGIN}, skipAutoLogin=${skipAutoLogin}, autoLogin=${!skipAutoLogin}`);
      await ensureValidToken({
        configPath,
        headless,
        username,
        password,
        autoLogin: !skipAutoLogin,
      });

      // Load config after ensuring token
      const resolvedConfigPath = getConfigPath(configPath);
      const config = loadConfig(resolvedConfigPath);

      // Use tag search with random selection for both novels and illustrations
      let tempConfig;
      if (targetType === 'novel') {
        // Use tag search with random selection for novels
        const tagList = POPULAR_NOVEL_TAGS;
        const randomTag = tagList[Math.floor(Math.random() * tagList.length)];
        context.logger.info(`Randomly selected tag: ${randomTag} (type: ${targetType})`);
        
        tempConfig = {
          ...config,
          targets: [
            {
              type: targetType,
              tag: randomTag,
              limit: limit,
              searchTarget: 'partial_match_for_tags' as const,
              random: true, // Enable random selection
            },
          ],
        };
      } else {
        // Use tag search with random selection for illustrations
        const tagList = POPULAR_TAGS;
        const randomTag = tagList[Math.floor(Math.random() * tagList.length)];
        context.logger.info(`Randomly selected tag: ${randomTag} (type: ${targetType})`);
        
        tempConfig = {
          ...config,
          targets: [
            {
              type: targetType,
              tag: randomTag,
              limit: limit,
              searchTarget: 'partial_match_for_tags' as const,
              random: true, // Enable random selection
            },
          ],
        };
      }
      const database = new Database(config.storage!.databasePath!);
      database.migrate();

      // Use resource manager to ensure cleanup
      await withResources(async (manager) => {
        manager.register(createResource(() => {
          database.close();
        }, 'Database'));

        const auth = new PixivAuth(config.pixiv, config.network!, database, resolvedConfigPath);
        const pixivClient = new PixivClient(auth, config);
        const fileService = new FileService(config.storage!);
        const downloadManager = new DownloadManager(tempConfig, pixivClient, database, fileService);

        await downloadManager.initialise();
        context.logger.info(`Starting random ${targetType} download (count: ${limit})...`);
        await downloadManager.runAllTargets();
        context.logger.info(`Random ${targetType} download completed!`);
      });

      return this.success(`Random ${targetType} download completed`, { type: targetType, limit });
    } catch (error) {
      context.logger.error('Fatal error during random download', {
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      return this.failure(
        error instanceof Error ? error.message : String(error),
        { error }
      );
    }
  }

  getUsage(): string {
    return `random [options]
  
Options:
  --type <type>          Type: illustration or novel (default: illustration)
  --novel, -n            Download novel (shortcut for --type novel)
  --illustration, -i     Download illustration (shortcut for --type illustration)
  --limit, --count, -c, -l <count>  Number of items to download (default: 1)
  --config <path>        Path to config file
  -u, --username <id>     Pixiv ID (for auto-login if needed)
  -p, --password <pwd>   Password (for auto-login if needed)
  --headless, -h         Use headless login mode

Examples:
  pixivflow random
  pixivflow random --type novel --limit 5`;
  }
}





















