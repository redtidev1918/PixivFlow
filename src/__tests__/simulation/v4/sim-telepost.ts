/**
 * Bootstrap for the REAL TelePost stack on loopback.
 *
 * This driver does not implement any control-plane behaviour. It only:
 *   1. picks a free loopback port,
 *   2. starts `TelePost/tests/simulation/sim_server.py` with the interpreter
 *      that actually has TelePost's dependencies (`.venv`),
 *   3. waits for the readiness handshake file,
 *   4. exposes the synthetic tokens the server minted,
 *   5. tears the process down.
 *
 * The server itself refuses to start if `TelePost/config.ini` exists, because
 * that file may hold production credentials on a developer machine. That guard
 * is mirrored here so the failure is legible rather than a silent timeout.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { syntheticChatIds, syntheticCredentials } from './synthetic';

export interface SimTelepostOptions {
  /** TelePost repository root (contains `tests/simulation/sim_server.py`). */
  telepostRoot: string;
  /** Interpreter with TelePost deps; defaults to `<root>/.venv/bin/python`. */
  pythonPath?: string;
  /** Throwaway SQLite path. */
  dbPath: string;
  /** Where the readiness handshake is written. */
  handshakePath: string;
  /** Fake Telegram Bot API base, must end with `/bot`. */
  telegramBaseUrl: string;
  /** Fake Telegram file base, must end with `/file/bot`. */
  telegramFileBaseUrl: string;
  /** Requested loopback port; 0 picks a free one. */
  port?: number;
  /** Readiness timeout. */
  readyTimeoutMs?: number;
}

export interface SimTelepostHandle {
  apiBase: string;
  apiToken: string;
  reviewToken: string;
  port: number;
  ownerId: number;
  channelId: string;
  reviewChatId: string;
  /** Raw stdout/stderr lines, for diagnosis only (never contains credentials). */
  log(): string[];
}

/** Ask the OS for an unused loopback port. */
export async function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('could not determine a free port')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

interface Handshake {
  ready: boolean;
  http_port: number;
  api_base: string;
  api_token: string;
  review_token: string;
  owner_id: number;
  channel_id: string;
  review_chat_id: string;
  db_path: string;
}

export class SimTelepost {
  private child: ChildProcess | null = null;
  private readonly lines: string[] = [];
  private handle: SimTelepostHandle | null = null;

  constructor(private readonly options: SimTelepostOptions) {}

  get running(): boolean {
    return this.child !== null;
  }

  async start(): Promise<SimTelepostHandle> {
    const {
      telepostRoot,
      dbPath,
      handshakePath,
      telegramBaseUrl,
      telegramFileBaseUrl,
      readyTimeoutMs = 60000,
    } = this.options;

    const script = join(telepostRoot, 'tests', 'simulation', 'sim_server.py');
    if (!existsSync(script)) {
      throw new Error(`sim_server.py not found at ${script}`);
    }

    const configIni = join(telepostRoot, 'config.ini');
    if (existsSync(configIni)) {
      throw new Error(
        `refusing to start the simulation: ${configIni} exists and may hold production ` +
          'credentials. Move it aside before running the V4 simulation.',
      );
    }

    const python = this.options.pythonPath ?? join(telepostRoot, '.venv', 'bin', 'python');
    if (!existsSync(python)) {
      throw new Error(
        `no simulation interpreter at ${python}. Create TelePost/.venv with its ` +
          'requirements before running the V4 simulation.',
      );
    }

    const port = this.options.port ?? (await findFreePort());
    rmSync(handshakePath, { force: true });
    const credentials = syntheticCredentials();
    const chats = syntheticChatIds();

    const child = spawn(python, [script], {
      cwd: telepostRoot,
      env: {
        ...process.env,
        // The simulation must never traverse a proxy. httpx honours the proxy
        // environment variables, so on a machine with `HTTP_PROXY` set the
        // loopback Telegram calls would be sent to the proxy and time out.
        // Loopback is explicitly exempted and the proxy variables are cleared,
        // which also makes accidental egress impossible.
        NO_PROXY: '127.0.0.1,localhost,::1',
        no_proxy: '127.0.0.1,localhost,::1',
        HTTP_PROXY: '',
        HTTPS_PROXY: '',
        http_proxy: '',
        https_proxy: '',
        ALL_PROXY: '',
        all_proxy: '',
        SIM_DB_PATH: dbPath,
        SIM_HTTP_PORT: String(port),
        SIM_TELEGRAM_BASE_URL: telegramBaseUrl,
        SIM_TELEGRAM_FILE_URL: telegramFileBaseUrl,
        SIM_HANDSHAKE_PATH: handshakePath,
        SIM_OWNER_ID: String(chats.ownerId),
        SIM_CHANNEL_ID: chats.channelId,
        SIM_REVIEW_CHAT_ID: chats.reviewChatId,
        SIM_BOT_TOKEN: credentials.botToken,
        SIM_REVIEW_TOKEN: credentials.reviewToken,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    const collect = (chunk: Buffer): void => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line.trim()) this.lines.push(line.trim());
      }
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

    const deadline = Date.now() + readyTimeoutMs;
    while (Date.now() < deadline) {
      if (existsSync(handshakePath)) {
        const handshake = JSON.parse(readFileSync(handshakePath, 'utf8')) as Handshake;
        if (handshake.ready) {
          this.handle = {
            apiBase: handshake.api_base,
            apiToken: handshake.api_token,
            reviewToken: handshake.review_token,
            port: handshake.http_port,
            ownerId: handshake.owner_id,
            channelId: handshake.channel_id,
            reviewChatId: handshake.review_chat_id,
            log: () => [...this.lines],
          };
          return this.handle;
        }
      }
      const outcome = await Promise.race([
        exited.then(() => 'exited' as const),
        new Promise<'wait'>((resolve) => setTimeout(() => resolve('wait'), 100)),
      ]);
      if (outcome === 'exited') {
        throw new Error(
          `sim_server exited before becoming ready (port ${port}):\n${this.lines.join('\n')}`,
        );
      }
    }

    await this.stop();
    throw new Error(`sim_server did not become ready within ${readyTimeoutMs}ms:\n${this.lines.join('\n')}`);
  }

  /** Current handle, or a clear error if `start()` has not succeeded. */
  require(): SimTelepostHandle {
    if (!this.handle) throw new Error('SimTelepost.start() has not completed');
    return this.handle;
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const done = (): void => resolve();
      child.once('exit', done);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 5000).unref?.();
      setTimeout(done, 8000).unref?.();
    });
  }
}
