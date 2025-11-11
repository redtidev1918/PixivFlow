#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as readline from 'node:readline';

import { StandaloneConfig } from './config';
import { TerminalLogin, LoginInfo } from './terminal-login';

const PIXIV_CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT';
const PIXIV_CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj';
const PIXIV_USER_AGENT = 'PixivAndroidApp/5.0.234 (Android 11; Pixel 6)';

export class SetupWizard {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  private async authenticateWithPixiv(): Promise<string> {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('🔑 Pixiv 账户认证');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log('ℹ 我们需要您的 Pixiv 账号信息来下载作品');
    console.log('\n有两种登录方式：\n');
    console.log('  \x1b[0;36m1. 自动登录\x1b[0m（推荐）- 在终端输入用户名和密码');
    console.log('  \x1b[0;36m2. 手动输入\x1b[0m - 如果您已经有 refresh token\n');

    const loginMethod = await this.question('请选择登录方式 [1/2，默认 1]: ');
    
    if (loginMethod === '2') {
      // 手动输入 refresh token
      const refreshToken = await this.question('请输入您的 refresh token: ');
      if (!refreshToken) {
        throw new Error('Refresh token 不能为空');
      }
      console.log('✓ 已使用提供的 refresh token');
      return refreshToken;
    }

    // 自动登录 - 使用 TerminalLogin
    console.log('\n▶ 准备登录...');
    console.log('ℹ 请在终端中输入您的 Pixiv 账号信息\n');

    const login = new TerminalLogin();
    let loginInfo: LoginInfo;

    try {
      loginInfo = await login.login();
      console.log(`\n✓ 认证成功！欢迎，${loginInfo.user.name} (@${loginInfo.user.account})`);
      return loginInfo.refresh_token;
    } catch (error) {
      console.error('\n❌ 登录失败:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async collectConfiguration(): Promise<StandaloneConfig> {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('⚙️  配置向导');
    console.log('════════════════════════════════════════════════════════════════\n');

    const refreshToken = await this.authenticateWithPixiv();

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📁 存储配置');
    console.log('════════════════════════════════════════════════════════════════\n');

    const downloadDir = await this.question('下载目录路径 [./downloads]: ');
    const databasePath = await this.question('数据库文件路径 [./data/pixiv-downloader.db]: ');

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('🏷️  下载目标配置');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log('请配置要下载的标签（tags）。您可以添加多个标签。\n');

    const targets: StandaloneConfig['targets'] = [];
    let addMore = true;
    let targetIndex = 1;

    while (addMore) {
      console.log(`\n--- 目标 #${targetIndex} ---`);
      const type = await this.question('类型 (illustration/novel) [illustration]: ');
      const tag = await this.question('标签名称: ');
      
      if (!tag) {
        console.log('标签名称不能为空，跳过此目标。');
        continue;
      }

      const limit = await this.question('每次运行下载数量限制 [10]: ');
      const searchTarget = await this.question(
        '搜索类型 (partial_match_for_tags/exact_match_for_tags/title_and_caption) [partial_match_for_tags]: '
      );

      targets.push({
        type: (type || 'illustration') as 'illustration' | 'novel',
        tag,
        limit: limit ? parseInt(limit, 10) : 10,
        searchTarget: (searchTarget || 'partial_match_for_tags') as any,
      });

      targetIndex++;
      const more = await this.question('\n是否添加更多标签？(y/N): ');
      addMore = more.toLowerCase() === 'y';
    }

    if (targets.length === 0) {
      console.log('\n未配置任何下载目标，添加默认示例目标...');
      targets.push({
        type: 'illustration',
        tag: 'イラスト',
        limit: 10,
        searchTarget: 'partial_match_for_tags',
      });
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('⏰ 调度配置');
    console.log('════════════════════════════════════════════════════════════════\n');

    const enableScheduler = await this.question('启用定时任务？(Y/n): ');
    const enabled = enableScheduler.toLowerCase() !== 'n';
    let cron = '0 3 * * *';
    let timezone = 'Asia/Shanghai';

    if (enabled) {
      const cronInput = await this.question('Cron 表达式 [0 3 * * *] (每天凌晨3点): ');
      if (cronInput) cron = cronInput;

      const timezoneInput = await this.question('时区 [Asia/Shanghai]: ');
      if (timezoneInput) timezone = timezoneInput;
    }

    const config: StandaloneConfig = {
      logLevel: 'info',
      pixiv: {
        clientId: PIXIV_CLIENT_ID,
        clientSecret: PIXIV_CLIENT_SECRET,
        deviceToken: '',
        refreshToken,
        userAgent: PIXIV_USER_AGENT,
      },
      network: {
        timeoutMs: 15000,
        retries: 3,
      },
      storage: {
        databasePath: databasePath || './data/pixiv-downloader.db',
        downloadDirectory: downloadDir || './downloads',
        illustrationDirectory: resolve(downloadDir || './downloads', 'illustrations'),
        novelDirectory: resolve(downloadDir || './downloads', 'novels'),
      },
      scheduler: {
        enabled,
        cron,
        timezone,
      },
      targets,
    };

    return config;
  }

  private saveConfig(config: StandaloneConfig, outputPath: string) {
    // 确保目录存在
    const configDir = resolve(outputPath, '..');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // 确保存储目录存在
    if (config.storage && !existsSync(config.storage.downloadDirectory!)) {
      mkdirSync(config.storage.downloadDirectory!, { recursive: true });
    }

    // 确保数据库目录存在
    const dbDir = resolve(config.storage!.databasePath!, '..');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`\n✓ 配置文件已保存到: ${outputPath}`);
  }

  public async run() {
    try {
      console.clear();
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║                                                                ║');
      console.log('║        PixivFlow - 配置向导                       ║');
      console.log('║        Interactive Setup Wizard                                ║');
      console.log('║                                                                ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');

      console.log('欢迎使用 PixivFlow 配置向导！');
      console.log('此向导将帮助您配置独立运行模式。\n');

      const config = await this.collectConfiguration();

      console.log('\n════════════════════════════════════════════════════════════════');
      console.log('💾 保存配置');
      console.log('════════════════════════════════════════════════════════════════\n');

      const outputPath = resolve('config/standalone.config.json');
      this.saveConfig(config, outputPath);

      console.log('\n════════════════════════════════════════════════════════════════');
      console.log('✅ 配置完成！');
      console.log('════════════════════════════════════════════════════════════════\n');
      console.log('您现在可以使用以下命令启动下载器：\n');
      console.log('  • 运行一次:  npm run download');
      console.log('  • 定时运行:  npm run standalone:run\n');
      console.log('配置文件位于: config/standalone.config.json');
      console.log('您可以随时编辑此文件来修改配置。\n');

      this.rl.close();
      // Don't exit if called from command system
      if (require.main === module) {
        process.exit(0);
      }
    } catch (error) {
      console.error('\n❌ 配置过程中发生错误:');
      console.error(error instanceof Error ? error.message : String(error));
      this.rl.close();
      // Don't exit if called from command system
      if (require.main === module) {
        process.exit(1);
      }
      throw error;
    }
  }
}

// 运行向导（仅在直接执行时）
if (require.main === module) {
  const wizard = new SetupWizard();
  wizard.run();
}

