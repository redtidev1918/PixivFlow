import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { DeliveryFieldValue, HttpMultipartDeliveryConfig } from '../config';
import { logger } from '../logger';
import { DeliveryNotificationRequest, DeliveryProvider, DeliveryRequest, DeliveryResult } from './types';
import { parseDeliveryAck } from './DeliveryAck';
import { redactError, redactHeaders, redactUrl } from '../utils/redact';

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

/** Generic streaming HTTP multipart delivery provider. */
export class HttpMultipartDelivery implements DeliveryProvider {
  private readonly dispatcher?: unknown;

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
    const url = this.config.notificationUrl?.trim();
    if (!url) throw new Error('HTTP delivery notificationUrl is not configured');
    const headers = {
      ...this.resolveHeaders(this.config.headers ?? {}),
      'Content-Type': 'application/json',
    };
    const options: Record<string, unknown> = {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: request.text, idempotency_key: request.idempotencyKey }),
    };
    if (this.dispatcher) options.dispatcher = this.dispatcher;
    const response = await fetch(this.interpolateEnvironment(url), options as Parameters<typeof fetch>[1]);
    const text = await response.text();
    let body: unknown = text;
    if (text) { try { body = JSON.parse(text); } catch { /* plain ok */ } }
    if (!response.ok) throw new Error(`notification endpoint returned HTTP ${response.status}`);
    logger.info('HTTP delivery notification sent', { url: redactUrl(url), status: response.status });
    return { status: response.status, body };
  }

  private async attempt(request: DeliveryRequest): Promise<DeliveryResult> {
    const fields = this.resolveFields(
      { ...(this.config.fields ?? {}), ...(request.fields ?? {}) },
      request
    );
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

  private assertSuccess(response: Response, body: unknown): void {
    const expectedStatuses = this.config.success?.statuses;
    const statusOk = expectedStatuses
      ? expectedStatuses.includes(response.status)
      : response.ok;
    if (!statusOk) {
      throw new Error(`delivery endpoint returned HTTP ${response.status}: ${this.preview(body)}`);
    }

    const jsonPath = this.config.success?.jsonPath;
    if (jsonPath) {
      const actual = jsonPath.split('.').reduce<unknown>((value, key) => {
        if (!value || typeof value !== 'object') return undefined;
        return (value as Record<string, unknown>)[key];
      }, body);
      const expected = Object.prototype.hasOwnProperty.call(this.config.success, 'equals')
        ? this.config.success?.equals
        : true;
      if (!Object.is(actual, expected)) {
        throw new Error(
          `delivery response ${jsonPath} did not equal ${JSON.stringify(expected)}: ${this.preview(body)}`
        );
      }
    }
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
    const xRestrict = request.context.xRestrict;
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
    const variables: Record<string, string> = {
      title: request.context.title,
      pixivId: request.context.pixivId,
      type: request.context.type,
      targetId: request.context.targetId ?? '',
      tag: request.context.tag ?? '',
      topic: request.context.topic ?? '',
      workTags: request.context.workTags?.join(',') ?? '',
      // Canonical Pixiv permalink; generated here so templates stay type-agnostic.
      link:
        request.context.type === 'novel'
          ? `https://www.pixiv.net/novel/show.php?id=${request.context.pixivId}`
          : `https://www.pixiv.net/artworks/${request.context.pixivId}`,
      // Non-empty topic-or-tag label for tags fields (topic targets have no tag).
      topicTag: request.context.topic || request.context.tag || '',
      // R-18 works are auto-spoilerized; templates can use {{spoiler}} instead
      // of hard-coding true.
      spoiler: request.context.spoiler === true ? 'true' : 'false',
      // Keep Pixiv's exact rating independent from the channel's mask policy.
      xRestrict: xRestrict === undefined ? '' : String(xRestrict),
      xRestrictLabel,
      xRestrictTag,
      // Ranking day (JST YYYY-MM-DD) — which day's hot works this is.
      rankingDate: request.context.rankingDate ?? '',
      // Pixiv publish date, YYYY-MM-DD (create_date is JST ISO).
      publishedDate: formatPublishedDate(request.context.publishedAt),
      // Detected language for novels ("Chinese (Mandarin) (cmn)"); empty for
      // illustrations or when detection was inconclusive.
      language: request.context.language ?? '',
      // Popularity signals. Compact localized form (e.g. 12.3k) when large,
      // empty string when the API response carried no count.
      bookmarkCount: formatCount(request.context.bookmarkCount),
      viewCount: formatCount(request.context.viewCount),
      // Schedule slot provenance (e.g. 2026-09-08 / morning / 2026-09-08:morning)
      // so the review card can show "今日早班 · bot1 · 小说" instead of a bare post.
      scheduleId: request.context.scheduleId ?? '',
      executionId: request.context.executionId ?? '',
      occurrenceAt: request.context.occurrenceAt ?? '',
      triggerSource: request.context.triggerSource ?? '',
      slotId: request.context.slotId ?? '',
      slotName: request.context.slotName ?? '',
      slotDate: request.context.slotDate ?? '',
      // The occurrence-scoped intent key. MUST be sent so an ACK-loss retry
      // (same key) converges remotely as idempotent_replay instead of being
      // mistaken for a historical duplicate or, worse, double-posting.
      idempotencyKey: (request.context.idempotencyKey as string) ?? '',
    };
    return Object.fromEntries(
      Object.entries(fields).map(([name, value]) => {
        const values = Array.isArray(value) ? value : [value];
        const rendered = values.map((item) =>
          String(item).replace(
            /\{\{(title|pixivId|type|targetId|tag|topic|workTags|link|topicTag|spoiler|xRestrict|xRestrictLabel|xRestrictTag|rankingDate|publishedDate|language|bookmarkCount|viewCount|scheduleId|executionId|occurrenceAt|triggerSource|slotId|slotName|slotDate|idempotencyKey)\}\}/g,
            (_, key: string) => variables[key]
          )
        );
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

  private preview(body: unknown): string {
    const value = typeof body === 'string' ? body : JSON.stringify(body);
    return value.slice(0, 500);
  }
}
