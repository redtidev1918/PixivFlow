import { createHmac } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { WebhookDeliveryConfig } from '../config';
import { logger } from '../logger';
import { redactError, redactHeaders, redactUrl } from '../utils/redact';
import type { DeliveryAck } from './DeliveryAck';
import { contentFromRequest } from './content';
import type { ContentMedia, ContentTextPart, ContentPart } from './content';
import {
  GATEWAY_ACCEPTED_STATUSES,
  GATEWAY_DUPLICATE_STATUSES,
  GATEWAY_PENDING_STATUSES,
  GATEWAY_TERMINAL_FAILURE_STATUSES,
} from './gatewayContract';
import type { DeliveryProvider, DeliveryRequest, DeliveryResult } from './types';
import type { ReadinessProbeResult } from './HttpMultipartDelivery';

/**
 * Generic Messaging Gateway webhook connector.
 *
 * This is the "PixivFlow is a Gateway CLIENT" boundary: PixivFlow POSTs a
 * platform-agnostic message document and knows nothing about QQ, WeChat or
 * Telegram login. The receiving service (TelePost, AstrBot, Hermes, a OneBot
 * implementation fronted by an adapter, or any custom HTTP service) owns its
 * own protocols, credentials and pairing.
 *
 * Two things this connector deliberately does NOT do:
 *  - it never treats a 2xx as a business success unless the receiver says so;
 *  - it never puts a credential in the payload, and never logs one.
 */

/**
 * Outcome of a `gateway test` reachability probe.
 *
 * `reachable` means "the endpoint answered HTTP at all"; `status` is whatever it
 * answered, including 404/405 (which still proves something is listening).
 */
export type WebhookReachability =
  | { reachable: true; status: number }
  | { reachable: false; error: string };

/** How the message references its media. */
export type WebhookMediaTransport = 'reference' | 'base64';

/** One media item as the receiver sees it. */
export interface WebhookMediaWire {
  kind: 'image' | 'video' | 'file';
  /** Absolute path on the PixivFlow host (present for `reference` transport). */
  path?: string;
  /** Inline payload (present for `base64` transport). */
  dataBase64?: string;
  mime?: string;
  size?: number;
  /** Canonical Pixiv source URL, when known. */
  sourceUrl?: string;
  assetId?: string;
}

/** The unified message document posted to a gateway. */
export interface GatewayMessagePayload {
  schemaVersion: 1;
  /** PixivFlow's stable idempotency key for this delivery; resend it verbatim. */
  idempotencyKey: string;
  deliveryTarget: string | null;
  work: {
    id: string;
    type: 'illustration' | 'novel';
    title: string;
    sourceUrl: string;
    spoiler: boolean;
    tags: string[];
  };
  message: {
    text: string;
    mediaTransport: WebhookMediaTransport;
    parts: Array<{ kind: ContentPart['kind']; media?: WebhookMediaWire }>;
    media: WebhookMediaWire[];
    dropped: Array<{ kind: string; reason: string }>;
  };
  delivery: {
    idempotencyKey: string;
    slotId?: string;
    targetId?: string;
    executionId?: string;
    triggerSource?: string;
  };
}

/** Probe result: a webhook has no declared health endpoint, so nothing is probed. */
export const WEBHOOK_NOT_PROBED: ReadinessProbeResult = { ready: true };

/**
 * Receiver-reported status words that mean "I recorded this intent, I have not
 * published it yet". They map to `retryable_failure` on purpose: the durable
 * outbox keeps retrying the SAME idempotency key until the receiver confirms a
 * business terminal state, which is the only honest reading of a partial ack.
 */
/**
 * Receiver-reported status words, taken from the contract module rather than
 * spelled here a second time — `docs/GATEWAY_CONTRACT.md` §5 is generated from
 * the same lists, and a test asserts all three agree.
 */
const PENDING_STATUSES = new Set<string>(GATEWAY_PENDING_STATUSES);
const ACCEPTED_STATUSES = new Set<string>(GATEWAY_ACCEPTED_STATUSES);
const DUPLICATE_STATUSES = new Set<string>(GATEWAY_DUPLICATE_STATUSES);
const TERMINAL_FAILURE_STATUSES = new Set<string>(GATEWAY_TERMINAL_FAILURE_STATUSES);

/** What one attempt produced, before it is turned into a durable ack. */
export interface WebhookAttempt {
  status: number;
  body: unknown;
}

/**
 * Pure mapping from one HTTP attempt to the delivery ack vocabulary.
 *
 * Kept pure (and separately exported) so the contract can be pinned by tests
 * without a network, and so it can never drift into the TelePost
 * `parseDeliveryAck` semantics used by `httpMultipart`.
 */
