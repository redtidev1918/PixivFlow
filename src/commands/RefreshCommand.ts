/**
 * Refresh token command
 */

import { BaseCommand } from './Command';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { TerminalLogin, LoginInfo } from '../terminal-login';

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





















































