/**
 * Refresh token command
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { TerminalLogin, LoginInfo } from '../terminal-login';
import { updateConfigWithToken } from '../utils/login-helper';
import { generateDefaultConfig } from '../config/defaults';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../logger';

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
 * Refresh token command
 */
export class RefreshCommand extends BaseCommand {
  readonly name = 'refresh';
  readonly description = 'Login with an existing refresh token or refresh access token (suitable for headless servers)';
  readonly aliases = ['r', 'login-token', 'token-login', 'set-token', 'lt'];
  readonly requiresToken = false;
  readonly metadata = {
    category: CommandCategory.AUTHENTICATION,
    requiresAuth: false,
    longRunning: false,
  };

  /**
   * Handles updating the config file with the refresh token before the main execution.
   * This allows the command to work even if the config file has a placeholder token.
   */
  static async preExecute(args: CommandArgs, configPath: string): Promise<void> {
    const refreshToken = args.positional[0] || (args.options.token as string);
    if (!refreshToken) {
      // No token provided, nothing to do. The validation in `execute` will catch this.
      return;
    }

    try {
      // Check if config file exists
      try {
        await fs.access(configPath);
        // Config file exists, update it with the token
        await updateConfigWithToken(configPath, refreshToken);
        logger.info('Updated config file with refresh token before validation');
      } catch {
        // Config file doesn't exist, create it with default structure
        const defaultConfig = generateDefaultConfig();
        defaultConfig.pixiv.refreshToken = refreshToken;
        // Ensure directory exists
        const configDir = path.dirname(configPath);
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
        logger.info('Created config file with refresh token');
      }
    } catch (error) {
      // If updating config fails, log warning but continue.
      // The refresh command will still work with the provided token.
      logger.warn('Failed to update config file with refresh token, continuing anyway', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  validate(args: CommandArgs): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const refreshToken = args.positional[0] || (args.options.token as string);

    if (!refreshToken) {
      errors.push('Refresh token is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const validation = this.validate(args);
    if (!validation.valid) {
      console.error('[!]: Refresh token is required');
      console.error('Usage: pixivflow refresh <refresh_token>');
      return this.failure(validation.errors.join(', '));
    }

    const json = !!(args.options.json || args.options.j);
    const refreshToken = args.positional[0] || (args.options.token as string);

    try {
      const loginInfo = await TerminalLogin.refresh(refreshToken);
      outputLoginResult(loginInfo, json);
      return this.success('Token refresh successful', loginInfo);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      if (!json) {
        console.error('[!]: Token refresh failed:', errorMessage);
        if (errorStack && process.env.DEBUG) {
          console.error('[!]: Stack trace:', errorStack);
        }
        context.logger.error('Token refresh failed', { error: errorMessage, stack: errorStack });
      } else {
        console.error(JSON.stringify({ error: errorMessage, success: false }, null, 2));
      }
      return this.failure(errorMessage, { error, stack: errorStack });
    }
  }

  getUsage(): string {
    return `refresh <refresh_token> [options]

Login using an existing refresh token, or refresh access token.\nThis is recommended for servers without GUI browsers.\nThe token will be written into your config automatically.

Arguments:
  <refresh_token>        Refresh token to use for refreshing access token [required]

Options:
  -j, --json             Output response as JSON

Examples:
  pixivflow refresh <refresh_token>
  pixivflow login-token <refresh_token>
  pixivflow set-token <refresh_token>
  pixivflow refresh <refresh_token> --json`;
  }
}
