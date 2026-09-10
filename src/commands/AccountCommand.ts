/**
 * `pixivflow account` — manage the Pixiv accounts the control plane runs on.
 *
 * The server never logs in to Pixiv. There is no resident process to drive a
 * browser, and putting one in the Worker would be the wrong shape entirely. So the
 * browser flow happens wherever a human is: this machine. The resulting refresh
 * token is pushed over HTTPS and is live for the next disposable runner, with no
 * GitHub secret edit, no Worker redeploy, no image rebuild.
 *
 *   pixivflow account login  pixiv-main --control-plane https://cp.example
 *   pixivflow account list              --control-plane https://cp.example
 *   pixivflow account status pixiv-main --control-plane https://cp.example
 *   pixivflow account rotate pixiv-main --control-plane https://cp.example
 *   pixivflow account remove pixiv-alt  --control-plane https://cp.example
 *
 * The alias names WHICH account (`pixiv-main`, `pixiv-alt`), never what is stored
 * inside it: the token rotates behind the alias and the alias never changes.
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';

interface CredentialMetadata {
  name: string;
  updatedAt?: number;
  rotations?: number;
  previousHash?: string | null;
}

const DEFAULT_ALIAS = 'pixiv-main';

function stringOption(args: CommandArgs, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = args.options[name];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/** The control plane's bearer, from the flag or the environment (preferred: a flag
 *  ends up in shell history and in `ps` output). */
function resolveSecret(args: CommandArgs): string | undefined {
  return stringOption(args, 'control-plane-token', 'controlPlaneToken') ?? process.env.CONTROL_PLANE_TOKEN?.trim();
}

function requireUrl(args: CommandArgs): string {
  const url = stringOption(args, 'control-plane', 'controlPlane') ?? process.env.CONTROL_PLANE_URL?.trim();
  if (!url) throw new Error('--control-plane <url> is required (or set CONTROL_PLANE_URL)');
  return url.replace(/\/+$/, '');
}

async function call(
  url: string,
  secret: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${secret}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: response.status, json };
}

export class AccountCommand extends BaseCommand {
  readonly name = 'account';
  readonly description = 'Manage the Pixiv accounts the control plane runs on';
  readonly aliases = ['accounts'];
  readonly requiresToken = false;
  readonly metadata = {
    // Authentication: this is where an account's credential is (re)established.
    category: CommandCategory.AUTHENTICATION,
    requiresAuth: false,
    longRunning: false,
    examples: [
      'pixivflow account list --control-plane https://cp.example',
      'pixivflow account login pixiv-main --control-plane https://cp.example',
      'pixivflow account rotate pixiv-main --control-plane https://cp.example',
    ],
  };

  validate(args: CommandArgs): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const action = args.positional[0];
    if (!action) errors.push('an action is required: login | list | status | rotate | remove');
    else if (!['login', 'list', 'status', 'rotate', 'remove'].includes(action)) {
      errors.push(`unknown action "${action}"; expected login | list | status | rotate | remove`);
    }
    if (action && action !== 'list' && !args.positional[1]) {
      errors.push(`\`account ${action}\` needs an alias, e.g. ${DEFAULT_ALIAS}`);
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const action = args.positional[0]!;
    const alias = args.positional[1] ?? DEFAULT_ALIAS;

    let url: string;
    let secret: string | undefined;
    try {
      url = requireUrl(args);
      secret = resolveSecret(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[!]: ${message}`);
      return this.failure(message);
    }
    if (!secret) {
      const message = 'a control-plane token is required: pass --control-plane-token or set CONTROL_PLANE_TOKEN';
      console.error(`[!]: ${message}`);
      return this.failure(message);
    }

    try {
      switch (action) {
        case 'login':
          return await this.login(context, args, url, secret, alias);
        case 'rotate':
          return await this.login(context, args, url, secret, alias, { rotate: true });
        case 'list':
          return await this.list(url, secret);
        case 'status':
          return await this.status(url, secret, alias);
        case 'remove':
          return await this.remove(url, secret, alias);
        default:
          return this.failure(`unknown action ${action}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[!]: ${action} failed: ${message}`);
      return this.failure(message, { error });
    }
  }

  /** The browser flow happens HERE, not on the server. */
  private async login(
    context: CommandContext,
    args: CommandArgs,
    url: string,
    secret: string,
    alias: string,
    options: { rotate?: boolean } = {}
  ): Promise<CommandResult> {
    const json = !!(args.options.json || args.options.j);
    const username = stringOption(args, 'username', 'u');
    const password = stringOption(args, 'password', 'p');
    const headless = !!(username && password);

    if (options.rotate) {
      const before = await call(url, secret, 'GET', `/control/credentials/${encodeURIComponent(alias)}`);
      if (before.status !== 200) {
        console.error(`[!]: no such credential "${alias}"; use \`account login\` for a new one`);
        return this.failure(`unknown credential ${alias}`);
      }
      if (!json) {
        console.log(`[i]: rotating ${alias} (the alias stays the same; only the token behind it changes)`);
      }
    }

