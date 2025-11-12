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
    console.log('🔑 Pixiv Account Authentication');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log('ℹ We need your Pixiv account information to download artworks');
    console.log('\nThere are two login methods:\n');
    console.log('  \x1b[0;36m1. Auto Login\x1b[0m (Recommended) - Enter username and password in terminal');
    console.log('  \x1b[0;36m2. Manual Input\x1b[0m - If you already have a refresh token\n');

    const loginMethod = await this.question('Please select login method [1/2, default 1]: ');
    
    if (loginMethod === '2') {
      // Manual refresh token input
      const refreshToken = await this.question('Please enter your refresh token: ');
      if (!refreshToken) {
        throw new Error('Refresh token cannot be empty');
      }
      console.log('✓ Using provided refresh token');
      return refreshToken;
    }

    // Auto login - using TerminalLogin
    console.log('\n▶ Preparing to login...');
    console.log('ℹ Please enter your Pixiv account information in the terminal\n');

    const login = new TerminalLogin();
    let loginInfo: LoginInfo;

    try {
      loginInfo = await login.login();
      console.log(`\n✓ Authentication successful! Welcome, ${loginInfo.user.name} (@${loginInfo.user.account})`);
      return loginInfo.refresh_token;
    } catch (error) {
      console.error('\n❌ Login failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async collectConfiguration(): Promise<StandaloneConfig> {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('⚙️  Configuration Wizard');
    console.log('════════════════════════════════════════════════════════════════\n');

    const refreshToken = await this.authenticateWithPixiv();

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📁 Storage Configuration');
    console.log('════════════════════════════════════════════════════════════════\n');

    const downloadDir = await this.question('Download directory path [./downloads]: ');
    const databasePath = await this.question('Database file path [./data/pixiv-downloader.db]: ');

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('🏷️  Download Target Configuration');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log('Please configure the tags to download. You can add multiple tags.\n');

    const targets: StandaloneConfig['targets'] = [];
    let addMore = true;
    let targetIndex = 1;

    while (addMore) {
      console.log(`\n--- Target #${targetIndex} ---`);
      const type = await this.question('Type (illustration/novel) [illustration]: ');
      const tag = await this.question('Tag name: ');
      
      if (!tag) {
        console.log('Tag name cannot be empty, skipping this target.');
        continue;
      }

      const limit = await this.question('Download limit per run [10]: ');
      const searchTarget = await this.question(
        'Search type (partial_match_for_tags/exact_match_for_tags/title_and_caption) [partial_match_for_tags]: '
      );

      targets.push({
        type: (type || 'illustration') as 'illustration' | 'novel',
        tag,
        limit: limit ? parseInt(limit, 10) : 10,
        searchTarget: (searchTarget || 'partial_match_for_tags') as any,
      });

      targetIndex++;
      const more = await this.question('\nAdd more tags? (y/N): ');
      addMore = more.toLowerCase() === 'y';
    }

    if (targets.length === 0) {
      console.log('\nNo download targets configured, adding default example target...');
      targets.push({
        type: 'illustration',
        tag: 'イラスト',
        limit: 10,
        searchTarget: 'partial_match_for_tags',
      });
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('⏰ Scheduler Configuration');
    console.log('════════════════════════════════════════════════════════════════\n');

    const enableScheduler = await this.question('Enable scheduled tasks? (Y/n): ');
    const enabled = enableScheduler.toLowerCase() !== 'n';
    let cron = '0 3 * * *';
    let timezone = 'Asia/Shanghai';

    if (enabled) {
      const cronInput = await this.question('Cron expression [0 3 * * *] (3 AM daily): ');
      if (cronInput) cron = cronInput;

      const timezoneInput = await this.question('Timezone [Asia/Shanghai]: ');
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
    // Ensure directory exists
    const configDir = resolve(outputPath, '..');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Ensure storage directory exists
    if (config.storage && !existsSync(config.storage.downloadDirectory!)) {
      mkdirSync(config.storage.downloadDirectory!, { recursive: true });
    }

    // Ensure database directory exists
    const dbDir = resolve(config.storage!.databasePath!, '..');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`\n✓ Configuration file saved to: ${outputPath}`);
  }

  public async run() {
    try {
      console.clear();
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║                                                                ║');
      console.log('║        PixivFlow - Interactive Setup Wizard                    ║');
      console.log('║                                                                ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');

      console.log('Welcome to PixivFlow Setup Wizard!');
      console.log('This wizard will help you configure standalone mode.\n');

      const config = await this.collectConfiguration();

      console.log('\n════════════════════════════════════════════════════════════════');
      console.log('💾 Saving Configuration');
      console.log('════════════════════════════════════════════════════════════════\n');

      const outputPath = resolve('config/standalone.config.json');
      this.saveConfig(config, outputPath);

      console.log('\n════════════════════════════════════════════════════════════════');
      console.log('✅ Configuration Complete!');
      console.log('════════════════════════════════════════════════════════════════\n');
      
      // Display directory information
      const { getDirectoryInfo, displayInitializationInfo } = await import('./utils/directory-info');
      const dirInfo = getDirectoryInfo(config, outputPath);
      displayInitializationInfo(dirInfo);
      
      console.log('You can now use the following commands to start the downloader:\n');
      console.log('  • Run once:     npm run download');
      console.log('  • Scheduled:    npm run standalone:run');
      console.log('  • View dirs:    pixivflow dirs\n');
      console.log('Configuration file: config/standalone.config.json');
      console.log('You can edit this file anytime to modify the configuration.\n');

      this.rl.close();
      // Don't exit if called from command system
      if (require.main === module) {
        process.exit(0);
      }
    } catch (error) {
      console.error('\n❌ Error occurred during configuration:');
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

// Run wizard (only when executed directly)
if (require.main === module) {
  const wizard = new SetupWizard();
  wizard.run();
}

