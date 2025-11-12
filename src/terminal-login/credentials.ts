/**
 * Credentials management
 * Handles reading and prompting for credentials
 */

import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LoginCredentials } from './types';

/**
 * Read saved credentials from JSON file
 * Based on PixivAuth.read_client_cred() method
 */
export async function readClientCredentials(authJsonPath: string): Promise<LoginCredentials | null> {
  try {
    const filePath = path.resolve(authJsonPath);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const credentials = JSON.parse(fileContent) as LoginCredentials;

    // Validate credentials structure
    if (credentials.pixiv_id && credentials.password) {
      return credentials;
    }
    return null;
  } catch (error) {
    // File doesn't exist or is invalid
    return null;
  }
}

/**
 * Prompt user for credentials interactively
 * Based on the interactive prompt in PixivAuth.__auth()
 */
export async function promptForCredentials(): Promise<LoginCredentials> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('[+]: ID can be email address, username, or account name.');
    
    rl.question('[?]: Pixiv ID: ', async (pixivId) => {
      // Close readline first to release stdin
      rl.close();
      
      // Wait a bit to ensure readline is fully closed
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Now use secure password input
      const password = await promptPassword('[?]: Password: ');
      resolve({ pixiv_id: pixivId.trim(), password: password.trim() });
    });
  });
}

/**
 * Prompt for password with hidden input
 * Uses raw mode to hide password characters
 */
export async function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    
    let password = '';
    let wasRawMode = false;
    
    // Save current stdin settings
    if (process.stdin.isTTY) {
      wasRawMode = (process.stdin as any).isRaw || false;
      process.stdin.setRawMode(true);
    }
    
    process.stdin.resume();
    // Don't set encoding in raw mode - handle buffers directly
    // When encoding is not set, stdin emits Buffer objects
    
    const onData = (data: Buffer) => {
      // Convert buffer to string for processing
      const input = data.toString('utf8');
      
      // Process each character
      for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const code = char.charCodeAt(0);
        
        // Enter key (13 = \r, 10 = \n)
        if (code === 13 || code === 10) {
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(wasRawMode);
          }
          process.stdout.write('\n');
          resolve(password);
          return;
        }
        
        // Backspace (127) or Delete (8)
        if (code === 127 || code === 8) {
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b'); // Move cursor back, overwrite with space, move back again
          }
          continue;
        }
        
        // Ctrl+C (3)
        if (code === 3) {
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(wasRawMode);
          }
          process.stdout.write('\n');
          process.exit(130); // Exit with SIGINT code
          return;
        }
        
        // Ctrl+D (4) - EOF
        if (code === 4) {
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(wasRawMode);
          }
          process.stdout.write('\n');
          resolve(password);
          return;
        }
        
        // Ignore other control characters (0-31 except those handled above)
        if (code < 32) {
          continue;
        }
        
        // Add character to password (but don't display it)
        password += char;
        process.stdout.write('*'); // Show asterisk instead of actual character
      }
    };
    
    process.stdin.on('data', onData);
  });
}
















































