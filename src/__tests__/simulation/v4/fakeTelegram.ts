/**
 * Minimal fake Telegram Bot API server for the V4 offline simulation.
 *
 * It is a REAL loopback HTTP server, not a library-level stub: production code
 * (python-telegram-bot inside TelePost) reaches it through its normal base_url
 * override, so the whole outbound HTTP path is exercised.
 *
 * What it records is deliberately narrow — method name, chat id, media count and
 * *synthetic* identifiers. The bot token lives in the request path and is never
 * copied into the call log, so a failed assertion can be printed verbatim.
 */
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

export interface BotApiCall {
  /** e.g. sendMediaGroup, sendPhoto, deleteMessage */
  method: string;
  /** ms since harness start */
  at: number;
  chatId: string;
  /** JSON-ish media descriptors as shipped by the caller (ids only). */
  mediaIds: string[];
  /** Number of binary parts received (uploaded files). */
  fileParts: number;
  caption?: string;
}

export interface FakeTelegramOptions {
  /** Synthetic token; only used to validate the path shape. */
  token?: string;
}

const SYNTHETIC_CHAT_TITLE = 'V4 Sim Channel';

export class FakeTelegramServer {
  private server: Server | null = null;
  private nextMessageId = 1000;
  readonly calls: BotApiCall[] = [];
  readonly startedAt = Date.now();
  private url = '';

  constructor(private readonly options: FakeTelegramOptions = {}) {}

  /** Bot API base including the trailing `/bot`, as PTB expects. */
  get baseUrl(): string {
    return `${this.url}/bot`;
  }

  get fileBaseUrl(): string {
    return `${this.url}/file/bot`;
  }

  async start(port = 0): Promise<number> {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve));
    const address = this.server!.address() as AddressInfo;
    this.url = `http://127.0.0.1:${address.port}`;
    return address.port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** Calls that could create a channel post, i.e. everything but the review card. */
  publishCalls(): BotApiCall[] {
    const publishMethods = new Set([
      'sendMediaGroup',
      'sendPhoto',
      'sendVideo',
      'sendAnimation',
      'sendAudio',
      'sendDocument',
      'copyMessage',
      'copyMessages',
    ]);
    return this.calls.filter((c) => publishMethods.has(c.method));
  }

  callsFor(method: string): BotApiCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const raw = await readBody(req);

    // File downloads: /file/bot<token>/<file_path>
    if ((req.url || '').startsWith('/file/')) {
      const payload = Buffer.from('v4-sim-media');
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(payload.length),
      });
      res.end(payload);
      return;
    }

    const method = methodFromPath(req.url || '');
    if (!method) {
      this.sendJson(res, 404, { ok: false, description: 'unknown endpoint' });
      return;
    }

    const parsed = parseRequest(req, raw);
    this.calls.push({
      method,
      at: Date.now() - this.startedAt,
      chatId: String(parsed.fields.chat_id ?? ''),
      mediaIds: parsed.mediaIds,
      fileParts: parsed.fileParts,
      caption: typeof parsed.fields.caption === 'string' ? parsed.fields.caption : undefined,
    });

    if (method === 'getMe') {
      this.sendJson(res, 200, {
        ok: true,
        result: {
          id: 900000001,
          is_bot: true,
          first_name: 'V4 Sim Bot',
          username: 'v4_sim_bot',
          can_join_groups: false,
          can_read_all_group_messages: false,
          supports_inline_queries: false,
        },
      });
      return;
    }

    if (method === 'sendMediaGroup' || method === 'copyMessages') {
      const count = method === 'sendMediaGroup'
        ? Math.max(1, parsed.mediaIds.length || 1)
        : Math.max(1, parsed.mediaIds.length || 1);
      const result = Array.from({ length: count }, () => this.newMessage(parsed));
      this.sendJson(res, 200, { ok: true, result });
      return;
    }

    if (method === 'copyMessage') {
      this.sendJson(res, 200, {
        ok: true,
        result: { message_id: this.nextMessageId++ },
      });
      return;
    }

    if (method === 'deleteMessage' || method === 'answerCallbackQuery'
      || method === 'setMyCommands' || method === 'deleteWebhook'
      || method === 'setChatMenuButton') {
      this.sendJson(res, 200, { ok: true, result: true });
      return;
    }

    if (method === 'getFile') {
      this.sendJson(res, 200, {
        ok: true,
        result: {
          file_id: parsed.fields.file_id || 'v4-sim-file',
          file_unique_id: 'v4simunique',
          file_size: 12,
          file_path: 'v4-sim/media.png',
        },
      });
      return;
    }

    // sendMessage / sendPhoto / sendVideo / sendAnimation / sendAudio /
    // sendDocument / editMessageText / editMessageCaption all return a Message.
    this.sendJson(res, 200, { ok: true, result: this.newMessage(parsed) });
  }

  private newMessage(parsed: ParsedRequest): Record<string, unknown> {
    const messageId = this.nextMessageId++;
    const chatId = String(parsed.fields.chat_id ?? '0');
    const message: Record<string, unknown> = {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: numericChatId(chatId),
        type: chatId.startsWith('@') ? 'channel' : 'supergroup',
        title: SYNTHETIC_CHAT_TITLE,
      },
    };
    if (typeof parsed.fields.text === 'string') message.text = parsed.fields.text;
    if (typeof parsed.fields.caption === 'string') message.caption = parsed.fields.caption;
    if (parsed.method === 'sendPhoto') message.photo = [syntheticPhoto()];
    if (parsed.method === 'sendVideo') message.video = syntheticFile('video');
    if (parsed.method === 'sendAnimation') message.animation = syntheticFile('animation');
    if (parsed.method === 'sendAudio') message.audio = syntheticFile('audio');
    if (parsed.method === 'sendDocument') message.document = syntheticFile('document');
    return message;
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = Buffer.from(JSON.stringify(body));
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': String(payload.length),
    });
    res.end(payload);
  }
}

