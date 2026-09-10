/**
 * Telegram review delivery: the runner posts the work to the review group and
 * records the review in the control plane.
 *
 * Why this provider exists at all: the old architecture relayed media through
 * TelePost's HTTP API so a long-lived daemon could own the review. Here the media
 * goes straight to Telegram (one upload, from the disposable runner) and the
 * control plane only ever handles ids — an approve is a server-side
 * `copyMessage`, so nothing re-uploads and a 128 MB Worker never touches bytes.
 *
 * The hard part is not the upload, it is not uploading TWICE:
 *
 *   1. before posting, ask the control plane whether this review already exists —
 *      a retry after a lost report must converge instead of posting a second copy;
 *   2. if Telegram's answer is ambiguous (network failure), record the review as
 *      `uncertain` BEFORE returning, so the next attempt's pre-flight check finds
 *      it and stops. An unconfirmed send is never retried blindly;
 *   3. a definitive rejection means nothing was posted, so the delivery is a
 *      visible failure rather than a silent duplicate.
 */

import { createHash } from 'node:crypto';

import type { TelegramReviewDeliveryConfig } from '../config';
import { logger } from '../logger';
import type { DeliveryAck } from './DeliveryAck';
import { buildTemplateVariables, renderDeliveryTemplate } from './HttpMultipartDelivery';
import type { DeliveryProvider, DeliveryRequest, DeliveryResult } from './types';

/**
 * Wrapper, not a stored reference: Cloudflare rejects a detached `fetch`, and a
 * stored `this.fetchImpl` reproduces exactly that failure. Injected in tests.
 */
const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

interface TelegramEnvelope {
  ok?: boolean;
  description?: string;
  result?: unknown;
}

interface PostedMessage {
  messageId: number;
  fileId?: string;
}

type PostOutcome =
  | { ok: true; messages: PostedMessage[]; mediaGroupId?: string }
  | { ok: false; ambiguous: boolean; error: string };

export class TelegramReviewDelivery implements DeliveryProvider {
  constructor(
    private readonly config: TelegramReviewDeliveryConfig,
    private readonly fetchImpl: typeof fetch = defaultFetch
  ) {}

  /**
   * Deterministic review id: the same work in the same target can only ever have
   * one review, no matter how many attempts run.
   */
  reviewId(request: DeliveryRequest): string {
    const prefix = this.config.reviewIdPrefix ?? 'rv';
    const identity = `${request.context.targetId ?? ''}|${request.context.type}|${request.context.pixivId}`;
    const digest = createHash('sha1').update(identity).digest('hex').slice(0, 16);
    return `${prefix}_${digest}`;
  }

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    const reviewId = this.reviewId(request);

    // 1. Pre-flight. A review that already exists means a previous attempt's post
    //    landed (only its report was lost): converge, never post again.
    const existing = await this.lookupReview(reviewId);
    if (existing === 'found') {
      logger.info('[TelegramReview] review already recorded; not posting again', { reviewId });
      return { ack: { kind: 'idempotent_replay', remoteId: reviewId, remoteStatus: 'review_exists' } };
    }
    if (existing === 'unreachable') {
      // We cannot verify, so we must not post: an unrecorded post could never be
      // approved and a retry would duplicate it.
      return {
        ack: {
          kind: 'retryable_failure',
          error: 'control plane unreachable before posting; postponing to avoid an unrecorded duplicate',
        },
      };
    }

    // 2. Post the media with the review keyboard.
    const posted = await this.post(request, reviewId);
    if (!posted.ok) {
      if (posted.ambiguous) {
        await this.reportReview(reviewId, request, {
          status: 'uncertain',
          error: `Telegram send outcome unconfirmed: ${posted.error}`,
        });
        return {
          ack: {
            kind: 'retryable_failure',
            error: `Telegram send outcome unconfirmed; a retry will converge via the pre-flight check (${posted.error})`,
          },
        };
      }
      return { ack: { kind: 'permanent_failure', error: posted.error } };
    }

    // 3. Record the review (idempotent by review id).
    const reported = await this.reportReview(reviewId, request, {
      status: 'pending',
      messages: posted.messages,
      ...(posted.mediaGroupId ? { mediaGroupId: posted.mediaGroupId } : {}),
    });
    if (!reported) {
      // The media IS in the review chat but the control plane does not know it.
      // Record it as uncertain so a retry converges instead of posting a copy.
      await this.reportReview(reviewId, request, {
        status: 'uncertain',
        error: 'media posted but the review could not be recorded',
      });
      return {
        ack: {
          kind: 'retryable_failure',
          error: 'media posted but the review was not recorded; recorded as uncertain to prevent a duplicate post',
        },
      };
    }