    if (!json && !headless) {
      console.log('[i]: A Chrome window will open. Complete the Pixiv login there.');
      console.log('[i]: The refresh token stays on this machine except for the HTTPS write to the control plane.');
    }

    const { TerminalLogin } = await import('../terminal-login');
    const login = new TerminalLogin({
      headless,
      ...(headless ? { username, password } : {}),
    });
    const loginInfo = await login.login({
      headless,
      ...(headless ? { username, password } : {}),
    });

    const refreshToken = loginInfo.refresh_token;
    if (!refreshToken) {
      return this.failure('the login did not return a refresh token');
    }

    const written = await call(url, secret, 'PUT', `/control/credentials/${encodeURIComponent(alias)}`, {
      value: refreshToken,
    });
    if (written.status !== 200) {
      // The token is never printed: it is the account, and the operator can re-run
      // the login rather than paste a credential into a terminal.
      const message = `the control plane rejected the write (HTTP ${written.status}: ${String(written.json.error ?? 'unknown')})`;
      console.error(`[!]: ${message}`);
      return this.failure(message);
    }

    const changed = written.json.changed === true;
    if (json) {
      console.log(
        JSON.stringify({ alias, stored: true, changed, rotations: written.json.rotations }, null, 2)
      );
    } else {
      console.log(`[+]: ${alias} is stored and live for the next runner`);
      console.log(`[i]: ${changed ? 'the token changed' : 'the token was unchanged'}; rotations=${written.json.rotations}`);
      if (loginInfo.user) {
        console.log(`[i]: account ${loginInfo.user.name} (${loginInfo.user.account})`);
      }
      console.log('[i]: no GitHub secret edit, Worker redeploy or image rebuild is needed');
    }
    return this.success(`${alias} stored`, { alias, changed });
  }

  private async list(url: string, secret: string): Promise<CommandResult> {
    const response = await call(url, secret, 'GET', '/control/credentials');
    if (response.status !== 200) {
      return this.failure(`the control plane refused the read (HTTP ${response.status})`);
    }
    const credentials = (response.json.credentials ?? []) as CredentialMetadata[];
    if (credentials.length === 0) console.log('[i]: no credentials stored');
    for (const credential of credentials) {
      const age = credential.updatedAt
        ? `${Math.round((Date.now() - credential.updatedAt) / 3_600_000)}h ago`
        : 'unknown';
      console.log(`  ${credential.name}  updated ${age}  rotations=${credential.rotations ?? 0}`);
    }
    return this.success(`${credentials.length} credential(s)`);
  }

  private async status(url: string, secret: string, alias: string): Promise<CommandResult> {
    const response = await call(url, secret, 'GET', `/control/credentials/${encodeURIComponent(alias)}`);
    if (response.status === 404) {
      console.log(`[i]: ${alias} is not stored`);
      return this.success(`${alias} absent`);
    }
    if (response.status !== 200) {
      return this.failure(`the control plane refused the read (HTTP ${response.status})`);
    }
    console.log(`  alias      ${alias}`);
    console.log(`  stored     ${String(response.json.stored)}`);
    console.log(`  rotations  ${String(response.json.rotations ?? 0)}`);
    console.log(`  updated    ${response.json.updatedAt ? new Date(Number(response.json.updatedAt)).toISOString() : '-'}`);
    console.log('[i]: the value itself is never returned by this endpoint');
    return this.success(`${alias} status read`);
  }

  private async remove(url: string, secret: string, alias: string): Promise<CommandResult> {
    const response = await call(url, secret, 'DELETE', `/control/credentials/${encodeURIComponent(alias)}`);
    if (response.status === 404) {
      console.log(`[i]: ${alias} was not stored`);
      return this.success(`${alias} absent`);
    }
    if (response.status !== 200) {
      return this.failure(`the control plane refused the delete (HTTP ${response.status})`);
    }
    console.log(`[+]: ${alias} removed`);
    console.log('[i]: any schedule still referencing it will fall back to its own credential and fail loudly');
    return this.success(`${alias} removed`);
  }

  getUsage(): string {
    return `pixivflow account <action> [alias] [options]

Actions:
  login  <alias>   Open a browser HERE, log in, and push the refresh token to the
                   control plane. No GitHub secret edit or redeploy needed.
  rotate <alias>   Same flow for an alias that already exists; the alias is stable,
                   only the token behind it changes.
  list             List the stored aliases (names and metadata, never values).
  status <alias>   Metadata for one alias.
  remove <alias>   Forget an alias.

Options:
  --control-plane <url>        Control plane base URL (or CONTROL_PLANE_URL)
  --control-plane-token <t>    Bearer for the control plane (or CONTROL_PLANE_TOKEN;
                               prefer the environment variable, a flag leaks into
                               shell history)
  -u, -p                       Pixiv username/password for a headless login
  --json                       Machine-readable output

Aliases are stable account identities (pixiv-main, pixiv-alt), never a description
of the stored secret.`;
  }
}
