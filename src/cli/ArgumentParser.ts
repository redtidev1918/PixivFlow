/**
 * Command line argument parser
 */

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
   */
  static parse(args: string[]): ParsedArgs {
    const result: ParsedArgs = {
      options: {},
      positional: [],
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      // Long option (--option)
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const nextArg = args[i + 1];
        
        // Check if next argument is a value (not an option)
        if (nextArg && !nextArg.startsWith('-')) {
          result.options[key] = nextArg;
          i++; // Skip next argument as it's the value
        } else {
          result.options[key] = true; // Boolean flag
        }
      }
      // Short option (-o)
      else if (arg.startsWith('-')) {
        const key = arg.slice(1);
        const nextArg = args[i + 1];
        
        // Check if next argument is a value (not an option)
        if (nextArg && !nextArg.startsWith('-')) {
          result.options[key] = nextArg;
          i++; // Skip next argument as it's the value
        } else {
          result.options[key] = true; // Boolean flag
        }
      }
      // Command or positional argument
      else {
        if (!result.command) {
          result.command = arg;
        } else {
          result.positional.push(arg);
        }
      }
    }

    return result;
  }

  /**
   * Check if an option is set
   * @param options Options object
   * @param name Option name (supports both short and long forms)
   * @returns True if option is set
   */
  static hasOption(
    options: Record<string, string | boolean>,
    name: string
  ): boolean {
    return options[name] !== undefined && options[name] !== false;
  }

  /**
   * Get option value
   * @param options Options object
   * @param name Option name
   * @param defaultValue Default value if not set
   * @returns Option value or default
   */
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

  /**
   * Get boolean option value
   * @param options Options object
   * @param name Option name
   * @param defaultValue Default value if not set
   * @returns Boolean value
   */
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




