    return {
      ack: {
        kind: 'accepted',
        remoteId: reviewId,
        remoteStatus: 'in_review',
        raw: { messages: posted.messages.length },
      },
    };
  }

  /** GET /control/reviews/<id>: does the control plane already know this review? */
  private async lookupReview(reviewId: string): Promise<'found' | 'missing' | 'unreachable'> {
    try {
      const response = await this.fetchImpl(
        `${this.trimmedControlPlane()}/reviews/${encodeURIComponent(reviewId)}`,
        { method: 'GET', headers: this.controlHeaders() }
      );
      if (response.status === 200) return 'found';
      if (response.status === 404) return 'missing';
      // 401/5xx: treat as unknown rather than "missing" — posting on a maybe is
      // how duplicates happen.
      return 'unreachable';
    } catch {
      return 'unreachable';
    }
  }

  private controlHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.controlPlaneToken}`,
      'content-type': 'application/json',
    };
  }

  private trimmedControlPlane(): string {
    return this.config.controlPlaneUrl.replace(/\/+$/, '');
  }

  private async reportReview(
    reviewId: string,
    request: DeliveryRequest,
    input:
      | { status: 'pending'; messages: PostedMessage[]; mediaGroupId?: string }
      | { status: 'uncertain'; error: string }
  ): Promise<boolean> {
    const body: Record<string, unknown> = {
      review_id: reviewId,
      bot_id: this.botId(),
      chat_id: this.config.chatId,
      publish_chat_id: this.config.publishChatId,
      ...(this.config.publishThreadId !== undefined ? { publish_thread_id: this.config.publishThreadId } : {}),
      slot_id: request.context.slotId ?? null,
      target_id: request.context.targetId ?? null,
      work_id: request.context.pixivId,
      caption: this.caption(request),
      status: input.status,
    };
    if (input.status === 'pending') {
      body.message_id = input.messages[0]?.messageId ?? null;
      body.message_ids = input.messages.map((message) => message.messageId);
      body.file_ids = input.messages.map((message) => message.fileId).filter(Boolean);
      if (input.mediaGroupId) body.media_group_id = input.mediaGroupId;
    } else {
      body.error = input.error;
    }

    try {
      const response = await this.fetchImpl(`${this.trimmedControlPlane()}/reviews`, {
        method: 'POST',
        headers: this.controlHeaders(),
        body: JSON.stringify(body),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Bot identity is deployment data; guessing it from a chat id would be wrong. */
  private botId(): string {
    return this.config.botId;
  }

  private caption(request: DeliveryRequest): string {
    if (!this.config.caption) return request.context.title;
    return renderDeliveryTemplate(this.config.caption, buildTemplateVariables(request));
  }

  private async post(request: DeliveryRequest, reviewId: string): Promise<PostOutcome> {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ 发布', callback_data: `review:${reviewId}:approve` },
          { text: '❌ 拒绝', callback_data: `review:${reviewId}:reject` },
        ],
      ],
    };
    const album = (this.config.album ?? true) && request.files.length > 1;

    const form = new FormData();
    form.append('chat_id', this.config.chatId);
    if (this.config.publishThreadId !== undefined) {
      form.append('message_thread_id', String(this.config.publishThreadId));
    }
    form.append('reply_markup', JSON.stringify(keyboard));

    if (album) {
      const media = [];
      for (const [index, file] of request.files.entries()) {
        const buffer = await import('node:fs/promises').then((fs) => fs.readFile(file));
        form.append(`file${index}`, new Blob([new Uint8Array(buffer)]), `media${index}`);
        media.push({ type: 'photo', media: `attach://file${index}` });
      }
      form.append('media', JSON.stringify(media));
    } else {
      const file = request.files[0];
      if (!file) return { ok: false, ambiguous: false, error: 'no files to deliver' };
      const buffer = await import('node:fs/promises').then((fs) => fs.readFile(file));
      form.append(
        request.context.type === 'novel' ? 'document' : 'photo',
        new Blob([new Uint8Array(buffer)]),
        'media'
      );
      form.append('caption', this.caption(request).slice(0, 1024));
    }

    const method = album ? 'sendMediaGroup' : request.context.type === 'novel' ? 'sendDocument' : 'sendPhoto';
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.botApiBase()}/bot${this.config.botToken}/${method}`, {
        method: 'POST',
        body: form,
      });
    } catch (error) {
      return {
        ok: false,
        ambiguous: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    let envelope: TelegramEnvelope = {};
    try {
      envelope = (await response.json()) as TelegramEnvelope;
    } catch {
      envelope = {};
    }
    if (!response.ok || envelope.ok === false) {
      return {
        ok: false,
        ambiguous: false,
        error: envelope.description ?? `Telegram HTTP ${response.status}`,
      };
    }

    const messages = extractMessages(envelope.result);
    if (messages.length === 0) {
      // A 200 without message ids means we cannot point the review at anything.
      return { ok: false, ambiguous: true, error: 'Telegram accepted the send but returned no message id' };
    }
    const mediaGroupId = Array.isArray(envelope.result)
      ? (envelope.result[0] as { media_group_id?: string } | undefined)?.media_group_id
      : (envelope.result as { media_group_id?: string } | undefined)?.media_group_id;
    return { ok: true, messages, ...(mediaGroupId ? { mediaGroupId } : {}) };
  }

  private botApiBase(): string {
    return process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org';
  }
}

function extractMessages(result: unknown): PostedMessage[] {
  const items = Array.isArray(result) ? result : result ? [result] : [];
  const messages: PostedMessage[] = [];
  for (const item of items) {
    const message = item as { message_id?: number; photo?: Array<{ file_id?: string }>; document?: { file_id?: string } };
    if (typeof message.message_id !== 'number') continue;
    // The largest photo size carries the file id we would reuse later.
    const photo = Array.isArray(message.photo) ? message.photo[message.photo.length - 1] : undefined;
    const fileId = photo?.file_id ?? message.document?.file_id;
    messages.push({ messageId: message.message_id, ...(fileId ? { fileId } : {}) });
  }
  return messages;
}

/** Compile-time reminder that the ack union stays closed over these kinds. */
export type TelegramReviewAck = Extract<
  DeliveryAck,
  { kind: 'accepted' | 'idempotent_replay' | 'retryable_failure' | 'permanent_failure' }
>;
