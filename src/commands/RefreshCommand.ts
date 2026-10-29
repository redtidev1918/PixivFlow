/**
 * Refresh token command
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { printAuthTokenResponse, publicLoginResult, safeAuthError } from '../terminal-login/output';
import { updateConfigWithToken } from '../utils/login-helper';
import { generateDefaultConfig } from '../config/defaults';
import { readStdinAll } from '../utils/stdin';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../logger';


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
    printsOwnErrors: true,
  };

  /**
   * Handles updating the config file with the refresh token before the main execution.
   * This allows the command to work even if the config file has a placeholder token.
   */
  static async preExecute(args: CommandArgs, configPath: string): Promise<void> {
    let refreshToken = (args.positional[0] || (args.options.token as string)) as string | undefined;
    // '-' reads the token from stdin (e.g. cat token.txt | pixivflow refresh -)
    // so it never lands in shell history or the process list.
    if (refreshToken === '-') {
      refreshToken = (await readStdinAll()).trim();
      args.options.token = refreshToken;
    }
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
        error: 'Config update failed; credentials were not printed',
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
      const { TerminalLogin } = await import('../terminal-login');
      const loginInfo = await TerminalLogin.refresh(refreshToken);
      printAuthTokenResponse(loginInfo, json);
      return this.success('Token refresh successful', publicLoginResult(loginInfo));
    } catch (error) {
      const safeError = safeAuthError(error);
      const errorMessage = safeError.message;
      
      if (!json) {
        console.error('[!]: Token refresh failed:', errorMessage);
        context.logger.error('Token refresh failed', { error: safeError });
      } else {
        console.error(JSON.stringify({ error: errorMessage, success: false }, null, 2));
      }
      return this.failure(safeError);
    }
  }

  getUsage(): string {
    return `refresh <refresh_token> [options]

Login using an existing refresh token, or refresh access token.\nThis is recommended for servers without GUI browsers.\nThe token will be written into your config automatically.

Arguments:
  <refresh_token>        Refresh token to use for refreshing access token
  -                      Read the token from stdin instead (keeps it out of
                         shell history), e.g. cat token.txt | pixivflow refresh -

Options:
  --token <token>        Provide the refresh token via option
  -j, --json             Output a credential-free result as JSON

Examples:
  pixivflow refresh <refresh_token>
  cat token.txt | pixivflow refresh -
  pixivflow login-token <refresh_token>
  pixivflow set-token <refresh_token>
  pixivflow refresh <refresh_token> --json`;
  }
}
