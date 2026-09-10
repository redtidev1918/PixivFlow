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

/**
 * The three message kinds a review is made of, kept apart on purpose.
 *
 * Telegram's caption rules are what force the split: a caption belongs to a message,
 * so attaching the text to the first file of an album makes the text logically part of
 * that one file. The reviewer should read every file first and the text after it, and
 * the published post must keep the same shape.
 */
interface PostedReview {
  /** Ordered media message ids: one album, or several consecutive groups. */
  mediaMessageIds: number[];
  /** One message carrying the work's text, sent after ALL media. */
  captionMessageId: number;
  /** The card with the approve/reject buttons. Never published. */
  controlMessageId: number;
  fileIds: string[];
  mediaGroupIds: string[];
}

type PostOutcome =
  | { ok: true; review: PostedReview }
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

    // 2. Post media, then the text, then the control card.
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
      review: posted.review,
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
        raw: { media: posted.review.mediaMessageIds.length },
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
      | { status: 'pending'; review: PostedReview }
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
      // Three named fields, not one ambiguous array: media, text and the control card
      // are different things, and publishing has to tell them apart to reproduce the
      // same layout in the channel.
      body.media_message_ids = input.review.mediaMessageIds;
      body.caption_message_id = input.review.captionMessageId;
      body.control_message_id = input.review.controlMessageId;
      body.file_ids = input.review.fileIds;
      if (input.review.mediaGroupIds[0]) body.media_group_id = input.review.mediaGroupIds[0];
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

  /**
   * Send one review in the order a reviewer should read it.
   *
   *   [file1 | file2 | file3]   <- media, consecutive, no text inside it
   *   正文 / caption             <- one message, after ALL media
   *   审核控制卡                  <- the buttons, last
   *
   * The old shape put the caption on the first album item and the keyboard on the
   * media message, which made the text logically part of one file and left the review
   * with no control card of its own. Files of the same kind stay together as an album;
   * a different kind starts a new consecutive block; more than ten split into
   * consecutive groups with the text still waiting for all of them.
   */
  private async post(request: DeliveryRequest, reviewId: string): Promise<PostOutcome> {
    if (request.files.length === 0) return { ok: false, ambiguous: false, error: 'no files to deliver' };

    const mediaMessageIds: number[] = [];
    const fileIds: string[] = [];
    const mediaGroupIds: string[] = [];
    for (const block of this.mediaBlocks(request)) {
      const sent = await this.sendMediaBlock(block);
      if (!sent.ok) return sent;
      for (const message of sent.messages) {
        mediaMessageIds.push(message.messageId);
        if (message.fileId) fileIds.push(message.fileId);
      }
      if (sent.mediaGroupId) mediaGroupIds.push(sent.mediaGroupId);
    }

    const captionSent = await this.sendText(this.config.chatId, this.caption(request).slice(0, 4096));
    if (!captionSent.ok) return captionSent;

    const controlSent = await this.sendText(
      this.config.chatId,
      `🧾 审核 ${reviewId}\n按钮只作用于这一条审核，决定后本条会更新。`,
      {
        inline_keyboard: [
          [
            { text: '✅ 发布', callback_data: `review:${reviewId}:approve` },
            { text: '❌ 拒绝', callback_data: `review:${reviewId}:reject` },
          ],
        ],
      }
    );
    if (!controlSent.ok) return controlSent;

    return {
      ok: true,
      review: {
        mediaMessageIds,
        captionMessageId: captionSent.messageId,
        controlMessageId: controlSent.messageId,
        fileIds,
        mediaGroupIds,
      },
    };
  }

  /**
   * Same-kind files grouped into consecutive blocks of at most ten.
   *
   * A one-file block and a ten-file block are both blocks; only the API call differs,
   * and the order the reviewer sees is identical either way.
   */
  private mediaBlocks(request: DeliveryRequest): Array<{ kind: 'photo' | 'document'; files: string[] }> {
    // A novel is documents, an illustration is photos. Derived from the request, not
    // from the file name: a misnamed file must not change the layout.
    const kind: 'photo' | 'document' = request.context.type === 'novel' ? 'document' : 'photo';
    const blocks: Array<{ kind: 'photo' | 'document'; files: string[] }> = [];
    for (const file of request.files) {
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind && last.files.length < 10) last.files.push(file);
      else blocks.push({ kind, files: [file] });
    }
    return blocks;
  }

  /** One media block. Never carries a caption or a keyboard. */
  private async sendMediaBlock(
    block: { kind: 'photo' | 'document'; files: string[] }
  ): Promise<
    { ok: true; messages: PostedMessage[]; mediaGroupId?: string } | { ok: false; ambiguous: boolean; error: string }
  > {
    const fs = await import('node:fs/promises');
    const form = new FormData();
    form.append('chat_id', this.config.chatId);
    if (this.config.publishThreadId !== undefined) {
      form.append('message_thread_id', String(this.config.publishThreadId));
    }

    let method: string;
    if (block.files.length > 1) {
      const media: Array<{ type: string; media: string }> = [];
      for (const [index, file] of block.files.entries()) {
        const buffer = await fs.readFile(file);
        form.append(`file${index}`, new Blob([new Uint8Array(buffer)]), `media${index}`);
        media.push({ type: block.kind, media: `attach://file${index}` });
      }
      form.append('media', JSON.stringify(media));
      method = 'sendMediaGroup';
    } else {
      const buffer = await fs.readFile(block.files[0]!);
      form.append(block.kind, new Blob([new Uint8Array(buffer)]), 'media');
      method = block.kind === 'photo' ? 'sendPhoto' : 'sendDocument';
    }

    const envelope = await this.callMultipart(method, form);
    if (!envelope.ok) return envelope;
    const messages = extractMessages(envelope.result);
    if (messages.length === 0) {
      return { ok: false, ambiguous: true, error: 'Telegram accepted the send but returned no message id' };
    }
    const first = (Array.isArray(envelope.result) ? envelope.result[0] : envelope.result) as
      | { media_group_id?: string }
      | undefined;
    return { ok: true, messages, ...(first?.media_group_id ? { mediaGroupId: first.media_group_id } : {}) };
  }

  /** One text message, optionally with a keyboard. */
  private async sendText(
    chatId: string,
    text: string,
    replyMarkup?: unknown
  ): Promise<{ ok: true; messageId: number } | { ok: false; ambiguous: boolean; error: string }> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (replyMarkup !== undefined) body.reply_markup = replyMarkup;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.botApiBase()}/bot${this.config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      return { ok: false, ambiguous: true, error: error instanceof Error ? error.message : String(error) };
    }
    let envelope: TelegramEnvelope = {};
    try {
      envelope = (await response.json()) as TelegramEnvelope;
    } catch {
      envelope = {};
    }
    if (!response.ok || envelope.ok === false) {
      return { ok: false, ambiguous: false, error: envelope.description ?? `Telegram HTTP ${response.status}` };
    }
    const messageId = (envelope.result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId !== 'number') {
      return { ok: false, ambiguous: true, error: 'Telegram accepted the send but returned no message id' };
    }
    return { ok: true, messageId };
  }

  /** One multipart call, with the same ambiguity contract as the rest of this file. */
  private async callMultipart(
    method: string,
    form: FormData
  ): Promise<{ ok: true; result: unknown } | { ok: false; ambiguous: boolean; error: string }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.botApiBase()}/bot${this.config.botToken}/${method}`, {
        method: 'POST',
        body: form,
      });
    } catch (error) {
      // A lost response means Telegram may have accepted it: never resend blindly.
      return { ok: false, ambiguous: true, error: error instanceof Error ? error.message : String(error) };
    }
    let envelope: TelegramEnvelope = {};
    try {
      envelope = (await response.json()) as TelegramEnvelope;
    } catch {
      envelope = {};
    }
    if (!response.ok || envelope.ok === false) {
      return { ok: false, ambiguous: false, error: envelope.description ?? `Telegram HTTP ${response.status}` };
    }
    return { ok: true, result: envelope.result };
  }

  private botApiBase(): string {
    return process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org';
  }
}

/** Compile-time reminder that the ack union stays closed over these kinds. */
export type TelegramReviewAck = Extract<
  DeliveryAck,
  { kind: 'accepted' | 'idempotent_replay' | 'retryable_failure' | 'permanent_failure' }
>;

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
