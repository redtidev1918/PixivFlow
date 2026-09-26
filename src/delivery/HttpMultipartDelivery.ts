import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { DeliveryFieldValue, HttpMultipartDeliveryConfig } from '../config';
import { logger } from '../logger';
import { DeliveryNotificationRequest, DeliveryProvider, DeliveryRequest, DeliveryResult } from './types';
import { parseDeliveryAck } from './DeliveryAck';
import { redactError, redactHeaders, redactUrl } from '../utils/redact';
import type { MediaAsset } from '../domain/media/MediaAsset';

export interface ReadinessProbeResult {
  ready: boolean;
  /** Short machine-readable reason when not ready. */
  reason?: 'connection_refused' | 'timeout' | string;
  status?: number;
}

/** Render an ISO timestamp to YYYY-MM-DD (create_date is JST). */
function formatPublishedDate(iso?: string): string {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : iso.slice(0, 10);
}

/**
 * Render a popularity count for a caption. Large numbers use a compact k/w
 * form (1234 -> "1.2k", 34567 -> "3.5w"); absent/undefined renders empty so
 * templates can leave the line out rather than showing "0".
 */
function formatCount(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** Hide URL userinfo and query secrets from operational logs. */
// redactUrl lives in utils/redact.ts; re-exported for existing imports.
export { redactUrl } from '../utils/redact';

/**
 * Serialize canonical MediaAssets to TelePost's minimal Delivery Asset
 * Contract ({asset_id, kind, source_url, mime_type?}). TelePost deliberately
 * rejects unknown domain fields, so the provider maps its own shape here
 * instead of forwarding the internal MediaAsset object.
 */
export function toTelepostMediaAssetsWire(assets: MediaAsset[]): unknown[] {
  return assets.map((asset) => ({
    asset_id: asset.id,
    kind: asset.kind,
    source_url: asset.sourceUrl,
    ...(asset.mimeType ? { mime_type: asset.mimeType } : {}),
  }));
}

/** Generic streaming HTTP multipart delivery provider. */
export class HttpMultipartDelivery implements DeliveryProvider {
  private readonly dispatcher?: unknown;
  /** Logged once per provider instance, not once per attempt. */
  private autoIdempotencyKeyNoted = false;

  constructor(
    private readonly config: HttpMultipartDeliveryConfig,
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
   * Readiness with a structured reason. Short (3s) timeout so cold-start probes
   * never hang the outbox pump. Missing readinessUrl means "always ready".
   */
  async readinessProbe(): Promise<ReadinessProbeResult> {
    const url = this.config.readinessUrl?.trim();
    if (!url) return { ready: true };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    timer.unref?.();
    const options: Record<string, unknown> = { method: 'GET', signal: controller.signal };
    if (this.dispatcher) options.dispatcher = this.dispatcher;
    try {
      const response = await fetch(this.interpolateEnvironment(url), options as Parameters<typeof fetch>[1]);
      if (response.ok) return { ready: true, status: response.status };
      return { ready: false, reason: `http_${response.status}`, status: response.status };
    } catch (error) {
      const aborted = (error as { name?: string })?.name === 'AbortError';
      const message = redactError(error);
      logger.warn('Delivery readiness probe failed', {
        url: redactUrl(url),
        reason: aborted ? 'timeout' : 'connection_refused',
        error: message,
      });
      return { ready: false, reason: aborted ? 'timeout' : 'connection_refused' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One delivery attempt. Retry/backoff/dead-letter belong to the outbox worker,
   * not here, so this performs exactly ONE HTTP call and normalizes the result
   * into a DeliveryAck. HTTP status/body is never silently treated as success.
   */
  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    if (request.files.length === 0) {
      throw new Error('HTTP multipart delivery requires at least one file');
    }
    const { status, body } = await this.attempt(request);
    const httpStatus = status ?? 0;
    return { status: httpStatus, body, ack: parseDeliveryAck(httpStatus, body, this.config.ack) };
  }

  /** Single notification attempt; the outbox owns retries. */
  async notifyOnce(request: DeliveryNotificationRequest): Promise<{ status: number; body: unknown }> {
    const outcome = request.refetchOutcome;
    const scheduleOutcome = request.scheduleOutcome;
    const url = (
      outcome ? this.config.refetchOutcomeUrl?.trim()
      : scheduleOutcome ? this.config.scheduleOutcomeUrl?.trim()
      : this.config.notificationUrl?.trim()
    );
    if (!url) {
      throw new Error(
        outcome
          ? 'HTTP delivery refetchOutcomeUrl is not configured'
          : scheduleOutcome
            ? 'HTTP delivery scheduleOutcomeUrl is not configured'
            : 'HTTP delivery notificationUrl is not configured'
      );
    }
    const headers = {
      ...this.resolveHeaders(this.config.headers ?? {}),
      'Content-Type': 'application/json',
    };
    // Refetch verdicts and schedule outcomes are machine-readable JSON for
    // TelePost's state machines/relays. Plain notifications remain
    // {text, idempotency_key}.
    const body = outcome
      ? {
          request_id: outcome.requestId,
          disposition: outcome.disposition,
          reason: outcome.reason,
          work_id: outcome.workId,
          scanned: outcome.scanned,
          skipped: outcome.skipped,
        }
      : scheduleOutcome
        ? {
            schedule_id: scheduleOutcome.scheduleId,
            slot_id: scheduleOutcome.slotId,
            status: scheduleOutcome.status,
            targets: (scheduleOutcome.targets ?? []).map((t) => ({
              target_id: t.targetId,
              work_type: t.workType,
              status: t.status,
              work_id: t.workId ?? null,
              terminal_reason_code: t.terminal_reason_code ?? null,
              reason: t.reason ?? null,
              stage: t.stage ?? null,
              retryable: t.retryable ?? null,
              operator_hint: t.operator_hint ?? null,
              candidate_report: t.candidate_report ?? null,
            })),
          }
        : { text: request.text, idempotency_key: request.idempotencyKey };
    const options: Record<string, unknown> = {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5 * 60_000),
    };
    if (this.dispatcher) options.dispatcher = this.dispatcher;
    const response = await fetch(this.interpolateEnvironment(url), options as Parameters<typeof fetch>[1]);
    const text = await response.text();
    let parsed: unknown = text;
    if (text) { try { parsed = JSON.parse(text); } catch { /* plain ok */ } }
    if (!response.ok) throw new Error(`notification endpoint returned HTTP ${response.status}`);
    logger.info('HTTP delivery notification sent', {
      url: redactUrl(url),
      status: response.status,
      hasRefetchOutcome: Boolean(outcome),
    });
    return { status: response.status, body: parsed };
  }

  private async attempt(request: DeliveryRequest): Promise<DeliveryResult> {
    const fields = this.resolveFields(
      this.addIdempotencyKeyIfMissing({
        ...(this.config.fields ?? {}),
        ...(request.fields ?? {}),
      }),
      request
    );
    if (request.mediaAssets?.length) {
      // TelePost's optional media-asset contract is provider-independent. The
      // local files still lead; assets are advisory delivery-plan facts. The
      // wire shape is TelePost's minimal contract, not our internal model.
      fields.media_assets = [JSON.stringify(toTelepostMediaAssetsWire(request.mediaAssets))];
    }
    const multipart = await this.createMultipartBody(
      request.files, fields, request.previewFiles
    );
    const headers: Record<string, string> = {
      ...this.resolveHeaders(this.config.headers ?? {}),
      'Content-Type': `multipart/form-data; boundary=${multipart.boundary}`,
      'Content-Length': String(multipart.contentLength),
    };
    const options: Record<string, unknown> = {
      method: this.config.method ?? 'POST',
      body: multipart.body,
      headers,
      duplex: 'half',
      signal: AbortSignal.timeout(5 * 60_000),
    };
    if (this.dispatcher) options.dispatcher = this.dispatcher;

    const response = await fetch(
      this.interpolateEnvironment(this.config.url),
      options as Parameters<typeof fetch>[1]
    );
    const text = await response.text();
    let body: unknown = text;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // Non-JSON responses are valid when only HTTP status is configured.
      }
    }
    const data = body && typeof body === 'object'
      ? (body as { data?: Record<string, unknown> }).data
      : undefined;
    // Classification happens in parseDeliveryAck (DeliveryResult.ack). We keep
    // the raw status/body and only log for correlation.
    logger.info('HTTP multipart delivery response', {
      url: redactUrl(this.config.url),
      status: response.status,
      files: request.files.length,
      deliveryStatus: data?.status,
      reviewId: data?.review_id,
      reused: data?.reused,
    });
    return { status: response.status, body };
  }

  /**
   * Submission-side dedup net: every submission must carry `idempotency_key`.
   *
   * Without it, an ACK-loss retry reaches the receiver as a brand-new post —
   * the receiving service has nothing to match the resend against. Hand-written
   * configs (and configs written before the requirement) omit the field, which
   * is exactly how one work ends up submitted twice, so it is added when the
   * resolved fields do not declare it.
   *
   * Only the FORM FIELD NAME is inspected: a template cannot rename a field, and
   * both spellings seen in the wild count as declared. A receiver that rejects
   * unknown fields can opt out with `autoIdempotencyKey: false`.
   */
  private addIdempotencyKeyIfMissing(
    fields: Record<string, DeliveryFieldValue>
  ): Record<string, DeliveryFieldValue> {
    if (this.config.autoIdempotencyKey === false) return fields;
    if ('idempotency_key' in fields || 'idempotencyKey' in fields) return fields;
    if (!this.autoIdempotencyKeyNoted) {
      this.autoIdempotencyKeyNoted = true;
      logger.info('HTTP multipart delivery: idempotency_key not configured, adding it', {
        url: redactUrl(this.config.url),
      });
    }
    return { ...fields, idempotency_key: '{{idempotencyKey}}' };
  }

  private resolveHeaders(headers: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, this.interpolateEnvironment(value)])
    );
  }

  private resolveFields(
    fields: Record<string, DeliveryFieldValue>,
    request: DeliveryRequest
  ): Record<string, string[]> {
    const variables = buildTemplateVariables(request);
    return Object.fromEntries(
      Object.entries(fields).map(([name, value]) => {
        const values = Array.isArray(value) ? value : [value];
        const rendered = values.map((item) => renderDeliveryTemplate(String(item), variables));
        if (name === 'refetch_request_id' && rendered.some((item) => /\{\{[^{}]+\}\}/.test(item))) {
          throw new Error('Unresolved refetch_request_id template');
        }
        switch (this.config.arrayFormat ?? 'comma') {
          case 'repeat':
            return [name, rendered];
          case 'json':
            return [name, [JSON.stringify(rendered)]];
          default:
            return [name, [rendered.join(',')]];
        }
      })
    );
  }

  private interpolateEnvironment(value: string): string {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
      const resolved = process.env[name];
      if (resolved === undefined) {
        throw new Error(`Required delivery environment variable is not set: ${name}`);
      }
      return resolved;
    });
  }

  private async createMultipartBody(
    files: string[],
    fields: Record<string, string[]>,
    previewFiles: string[] = []
  ): Promise<{ boundary: string; body: Readable; contentLength: number }> {
    if (previewFiles.length > 0 && previewFiles.length !== files.length) {
      throw new Error('previewFiles must be empty or align one-to-one with files');
    }
    const boundary = `pixivflow-${randomUUID()}`;
    const fileField = this.escapeDispositionValue(this.config.fileField ?? 'files');
    const fileParts: Array<{ header: Buffer; path: string; size: number }> = [];
    let contentLength = 0;

    for (const file of files) {
      const filename = this.escapeDispositionValue(path.basename(file));
      const header = Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\n` +
          'Content-Type: application/octet-stream\r\n\r\n'
      );
      const stat = await fs.promises.stat(file);
      fileParts.push({ header, path: file, size: stat.size });
      contentLength += header.length + stat.size + 2;
    }
    const previewField = this.escapeDispositionValue(
      this.config.previewFileField ?? 'previews'
    );
    for (const file of previewFiles) {
      const filename = this.escapeDispositionValue(path.basename(file));
      const header = Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${previewField}"; filename="${filename}"\r\n` +
          'Content-Type: application/octet-stream\r\n\r\n'
      );
      const stat = await fs.promises.stat(file);
      fileParts.push({ header, path: file, size: stat.size });
      contentLength += header.length + stat.size + 2;
    }

    const fieldParts: Buffer[] = [];
    for (const [name, values] of Object.entries(fields)) {
      for (const value of values) {
        const part = Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${this.escapeDispositionValue(name)}"\r\n\r\n` +
            `${value}\r\n`
        );
        fieldParts.push(part);
        contentLength += part.length;
      }
    }
    const closing = Buffer.from(`--${boundary}--\r\n`);
    contentLength += closing.length;

    const body = Readable.from(
      (async function* () {
        for (const file of fileParts) {
          yield file.header;
          for await (const chunk of fs.createReadStream(file.path)) yield chunk;
          yield Buffer.from('\r\n');
        }
        for (const part of fieldParts) yield part;
        yield closing;
      })()
    );
    return { boundary, body, contentLength };
  }

  private escapeDispositionValue(value: string): string {
    return value.replace(/[\r\n]/g, ' ').replace(/"/g, '%22');
  }
}

