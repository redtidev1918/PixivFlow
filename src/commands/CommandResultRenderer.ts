import { CommandResult } from './types';

/**
 * Rendering a command result for a terminal.
 *
 * Commands that follow the `{message, data}` contract compute their output and
 * return it; the entry point decides how it reaches the operator. Keep that
 * decision here so every such command is printed the same way, and so the rule
 * is testable without booting the CLI.
 */

/**
 * The text to print for a finished command, or `undefined` when there is
 * nothing to say.
 *
 * `message` is the human answer and wins when present. `--json` replaces it
 * with the machine payload: an operator who asked for JSON gets JSON, not a
 * table with a JSON blob after it.
 */
export function formatCommandResult(
  result: Pick<CommandResult, 'message' | 'data'>,
  options: { json?: boolean } = {}
): string | undefined {
  if (options.json === true) {
    if (result.data === undefined) return result.message;
    return JSON.stringify(result.data, null, 2);
  }
  return result.message;
}