export function parseWebhookAck(attempt: WebhookAttempt): DeliveryAck {
  const { status, body } = attempt;
  const record = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
  const statusWord = typeof record?.status === 'string' ? record.status.trim().toLowerCase() : '';
  const detail =
    (typeof record?.reason === 'string' && record.reason) ||
    (typeof record?.error === 'string' && record.error) ||
    (typeof record?.message === 'string' && record.message) ||
    undefined;
  const remoteId =
    typeof record?.id === 'string'
      ? record.id
      : typeof record?.message_id === 'string'
        ? record.message_id
        : undefined;

  // Explicit receiver verdict first: an HTTP 200 carrying `status: failed` is a
  // business failure, never an end-to-end success.
  if (TERMINAL_FAILURE_STATUSES.has(statusWord)) {
    return {
      kind: 'remote_failed',
      remoteId,
      remoteStatus: statusWord,
      error: detail ?? `gateway reported ${statusWord}`,
      raw: body,
    };
  }
  if (status === 409 || DUPLICATE_STATUSES.has(statusWord)) {
    return {
      kind: 'duplicate_existing',
      remoteId,
      remoteStatus: statusWord || undefined,
      raw: body,
    };
  }
  if (PENDING_STATUSES.has(statusWord)) {
    return { kind: 'retryable_failure', error: detail ?? `gateway reported ${statusWord}` };
  }
  if (status === 429) {
    return { kind: 'retryable_failure', error: detail ?? 'gateway rate limited the delivery' };
  }
  if (status >= 500) {
    return { kind: 'retryable_failure', error: detail ?? `gateway returned HTTP ${status}` };
  }
  if (status >= 400) {
    // 4xx is a deterministic rejection of this payload: retrying re-sends the
    // exact same bytes, so the outbox must dead-letter it instead of burning
    // its attempt budget.
    return { kind: 'permanent_failure', error: detail ?? `gateway returned HTTP ${status}` };
  }
  if (statusWord && !ACCEPTED_STATUSES.has(statusWord)) {
    // An unknown status word with a 2xx is not a success: the gateway said
    // something PixivFlow does not understand, and guessing would be worse than
    // retrying.
    return { kind: 'retryable_failure', error: `unrecognized gateway status: ${statusWord}` };
  }
  return { kind: 'accepted', remoteId, remoteStatus: statusWord || undefined, raw: body };
}

/** Build the `X-Webhook-Signature` value for a raw body. */
export function webhookSignature(secret: string, timestampSeconds: number, rawBody: string): string {
  const mac = createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex');
  return `sha256=${mac}`;
}

/** Build the unified message document for one delivery request. */
export async function buildGatewayMessagePayload(
  request: DeliveryRequest,
  options: { mediaTransport: WebhookMediaTransport; deliveryTarget: string | null }
): Promise<GatewayMessagePayload> {
  const content = contentFromRequest(request);
  const idempotencyKey = request.context.idempotencyKey ?? '';
  const wire = async (item: ContentMedia, kind: WebhookMediaWire['kind']): Promise<WebhookMediaWire> => {
    if (options.mediaTransport === 'base64') {
      return {
        kind,
        dataBase64: (await fs.promises.readFile(item.path)).toString('base64'),
        mime: item.mime,
        size: item.size ?? safeSize(item.path),
        sourceUrl: item.sourceUrl,
        assetId: item.assetId,
      };
    }
    return {
      kind,
      // An absolute path is only meaningful to a gateway on this host. The
      // `base64` transport exists for a gateway that is not co-located.
      path: path.resolve(item.path),
      mime: item.mime,
      size: item.size ?? safeSize(item.path),
      sourceUrl: item.sourceUrl,
      assetId: item.assetId,
    };
  };

  const parts: GatewayMessagePayload['message']['parts'] = [];
  const mediaWire: WebhookMediaWire[] = [];
  for (const part of content.parts) {
    if (part.kind === 'text') {
      parts.push({ kind: 'text' });
      continue;
    }
    if (part.kind === 'album') {
      // An album stays ONE part on the wire, with its members listed in order:
      // whether the gateway renders that as a media group, a forward-message
      // node tree or N sequential sends is the gateway's business.
      for (const member of part.items) {
        const one = await wire(member.media, member.kind);
        mediaWire.push(one);
        parts.push({ kind: 'album', media: one });
      }
      continue;
    }
    const one = await wire(part.media, part.kind);
    mediaWire.push(one);
    parts.push({ kind: part.kind, media: one });
  }

  const textPart = content.parts.find((part): part is ContentTextPart => part.kind === 'text');

  return {
    schemaVersion: 1,
    idempotencyKey,
    deliveryTarget: options.deliveryTarget,
    work: {
      id: String(content.workId),
      type: content.workType === 'novel' ? 'novel' : 'illustration',
      title: content.title,
      sourceUrl: content.sourceUrl,
      spoiler: content.spoiler === true,
      tags: [],
    },
    message: {
      text: textPart?.text ?? content.text,
      mediaTransport: options.mediaTransport,
      parts,
      media: mediaWire,
      dropped: [],
    },
    delivery: {
      idempotencyKey,
      slotId: request.context.slotId,
      targetId: request.context.targetId,
      executionId: request.context.executionId,
      triggerSource: request.context.triggerSource,
    },
  };
}

export class WebhookDelivery implements DeliveryProvider {
  private readonly dispatcher?: unknown;