/**
 * Template variables shared by every delivery provider.
 *
 * Exported so a provider that is not HTTP multipart — the Telegram review sender —
 * renders the SAME vocabulary instead of owning a second, drifting copy of it.
 */
export function buildTemplateVariables(request: DeliveryRequest): Record<string, string> {
  const c = request.context;
  const xRestrict = c.xRestrict;
  const xRestrictLabel = (() => {
    if (xRestrict === undefined) return 'unknown';
    if (xRestrict === 0) return 'all-ages';
    if (xRestrict === 1) return 'R-18';
    if (xRestrict === 2) return 'R-18G';
    return `unknown(${xRestrict})`;
  })();
  const xRestrictTag = (() => {
    if (xRestrict === undefined) return '';
    if (xRestrict === 0) return 'AllAges';
    if (xRestrict === 1) return 'R18';
    if (xRestrict === 2) return 'R18G';
    return `XRestrict${xRestrict}`;
  })();

  return {
    title: c.title,
    pixivId: c.pixivId,
    type: c.type,
    targetId: c.targetId ?? '',
    tag: c.tag ?? '',
    topic: c.topic ?? '',
    workTags: c.workTags?.join(',') ?? '',
    // Pixiv author display name. Empty (not "Unknown") when the API response
    // carried none, so a template like `作者：{{author}}` degrades visibly
    // instead of inventing an attribution.
    author: c.author ?? '',
    // Canonical Pixiv permalink; generated here so templates stay type-agnostic.
    link:
      c.type === 'novel'
        ? `https://www.pixiv.net/novel/show.php?id=${c.pixivId}`
        : `https://www.pixiv.net/artworks/${c.pixivId}`,
    // Non-empty topic-or-tag label for tags fields (topic targets have no tag).
    topicTag: c.topic || c.tag || '',
    // R-18 works are auto-spoilerized; templates can use {{spoiler}} instead of
    // hard-coding true.
    spoiler: c.spoiler === true ? 'true' : 'false',
    // Keep Pixiv's exact rating independent from the channel's mask policy.
    xRestrict: xRestrict === undefined ? '' : String(xRestrict),
    xRestrictLabel,
    xRestrictTag,
    // Ranking day (JST YYYY-MM-DD) — which day's hot works this is.
    rankingDate: c.rankingDate ?? '',
    // Pixiv publish date, YYYY-MM-DD (create_date is JST ISO).
    publishedDate: formatPublishedDate(c.publishedAt),
    // Detected language for novels ("Chinese (Mandarin) (cmn)"); empty for
    // illustrations or when detection was inconclusive.
    language: c.language ?? '',
    // Popularity signals. Compact localized form (e.g. 12.3k) when large, empty
    // string when the API response carried no count.
    bookmarkCount: formatCount(c.bookmarkCount),
    viewCount: formatCount(c.viewCount),
    // Schedule slot provenance (e.g. 2026-09-08 / morning / 2026-09-08:morning) so
    // a review card can show "今日早班 · bot1 · 小说" instead of a bare post.
    scheduleId: c.scheduleId ?? '',
    executionId: c.executionId ?? '',
    occurrenceAt: c.occurrenceAt ?? '',
    triggerSource: c.triggerSource ?? '',
    slotId: c.slotId ?? '',
    slotName: c.slotName ?? '',
    slotDate: c.slotDate ?? '',
    // The occurrence-scoped intent key. MUST be sent so an ACK-loss retry (same
    // key) converges remotely as idempotent_replay instead of being mistaken for
    // a historical duplicate or, worse, double-posting.
    idempotencyKey: (c.idempotencyKey as string) ?? '',
    // Remote manual replacement ("重抓") request UUID; empty for scheduled runs.
    // Carried through the delivery payload context (extraContext) so the
    // receiving service can correlate the review with its refetch attempt.
    refetchRequestId: (c.refetchRequestId as string) ?? '',
  };
}

/**
 * `{{name}}` substitution. Unknown placeholders are left literal rather than
 * silently emptied, so a typo in a template is visible in the delivered message.
 */
export function renderDeliveryTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => variables[key] ?? match);
}
