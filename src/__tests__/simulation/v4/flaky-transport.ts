/**
 * Loopback network fault injector for the submission boundary.
 *
 * A lost ACK has two separable halves:
 *
 *   server side -> TelePost commits the review and answers 201
 *   client side -> PixivFlow never observes that answer
 *
 * Injecting a 5xx would only produce a plain retry, so this transport instead
 * forwards the real request to the real TelePost API, waits for the real
 * response to complete (which is what proves the commit happened), and *then*
 * withholds that response by closing the socket. No production code is
 * modified: the fault lives entirely in the loopback transport the delivery
 * target is pointed at.
 *
 * Every submission attempt is recorded, including the dropped one, together
 * with the upstream status and the upstream envelope's `business_status`. That
 * lets a test prove the first attempt was accepted server-side and the second
 * was answered by TelePost's real idempotency path rather than by the harness.
 */
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface SubmissionAttempt {
  method: string;
  path: string;
  /** `idempotency_key` parsed out of the multipart body, if the client sent one. */
  idempotencyKey: string | null;
  /** Status the real upstream returned; recorded even when the response is dropped. */
  upstreamStatus: number | null;
  /** `data.business_status` from the real upstream envelope. */
  businessStatus: string | null;
  /** `data.reused` from the real upstream envelope. */
  reused: boolean | null;
  /** True when the response was deliberately withheld from the client. */
  droppedResponse: boolean;
  /** Forwarding error, if the request never reached the upstream. */
  transportError: string | null;
}

export interface FlakyTransportOptions {
  /** Only requests matching this path are candidates for a dropped response. */
  matchPath?: string;
}

export class FlakySubmissionTransport {
  private server: Server | null = null;
  private port = 0;
  private readonly attempts: SubmissionAttempt[] = [];
  private dropsRemaining = 0;
  private readonly matchPath: string;
  private readonly upstreamBase: string;

  constructor(upstreamBase: string, options: FlakyTransportOptions = {}) {
    this.upstreamBase = upstreamBase.replace(/\/$/, '');
    this.matchPath = options.matchPath ?? '/submissions';
  }

  get baseUrl(): string {
    if (!this.server) throw new Error('flaky transport is not started');
    return `http://127.0.0.1:${this.port}`;
  }

  /** Every submission attempt observed, in arrival order. */
  submissionAttempts(): SubmissionAttempt[] {
    return this.attempts.map((attempt) => ({ ...attempt }));
  }

  /**
   * Arm the next `count` matching responses to be withheld after the upstream
   * has committed and answered.
   */
  dropNextResponse(count = 1): void {
    this.dropsRemaining += count;
  }

  async start(port = 0): Promise<number> {
    if (this.server) return this.port;
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    // A socket we deliberately destroy must not surface as an unhandled error.
    server.on('clientError', () => undefined);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve());
    });
    this.server = server;
    this.port = (server.address() as AddressInfo).port;
    return this.port;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? 'GET';
    const path = request.url ?? '/';
    const body = await readAll(request);

    const isSubmission = method === 'POST' && path.startsWith(this.matchPath);
    const drop = isSubmission && this.dropsRemaining > 0;
    if (drop) this.dropsRemaining -= 1;

    let upstreamStatus: number | null = null;
    let businessStatus: string | null = null;
    let reused: boolean | null = null;
    let transportError: string | null = null;
    let responseHeaders: Record<string, string> = { 'content-type': 'application/json' };
    // Annotated because `Buffer.alloc(0)` infers a narrower backing-store type
    // than `Buffer.concat()` produces.
    let responseBody: Buffer = Buffer.alloc(0);

    try {
      const upstream = await this.forward(method, path, request.headers, body);
      upstreamStatus = upstream.status;
      responseHeaders = upstream.headers;
      responseBody = upstream.body;
      // The real ACK contract is observed here, for dropped responses too: this
      // is the evidence that the first attempt was committed server-side.
      const envelope = parseEnvelope(upstream.body);
      businessStatus = envelope.businessStatus;
      reused = envelope.reused;
    } catch (error) {
      transportError = (error as Error).message;
    }

    if (isSubmission) {
      this.attempts.push({
        method,
        path,
        idempotencyKey: multipartField(body, 'idempotency_key'),
        upstreamStatus,
        businessStatus,
        reused,
        droppedResponse: drop,
        transportError,
      });
    }

    if (drop) {
      // The upstream has committed and answered. Nothing is written back, so the
      // only signal the client gets is the closed socket — that is the ACK loss.
      response.socket?.destroy();
      return;
    }

    if (transportError) {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'transport_failure', message: transportError }));
      return;
    }

    // `connection: close` keeps this transport out of any keep-alive pool, so a
    // dropped response can never disturb an unrelated in-flight request.
    response.writeHead(upstreamStatus ?? 502, { ...responseHeaders, connection: 'close' });
    response.end(responseBody);
  }

  private forward(
    method: string,
    path: string,
    headers: IncomingMessage['headers'],
    body: Buffer,
  ): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
    const target = new URL(`${this.upstreamBase}${path}`);
    return new Promise((resolve, reject) => {
      const outbound = httpRequest(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port,
          path: `${target.pathname}${target.search}`,
          method,
          headers: {
            ...forwardRequestHeaders(headers),
            host: target.host,
            'content-length': String(body.length),
          },
        },
        (upstreamResponse) => {
          const chunks: Buffer[] = [];
          upstreamResponse.on('data', (chunk: Buffer) => chunks.push(chunk));
          upstreamResponse.on('end', () =>
            resolve({
              status: upstreamResponse.statusCode ?? 502,
              headers: forwardResponseHeaders(upstreamResponse.headers),
              body: Buffer.concat(chunks),
            }),
          );
          upstreamResponse.on('error', reject);
        },
      );
      outbound.on('error', reject);
      outbound.end(body);
    });
  }
}

async function readAll(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Extracts one multipart form field without depending on a parser library. */
function multipartField(body: Buffer, name: string): string | null {
  const marker = Buffer.from(`name="${name}"`);
  const at = body.indexOf(marker);
  if (at < 0) return null;
  const start = body.indexOf('\r\n\r\n', at);
  if (start < 0) return null;
  const end = body.indexOf('\r\n', start + 4);
  if (end < 0) return null;
  return body.subarray(start + 4, end).toString('utf8').trim() || null;
}

function parseEnvelope(body: Buffer): { businessStatus: string | null; reused: boolean | null } {
  try {
    const parsed = JSON.parse(body.toString('utf8')) as {
      business_status?: unknown;
      data?: { business_status?: unknown; reused?: unknown };
    };
    const businessStatus =
      parsed.data?.business_status ?? parsed.business_status ?? null;
    const reused = parsed.data?.reused;
    return {
      businessStatus: typeof businessStatus === 'string' ? businessStatus : null,
      reused: typeof reused === 'boolean' ? reused : null,
    };
  } catch {
    return { businessStatus: null, reused: null };
  }
}

const HOP_BY_HOP = new Set(['host', 'connection', 'transfer-encoding', 'content-length', 'keep-alive']);

function forwardRequestHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase()) || value === undefined) continue;
    forwarded[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return forwarded;
}

function forwardResponseHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase()) || value === undefined) continue;
    forwarded[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return forwarded;
}
