/**
 * CLI interactive prompt utilities
 */

import * as readline from 'readline';

/**
 * Interactive prompt utility for CLI commands
 */
export class InteractivePrompt {
  /**
   * Prompt for password with hidden input
   * @param message Prompt message
   * @returns Password string
   */
  static async promptPassword(message: string): Promise<string> {
    return new Promise((resolve) => {
      const stdin = process.stdin;
      const stdout = process.stdout;
      
      // Save current terminal settings
      const wasRawMode = stdin.isRaw || false;
      
      // Set raw mode to capture individual characters
      if (stdin.isTTY) {
        stdin.setRawMode(true);
      }
      stdin.resume();
      stdin.setEncoding('utf8');
      
      let password = '';
      stdout.write(message);
      
      const onData = (char: string) => {
        const code = char.charCodeAt(0);
        
        // Handle Enter key (13 = CR, 10 = LF)
        if (code === 13 || code === 10) {
          stdin.removeListener('data', onData);
          stdin.pause();
          if (stdin.isTTY) {
            stdin.setRawMode(wasRawMode);
          }
          stdout.write('\n');
          resolve(password);
          return;
        }
        
        // Handle Backspace (127) or Delete (8)
        if (code === 127 || code === 8) {
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.write('\b \b');
          }
          return;
        }
        
        // Handle Ctrl+C (3)
        if (code === 3) {
          stdin.removeListener('data', onData);
          stdin.pause();
          if (stdin.isTTY) {
            stdin.setRawMode(wasRawMode);
          }
          stdout.write('\n');
          process.exit(130);
          return;
        }
        
        // Ignore other control characters (0-31 except those handled above)
        if (code < 32) {
          return;
        }
        
        // Add character to password (but don't display it)
        password += char;
        stdout.write('*'); // Show asterisk instead of actual character
      };
      
      stdin.on('data', onData);
    });
  }

  /**
   * Prompt for credentials (username and password)
   * @returns Credentials object
   */
  static async promptCredentials(): Promise<{ username: string; password: string }> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      console.log('[+]: ID can be email address, username, or account name.');
      
      rl.question('[?]: Pixiv ID: ', async (pixivId) => {
        rl.close();
        // Use secure password input
        const password = await this.promptPassword('[?]: Password: ');
        resolve({ username: pixivId.trim(), password: password.trim() });
      });
    });
  }

  /**
   * Prompt for a single line of text
   * @param message Prompt message
   * @returns User input string
   */
  static async promptText(message: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  /**
   * Prompt for confirmation (yes/no)
   * @param message Prompt message
   * @param defaultValue Default value if user just presses Enter
   * @returns True if user confirmed
   */
  static async promptConfirm(message: string, defaultValue: boolean = false): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const defaultText = defaultValue ? 'Y/n' : 'y/N';
    const fullMessage = `${message} (${defaultText}): `;

    return new Promise((resolve) => {
      rl.question(fullMessage, (answer) => {
        rl.close();
        const trimmed = answer.trim().toLowerCase();
        
        if (trimmed === '') {
          resolve(defaultValue);
        } else if (trimmed === 'y' || trimmed === 'yes') {
          resolve(true);
        } else if (trimmed === 'n' || trimmed === 'no') {
          resolve(false);
        } else {
          // Invalid input, use default
          resolve(defaultValue);
        }
      });
    });
  }
}















