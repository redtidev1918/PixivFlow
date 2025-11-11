/**
 * Help command - displays usage information
 */

import { BaseCommand } from './Command';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { CommandRegistry } from './CommandRegistry';

/**
 * Help command implementation
 */
export class HelpCommand extends BaseCommand {
  readonly name = 'help';
  readonly description = 'Show help message';
  readonly aliases = ['-h', '--help'];

  constructor(private registry?: CommandRegistry) {
    super();
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    this.showHelp();
    return this.success('Help message displayed');
  }

  private showHelp(): void {
    console.log(`
Usage: pixivflow [command] [options]

╔════════════════════════════════════════════════════════════════╗
║              PixivFlow - 完全独立的后端 CLI 工具                ║
║              所有功能都可以在无前端环境下完美运行               ║
╚════════════════════════════════════════════════════════════════╝

Commands:
  login, l                    Login interactively (using Python gppt)
  login-interactive, li       Login interactively (explicit)
  login-headless, lh          Login in headless mode (requires -u and -p)
  refresh, r <token>          Refresh access token using refresh token
  download                    Run download job once
  random, rd                  Login (if needed) and download a random image
  scheduler                   Start scheduler (default if enabled in config)
  migrate-config, mc          Migrate configuration paths (convert absolute to relative)
  normalize, nf               Normalize and reorganize downloaded files
  help, -h, --help            Show this help message

Options:
  -u, --username <id>         Pixiv ID (email, username, or account name)
  -p, --password <password>   Your Pixiv password
  -j, --json                  Output response as JSON
  --once                      Run download job once and exit
  --config <path>             Path to config file (default: config/standalone.config.json)
  --targets <json>            Custom targets JSON (overrides config file targets)

Examples:
  pixivflow login                    # Interactive login (prompts for username/password in terminal)
  pixivflow login -u user@example.com -p password  # Login with credentials (no browser window)
  pixivflow lh -u user@example.com -p password  # Headless login (no browser window)
  pixivflow refresh <refresh_token>  # Refresh token
  pixivflow download                 # Run download once
  pixivflow download --targets '[{"type":"novel","tag":"アークナイツ","limit":5,"mode":"ranking","rankingMode":"day","rankingDate":"YESTERDAY","filterTag":"アークナイツ"}]'  # Download with custom targets
  pixivflow random                   # Login (if needed) and download a random image
  pixivflow scheduler                # Start scheduler
  pixivflow normalize                # Normalize and reorganize downloaded files
  pixivflow normalize --dry-run      # Preview changes without applying them
  pixivflow normalize --type novel   # Only normalize novel files

Note: 
  - Login requires Python 3.9+ and gppt package (pip install gppt or pip3 install gppt)
  - This is a standalone CLI tool that works independently of any frontend
  - All core features (download, login, scheduler) work perfectly without WebUI
`);
  }
}













