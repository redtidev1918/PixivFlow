/**
 * Command line argument parser
 */

import { VersionRequest, HelpRequest } from '../utils/errors';

/**
 * Parsed command line arguments
 */
export interface ParsedArgs {
  command?: string;
  options: Record<string, string | boolean>;
  positional: string[];
}

/**
 * Command line argument parser
 */
export class ArgumentParser {
  /**
   * Parse command line arguments
   * @param args Command line arguments (typically process.argv.slice(2))
   * @returns Parsed arguments
   * @throws {VersionRequest} if --version or -v is found
   * @throws {HelpRequest} if --help or -h is found
   */
  static parse(args: string[]): ParsedArgs {
    const result: ParsedArgs = {
      options: {},
      positional: [],
    };

    // First pass to find command, as it can affect help context
    const commandArg = args.find(arg => !arg.startsWith('-'));

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--version' || arg === '-v') {
        throw new VersionRequest();
      }
      if (arg === '--help' || arg === '-h') {
        throw new HelpRequest(commandArg);
      }
      
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const nextArg = args[i + 1];
        
        if (nextArg && !nextArg.startsWith('-')) {
          result.options[key] = nextArg;
          i++;
        } else {
          result.options[key] = true;
        }
      } else if (arg.startsWith('-')) {
        const key = arg.slice(1);
        const nextArg = args[i + 1];
        
        if (nextArg && !nextArg.startsWith('-')) {
          result.options[key] = nextArg;
          i++;
        } else {
          result.options[key] = true;
        }
      } else {
        if (!result.command) {
          result.command = arg;
        } else {
          result.positional.push(arg);
        }
      }
    }

    return result;
  }

  // ... (rest of the class is unchanged) ...
  static hasOption(
    options: Record<string, string | boolean>,
    name: string
  ): boolean {
    return options[name] !== undefined && options[name] !== false;
  }

  static getOption<T = string>(
    options: Record<string, string | boolean>,
    name: string,
    defaultValue?: T
  ): T | string | boolean | undefined {
    const value = options[name];
    if (value === undefined) {
      return defaultValue;
    }
    return value as T;
  }

  static getBooleanOption(
    options: Record<string, string | boolean>,
    name: string,
    defaultValue: boolean = false
  ): boolean {
    const value = options[name];
    if (value === undefined) {
      return defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return defaultValue;
  }
}
