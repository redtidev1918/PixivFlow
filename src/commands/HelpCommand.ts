/**
 * Help command - displays usage information
 */

import { BaseCommand } from './Command';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { CommandRegistry } from './CommandRegistry';
import { registerAllCommands } from './index';

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
    // Get command name from positional arguments
    const commandName = args.positional[0];
    
    if (commandName) {
      // Show specific command help
      this.showCommandHelp(commandName);
    } else {
      // Show general help
      this.showGeneralHelp();
    }
    
    return this.success('Help message displayed');
  }

  private getRegistry(): CommandRegistry {
    if (!this.registry) {
      this.registry = new CommandRegistry();
      registerAllCommands(this.registry);
    }
    return this.registry;
  }

  private showCommandHelp(commandName: string): void {
    const registry = this.getRegistry();
    const command = registry.find(commandName);

    if (!command) {
      console.error(`[!]: Unknown command: ${commandName}`);
      console.log('');
      console.log('Available commands:');
      const allCommands = registry.getAll();
      allCommands.forEach(cmd => {
        const aliases = cmd.aliases && cmd.aliases.length > 0 
          ? ` (${cmd.aliases.join(', ')})` 
          : '';
        console.log(`  ${cmd.name}${aliases} - ${cmd.description}`);
      });
      console.log('');
      console.log(`Run 'pixivflow help' for general help`);
      console.log(`Run 'pixivflow help <command>' for command-specific help`);
      return;
    }

    // Show detailed help for specific command
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Command: ${command.name}`);
    if (command.aliases && command.aliases.length > 0) {
      console.log(`Aliases: ${command.aliases.join(', ')}`);
    }
    console.log(`Description: ${command.description}`);
    console.log(`${'='.repeat(70)}\n`);

    if (command.getUsage) {
      const usage = command.getUsage();
      console.log(usage);
    } else {
      console.log(`Usage: pixivflow ${command.name}`);
      console.log(`\n${command.description}`);
    }

    console.log('');
  }

  private showGeneralHelp(): void {
    const registry = this.getRegistry();
    const allCommands = registry.getAll();

    // Group commands by category
    const categories: Record<string, import('./Command').Command[]> = {
      'Authentication': [],
      'Download': [],
      'Management': [],
      'Utility': [],
    };

    allCommands.forEach(cmd => {
      if (cmd.name === 'help') {
        categories['Utility'].push(cmd);
      } else if (['login', 'login-headless', 'refresh'].includes(cmd.name)) {
        categories['Authentication'].push(cmd);
      } else if (['download', 'random', 'scheduler'].includes(cmd.name)) {
        categories['Download'].push(cmd);
      } else if (['normalize', 'migrate-config'].includes(cmd.name)) {
        categories['Management'].push(cmd);
      } else {
        categories['Utility'].push(cmd);
      }
    });

    console.log(`
Usage: pixivflow [command] [options]

╔════════════════════════════════════════════════════════════════╗
║      🎨 PixivFlow - Intelligent Pixiv Automation Downloader   ║
╚════════════════════════════════════════════════════════════════╝

${this.formatCommandsByCategory(categories)}

Global Options:
  -u, --username <id>         Pixiv ID (email, username, or account name)
  -p, --password <password>   Your Pixiv password
  -j, --json                  Output response as JSON
  --config <path>             Path to config file (default: config/standalone.config.json)
  --targets <json>            Custom targets JSON (overrides config file targets)
  -h, --help                  Show help message

Quick Examples:
  pixivflow login                    # Interactive login (opens browser)
  pixivflow login -u user@example.com -p password  # Headless login
  pixivflow download                 # Run download once
  pixivflow download --targets '[{"type":"novel","tag":"アークナイツ","limit":5}]'
  pixivflow random                   # Download a random image
  pixivflow scheduler                # Start scheduler
  pixivflow normalize                # Normalize downloaded files
  pixivflow help <command>           # Show detailed help for a command

For more information:
  - Run 'pixivflow help <command>' for detailed help on a specific command
  - Config file: config/standalone.config.json
  - Login requires Python 3.9+ and gppt package (pip install gppt)

Note: 
  - This is a standalone CLI tool that works independently of any frontend
  - All core features work perfectly without WebUI
`);
  }

  private formatCommandsByCategory(categories: Record<string, import('./Command').Command[]>): string {
    let output = '';
    
    for (const [category, commands] of Object.entries(categories)) {
      if (commands.length === 0) continue;
      
      output += `${category}:\n`;
      commands.forEach((cmd: import('./Command').Command) => {
        const aliases = cmd.aliases && cmd.aliases.length > 0 
          ? `, ${cmd.aliases.join(', ')}` 
          : '';
        const fullName = `${cmd.name}${aliases}`;
        // Calculate padding to align descriptions (target width: 30)
        const padding = ' '.repeat(Math.max(1, 30 - fullName.length));
        output += `  ${fullName}${padding}${cmd.description}\n`;
      });
      output += '\n';
    }
    
    return output.trimEnd();
  }
}