  constructor(
    private readonly config: WebhookDeliveryConfig,
    proxyUrl?: string
  ) {
    if (proxyUrl) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ProxyAgent } = require('undici');
      this.dispatcher = new ProxyAgent(proxyUrl);
    }
  }

  async isReady(): Promise<boolean> {
    return (await this.readinessProbe()).ready;
  }

  /**
   * Operator-facing reachability probe for `pixivflow gateway test`.
   *
   * This is NOT the delivery contract and NOT a health check the receiver must
   * implement: a generic gateway declares no preflight contract, so a
   * well-behaved gateway may answer 404/405/401 here and still accept
   * deliveries. The probe therefore reports whether the endpoint ANSWERED at
   * all (any HTTP status) and never claims the route is healthy because of it.
   * It is a GET carrying a probe marker, so it can never be mistaken for a
   * delivery attempt.
   */
  async probeReachability(timeoutMs = 5_000): Promise<WebhookReachability> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-PixivFlow-Probe': 'gateway-test',
      ...(this.config.headers ?? {}),
    };
    if (this.config.token) headers.Authorization = `Bearer ${interpolate(this.config.token)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, this.config.timeoutMs ?? 30_000)));
    timer.unref?.();
    const options: Record<string, unknown> = { method: 'GET', headers, signal: controller.signal };
    if (this.dispatcher) options.dispatcher = this.dispatcher;
    try {
      const response = await fetch(interpolate(this.config.url), options as Parameters<typeof fetch>[1]);
      // Drain (and bound) the body so the socket can be reused/closed.
      await response.text().catch(() => '');
      return { reachable: true, status: response.status };
    } catch (error) {
      return {
        reachable: false,
        error: redactError(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** A generic webhook declares no preflight contract, so it is always "ready". */
  async readinessProbe(): Promise<ReadinessProbeResult> {
    return WEBHOOK_NOT_PROBED;
  }

  /**
   * One delivery attempt: exactly one HTTP POST, then a pure ack mapping.
   * Retry, backoff and dead-lettering stay in the outbox worker.
   */
  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    if (request.files.length === 0) {
      throw new Error('Webhook delivery requires at least one file');
    }
    const transport = this.config.mediaTransport ?? 'reference';
    const payload = await buildGatewayMessagePayload(request, {
      mediaTransport: transport,
      deliveryTarget: request.context.deliveryTarget ?? null,
    });
    const rawBody = JSON.stringify(payload);
    const inlineBytes = payload.message.media.reduce((total, item) => total + (item.dataBase64?.length ?? 0), 0);
    if (inlineBytes > 0 && this.config.maxInlineBytes && inlineBytes > this.config.maxInlineBytes) {
      // Sending it anyway would just be rejected (or worse, truncated) by the
      // receiver; failing loudly is the honest outcome.
      throw new Error(
        `Webhook inline media is ${inlineBytes} bytes, above maxInlineBytes=${this.config.maxInlineBytes}; ` +
          'use mediaTransport "reference" or raise the declared limit'
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-PixivFlow-Delivery': payload.deliveryTarget ?? 'unknown',
      'X-Idempotency-Key': payload.idempotencyKey,
      ...(this.config.headers ?? {}),
    };
    if (this.config.token) headers.Authorization = `Bearer ${interpolate(this.config.token)}`;
    if (this.config.signingSecret) {
      const timestamp = Math.floor(Date.now() / 1000);
      headers['X-Webhook-Timestamp'] = String(timestamp);
      headers['X-Webhook-Signature'] = webhookSignature(
        interpolate(this.config.signingSecret),
        timestamp,
        rawBody
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);
    timer.unref?.();
    const options: Record<string, unknown> = {
      method: 'POST',
      headers,
      body: rawBody,
      signal: controller.signal,
    };
    if (this.dispatcher) options.dispatcher = this.dispatcher;

    try {
      const response = await fetch(interpolate(this.config.url), options as Parameters<typeof fetch>[1]);
      const body = await readJson(response);
      const ack = parseWebhookAck({ status: response.status, body });
      logger.debug('Gateway webhook delivery attempt', {
        url: redactUrl(this.config.url),
        deliveryTarget: payload.deliveryTarget,
        status: response.status,
        ack: ack.kind,
        headers: redactHeaders(headers),
      });
      return { status: response.status, body, ack };
    } catch (error) {
      const aborted = (error as { name?: string })?.name === 'AbortError';
      logger.warn('Gateway webhook delivery failed', {
        url: redactUrl(this.config.url),
        deliveryTarget: payload.deliveryTarget,
        reason: aborted ? 'timeout' : 'transport_error',
        error: redactError(error),
      });
      // A transport failure is retryable by construction; the outbox worker
      // re-classifies the thrown error, so it must stay thrown.
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeSize(filePath: string): number | undefined {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return undefined;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

/** `${ENV_VAR}` interpolation; a missing variable fails loudly, never silently. */
export function interpolate(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    const resolved = process.env[name];
    if (resolved === undefined) {
      throw new Error(`Required delivery environment variable is not set: ${name}`);
    }
    return resolved;
  });
}
