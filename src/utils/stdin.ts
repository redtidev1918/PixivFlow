/**
 * Stdin helpers for secret-handling commands.
 *
 * Reading secrets (refresh tokens, passwords) from stdin keeps them out of
 * shell history and process lists, which matters on shared servers.
 */

/** Read everything until EOF (Ctrl-D when typing interactively). */
export async function readStdinAll(): Promise<string> {
  const chunks: string[] = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    chunks.push(String(chunk));
  }
  return chunks.join('');
}

/** Read everything until EOF and strip a single trailing newline. */
export async function readStdinLine(): Promise<string> {
  const all = await readStdinAll();
  return all.replace(/\r?\n$/, '');
}
