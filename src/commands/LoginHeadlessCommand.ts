/**
 * Login headless command - Headless login with credentials
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
 * Login headless command - requires username and password
 */
export class LoginHeadlessCommand extends BaseCommand {
  readonly name = 'login-headless';
  readonly description = 'Login in headless mode (requires -u and -p)';
  readonly aliases = ['lh'];

  validate(args: CommandArgs): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const username = (args.options.username || args.options.u) as string | undefined;
    const password = (args.options.password || args.options.p) as string | undefined;

    if (!username) {
      errors.push('Username (-u or --username) is required');
    }
    if (!password) {
      errors.push('Password (-p or --password) is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const validation = this.validate(args);
    if (!validation.valid) {
      console.error('[!]: Headless login requires username (-u) and password (-p)');
      console.error('Usage: pixivflow login-headless -u <username> -p <password>');
      return this.failure(validation.errors.join(', '));
    }

    const json = !!(args.options.json || args.options.j);
    const username = (args.options.username || args.options.u) as string;
    const password = (args.options.password || args.options.p) as string;
    const configPath = (args.options.config as string) || context.configPath;

    try {
      const login = new TerminalLogin({
        headless: true,
        username,
        password,
      });

      const loginInfo = await login.login({
        headless: true,
        username,
        password,
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
    return `login-headless -u <username> -p <password> [options]
  
Options:
  -u, --username <id>    Pixiv ID (email, username, or account name) [required]
  -p, --password <pwd>   Your Pixiv password [required]
  -j, --json             Output response as JSON
  --config <path>        Path to config file

Examples:
  pixivflow login-headless -u user@example.com -p password`;
  }
}















