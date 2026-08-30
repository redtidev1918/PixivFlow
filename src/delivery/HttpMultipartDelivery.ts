import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { DeliveryFieldValue, HttpMultipartDeliveryConfig } from '../config';
import { logger } from '../logger';
import { DeliveryProvider, DeliveryRequest, DeliveryResult } from './types';

/** Render an ISO timestamp to YYYY-MM-DD (create_date is JST). */
function formatPublishedDate(iso?: string): string {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : iso.slice(0, 10);
}

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

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    if (request.files.length === 0) {
      throw new Error('HTTP multipart delivery requires at least one file');
    }

    const maxAttempts = Math.max(1, this.config.maxAttempts ?? 3);
    const retryDelayMs = Math.max(0, this.config.retryDelayMs ?? 2000);
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.attempt(request);
      } catch (error) {
        lastError = error;
        logger.warn(`HTTP multipart delivery attempt ${attempt}/${maxAttempts} failed`, {
          url: this.config.url,
          error: error instanceof Error ? error.message : String(error),
          files: request.files.length,
        });
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
        }
      }
    }
    throw new Error(
      `HTTP multipart delivery failed after ${maxAttempts} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }

  private async attempt(request: DeliveryRequest): Promise<DeliveryResult> {
    const fields = this.resolveFields(
      { ...(this.config.fields ?? {}), ...(request.fields ?? {}) },
      request
    );
    const multipart = await this.createMultipartBody(request.files, fields);
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
    this.assertSuccess(response, body);
    logger.info('HTTP multipart delivery succeeded', {
      url: this.config.url,
      status: response.status,
      files: request.files.length,
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
    const variables: Record<string, string> = {
      title: request.context.title,
      pixivId: request.context.pixivId,
      type: request.context.type,
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
      // Ranking day (JST YYYY-MM-DD) — which day's hot works this is.
      rankingDate: request.context.rankingDate ?? '',
      // Pixiv publish date, YYYY-MM-DD (create_date is JST ISO).
      publishedDate: formatPublishedDate(request.context.publishedAt),
      // Detected language for novels ("Chinese (Mandarin) (cmn)"); empty for
      // illustrations or when detection was inconclusive.
      language: request.context.language ?? '',
    };
    return Object.fromEntries(
      Object.entries(fields).map(([name, value]) => {
        const values = Array.isArray(value) ? value : [value];
        const rendered = values.map((item) =>
          String(item).replace(
            /\{\{(title|pixivId|type|tag|topic|workTags|link|topicTag|spoiler|rankingDate|publishedDate|language)\}\}/g,
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
    fields: Record<string, string[]>
  ): Promise<{ boundary: string; body: Readable; contentLength: number }> {
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
