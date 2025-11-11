/**
 * Login command - Interactive login
 */

import * as path from 'path';
import { BaseCommand } from './Command';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { TerminalLogin, LoginInfo } from '../terminal-login';
import { updateConfigWithToken } from '../utils/login-helper';

/**
 * Output login result
 */
function outputLoginResult(loginInfo: LoginInfo, json: boolean = false): void {
  if (json) {
    console.log(JSON.stringify(loginInfo.response || loginInfo, null, 2));
  } else {
    console.log('[+]: Success!');
    console.log(`access_token: ${loginInfo.access_token}`);
    console.log(`refresh_token: ${loginInfo.refresh_token}`);
    console.log(`expires_in: ${loginInfo.expires_in}`);
    if (loginInfo.user) {
      console.log(`user: ${loginInfo.user.name} (${loginInfo.user.account})`);
    }
  }
}

/**
 * Login command - supports both interactive and headless modes
 * 
 * Interactive mode: Opens browser for manual login
 * Headless mode: Uses provided credentials (requires -u and -p)
 */
export class LoginCommand extends BaseCommand {
  readonly name = 'login';
  readonly description = 'Login interactively (using Python gppt)';
  readonly aliases = ['l', 'login-interactive', 'li'];

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const json = !!(args.options.json || args.options.j);
    let username = (args.options.username || args.options.u) as string | undefined;
    let password = (args.options.password || args.options.p) as string | undefined;
    const configPath = (args.options.config as string) || context.configPath;

    try {
      // Check if credentials were provided via command line arguments
      const credentialsProvided = !!(username && password);
      
      // Use headless mode only if credentials were provided via command line
      // Otherwise use interactive mode (opens browser window for manual login)
      const useHeadless = credentialsProvided;
      
      if (!useHeadless) {
        // Interactive mode: no need to input credentials, just open browser
        console.log('[i]: Interactive login mode');
        console.log('[i]: A Chrome browser window will open. Please login manually in the browser.');
        console.log('[i]: You do NOT need to enter credentials here - just wait for the browser to open.');
        console.log('[i]: After you complete login in the browser, the token will be automatically retrieved.');
      }
      
      const login = new TerminalLogin({
        headless: useHeadless,
        username: useHeadless ? username : undefined,
        password: useHeadless ? password : undefined,
      });

      const loginInfo = await login.login({
        headless: useHeadless,
        username: useHeadless ? username : undefined,
        password: useHeadless ? password : undefined,
      });

      // Try to update config file with refresh token
      const finalConfigPath = configPath || 
        process.env.PIXIV_DOWNLOADER_CONFIG || 
        path.resolve('config/standalone.config.json');
      
      try {
        await updateConfigWithToken(finalConfigPath, loginInfo.refresh_token);
        if (!json) {
          console.log(`[+]: Config updated at ${finalConfigPath}`);
        }
      } catch (error) {
        // Config update failed, but login succeeded
        if (!json) {
          context.logger.warn('Login successful but config update failed', { error });
        }
      }

      outputLoginResult(loginInfo, json);
      return this.success('Login successful', loginInfo);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[!]: Login failed:', errorMessage);
      return this.failure(errorMessage, { error });
    }
  }

  getUsage(): string {
    return `login [options]
  
Options:
  -u, --username <id>    Pixiv ID (email, username, or account name)
  -p, --password <pwd>   Your Pixiv password
  -j, --json             Output response as JSON
  --config <path>        Path to config file

Examples:
  pixivflow login                    # Interactive login (opens browser)
  pixivflow login -u user@example.com -p password  # Headless login`;
  }
}















