import { loadConfig, getConfigPath } from './config';
import { DownloadManager } from './download/DownloadManager';
import { FileService } from './download/FileService';
import { logger } from './logger';
import { PixivAuth } from './auth/PixivAuth';
import { createPixivFlowClient } from './pixiv-client/createPixivFlowClient';
import { Database } from './storage/Database';

// 热门标签列表，用于随机选择
const POPULAR_TAGS = [
  '風景', 'イラスト', 'オリジナル', '女の子', '男の子',
  '猫', '犬', '空', '海', '桜', '花', '星空', '夕日',
  'illustration', 'art', 'anime', 'manga', 'cute',
  'beautiful', 'nature', 'sky', 'sunset', 'flower'
];

async function randomDownload() {
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    
    // 随机选择一个标签
    const randomTag = POPULAR_TAGS[Math.floor(Math.random() * POPULAR_TAGS.length)];
    logger.info(`随机选择标签: ${randomTag}`);

    // 创建临时配置，只下载1张图
    const tempConfig = {
      ...config,
      targets: [
        {
          type: 'illustration' as const,
          tag: randomTag,
          limit: 1,
          searchTarget: 'partial_match_for_tags' as const,
        },
      ],
    };

    const database = new Database(config.storage!.databasePath!);
    database.migrate();

    const auth = new PixivAuth(config.pixiv, config.network!, database, configPath);
    const pixivClient = createPixivFlowClient(auth, config, database);
    const fileService = new FileService(config.storage!);
    const downloadManager = new DownloadManager(tempConfig, pixivClient, database, fileService);

    await downloadManager.initialise();
    logger.info('开始随机下载...');
    await downloadManager.runAllTargets();
    logger.info('随机下载完成！');

    database.close();
    process.exit(0);
  } catch (error) {
    logger.error('随机下载失败', {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    process.exit(1);
  }
}

randomDownload();

