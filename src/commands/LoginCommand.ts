/**
 * Login command - Interactive login
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { printAuthTokenResponse, publicLoginResult, safeAuthError } from '../terminal-login/output';
import { updateConfigWithToken } from '../utils/login-helper';
import { getConfigPath } from '../config';


/**
 * Login command - supports both interactive and headless modes
 * 
 * Interactive mode: Opens browser for manual login
 * Headless mode: Uses provided credentials (requires -u and -p)
 */
export class LoginCommand extends BaseCommand {
  readonly name = 'login';
  readonly description = 'Login interactively in a browser window (headless with -u/-p)';
  readonly aliases = ['l', 'login-interactive', 'li'];
  readonly requiresToken = false;
  readonly metadata = {
    category: CommandCategory.AUTHENTICATION,
    requiresAuth: false,
    longRunning: false,
    printsOwnErrors: true,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const json = !!(args.options.json || args.options.j);
    let username = (args.options.username || args.options.u) as string | undefined;
    let password = (args.options.password || args.options.p) as string | undefined;
    const configPath = (args.options.config as string) || context.configPath;

    try {
      const { TerminalLogin } = await import('../terminal-login');
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
      // Use getConfigPath to ensure we use the same config path resolution logic
      const finalConfigPath = configPath || getConfigPath();
      
      try {
        await updateConfigWithToken(finalConfigPath, loginInfo.refresh_token);
        if (!json) {
          console.log(`[+]: Config updated at ${finalConfigPath}`);
        }
      } catch (error) {
        // Config update failed, but login succeeded
        if (!json) {
          context.logger.warn('Login successful but config update failed; credentials were not printed');
        }
      }

      printAuthTokenResponse(loginInfo, json);
      if (!json) {
        console.log('[i]: Credentials are stored in the selected config when the update succeeds. Keep that file private.');
      }
      return this.success('Login successful', publicLoginResult(loginInfo));
    } catch (error) {
      const safeError = safeAuthError(error);
      const errorMessage = safeError.message;
      console.error('[!]: Login failed:', errorMessage);
      return this.failure(safeError);
    }
  }

  getUsage(): string {
    return `login [options]

Log in to Pixiv and store the refresh token in your configuration file.

Login methods (tried in this order):
  1. pixiv-token-getter  - recommended; opens a local Chrome/Chromium window
  2. Puppeteer           - Node.js native, no Python required
  3. Python gppt         - fallback only; requires Python 3.9+ (installed on demand)

  Interactive mode (no credentials): a browser window opens, you log in there,
  and the token is retrieved automatically. Chrome/Chromium must be installed.
  Headless mode (-u and -p): no browser window, credentials are used directly.

Options:
  -u, --username <id>    Pixiv ID (email, username, or account name)
  -p, --password <pwd>   Your Pixiv password
  -j, --json             Output a credential-free result as JSON
  --config <path>        Configuration file to update (default: PIXIV_DOWNLOADER_CONFIG,
                         then the detected config)

Security:
  Tokens and raw OAuth responses are never printed, including with --json.
  Never share your configuration or credential files; they contain secrets.

Examples:
  pixivflow login                    # Interactive login (opens browser)
  pixivflow login -u user@example.com -p password  # Headless login`;
  }
}






