interface ParsedRequest {
  method: string;
  fields: Record<string, string>;
  mediaIds: string[];
  fileParts: number;
}

function syntheticPhoto(): Record<string, unknown> {
  return {
    file_id: 'v4-sim-photo',
    file_unique_id: 'v4simphotounique',
    width: 512,
    height: 512,
    file_size: 12,
  };
}

function syntheticFile(kind: string): Record<string, unknown> {
  return {
    file_id: `v4-sim-${kind}`,
    file_unique_id: `v4sim${kind}unique`,
    file_size: 12,
    file_name: `v4-sim.${kind}`,
  };
}

function numericChatId(chatId: string): number | string {
  if (chatId.startsWith('@')) return chatId;
  const asNumber = Number(chatId);
  return Number.isFinite(asNumber) ? asNumber : chatId;
}

/** Last path segment is the Bot API method; the token segment is dropped. */
function methodFromPath(url: string): string | null {
  const path = url.split('?')[0];
  const match = /^\/bot[^/]*\/([A-Za-z]+)$/.exec(path) || /^\/([A-Za-z]+)$/.exec(path);
  return match ? match[1] : null;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseRequest(req: IncomingMessage, raw: Buffer): ParsedRequest {
  const contentType = String(req.headers['content-type'] || '');
  const method = methodFromPath(req.url || '') || '';
  const text = raw.toString('utf8');

  if (contentType.includes('application/json')) {
    return { method, fields: asStringFields(safeJson(text)), mediaIds: mediaIdsOf(safeJson(text)), fileParts: 0 };
  }
  if (contentType.includes('multipart/form-data')) {
    return parseMultipart(method, contentType, raw);
  }
  return { method, fields: Object.fromEntries(new URLSearchParams(text)), mediaIds: [], fileParts: 0 };
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asStringFields(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' || typeof raw === 'number') out[key] = String(raw);
  }
  return out;
}

/** Extract synthetic media references only (file_id / attach:// / URLs). */
function mediaIdsOf(value: Record<string, unknown>): string[] {
  const media = value.media;
  if (Array.isArray(media)) {
    return media
      .map((item) => (item && typeof item === 'object'
        ? String((item as Record<string, unknown>).media ?? '')
        : String(item)))
      .filter(Boolean);
  }
  const ids: string[] = [];
  for (const key of ['photo', 'video', 'animation', 'audio', 'document']) {
    if (typeof value[key] === 'string') ids.push(String(value[key]));
  }
  return ids;
}

function parseMultipart(method: string, contentType: string, raw: Buffer): ParsedRequest {
  const boundaryMatch = /boundary=([^;]+)/.exec(contentType);
  if (!boundaryMatch) return { method, fields: {}, mediaIds: [], fileParts: 0 };
  const boundary = `--${boundaryMatch[1].replace(/^"|"$/g, '')}`;
  const fields: Record<string, string> = {};
  const mediaIds: string[] = [];
  let fileParts = 0;

  for (const segment of raw.toString('binary').split(boundary)) {
    const headerEnd = segment.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headers = segment.slice(0, headerEnd);
    const body = segment.slice(headerEnd + 4).replace(/\r\n$/, '');
    const nameMatch = /name="([^"]+)"/.exec(headers);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (/filename="/.test(headers)) {
      fileParts += 1;
      fields[name] = `<file:${body.length}b>`;
      continue;
    }
    fields[name] = body;
    if (name === 'media') {
      try {
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const value = item && typeof item === 'object'
              ? (item as Record<string, unknown>).media
              : item;
            if (value) mediaIds.push(String(value));
          }
        }
      } catch {
        /* not a JSON media field */
      }
    }
  }
  return { method, fields, mediaIds, fileParts };
}
