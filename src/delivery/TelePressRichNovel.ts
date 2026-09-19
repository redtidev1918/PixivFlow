import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DownloadedArtifact } from './types';
import { mediaAssetId, type MediaAsset, type PixivMediaKind } from '../domain/media/MediaAsset';
import { logger } from '../logger';
import { redactUrl } from '../utils/redact';

export interface RichNovelPreviewResult {
  /** Telegraph "read online" URL for the published page. */
  url: string;
  /** Per-asset diagnostic returned by TelePress ({local, remote, status}). */
  assets?: Array<{ local: string; remote?: string | null; status: string }>;
}

export interface RichNovelPublishOptions {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Locate the rich-markdown sidecar and its inline image directory for a novel
 * artifact. Pure-text novels (no images dir / no sidecar) return undefined so
 * the caller can skip enrichment with zero behaviour change.
 */
export function interpolateEnv(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    const resolved = process.env[name];
    if (resolved === undefined) {
      throw new Error(`Required TelePress environment variable is not set: ${name}`);
    }
    return resolved;
  });
}

export interface RichNovelManifestEntry {
  /** Markdown-relative path, e.g. ``images/001.jpg``. */
  local: string;
  /** Original Pixiv CDN source URL (``https://i.pximg.net/...``). */
  source: string;
}

export interface RichNovelSources {
  txtPath: string;
  mdPath: string;
  imagePaths: string[];
  /** Canonical media references derived from the novel metadata file. */
  mediaAssets: MediaAsset[];
  /** Optional Pixiv CDN source map derived from the novel metadata file. */
  manifest: RichNovelManifestEntry[];
}

interface NovelMetadataAsset {
  marker?: unknown;
  kind?: unknown;
  sourceId?: unknown;
  url?: unknown;
  localPath?: unknown;
  status?: unknown;
}

interface NovelMetadata {
  pixiv_id?: unknown;
  assets?: NovelMetadataAsset[];
}

function isDownloadedPixivAsset(asset: NovelMetadataAsset): asset is NovelMetadataAsset & { url: unknown; localPath: unknown } {
  return Boolean(asset && asset.status === 'downloaded' && asset.url && asset.localPath);
}

/**
 * Read the novel metadata sidecar into canonical `MediaAsset` values, plus the
 * legacy `{local, source}` manifest projection (local is only a render hint for
 * the markdown refs; source is the media fact).
 */
function readNovelMediaAssets(artifact: DownloadedArtifact): { mediaAssets: MediaAsset[]; manifest: RichNovelManifestEntry[] } {
  const metadataFile = (artifact.cleanupFiles ?? []).find((f) => /\.json$/i.test(f));
  if (!metadataFile || !fs.existsSync(metadataFile)) {
    return { mediaAssets: [], manifest: [] };
  }
  try {
    const meta = JSON.parse(fs.readFileSync(metadataFile, 'utf8')) as NovelMetadata;
    if (!Array.isArray(meta.assets)) return { mediaAssets: [], manifest: [] };
    const workId = meta.pixiv_id ? String(meta.pixiv_id) : artifact.pixivId;
    const mediaAssets: MediaAsset[] = [];
    const manifest: RichNovelManifestEntry[] = [];
    for (const asset of meta.assets) {
      if (!isDownloadedPixivAsset(asset)) continue;
      const kind = asset.kind === 'uploadedimage' || asset.kind === 'pixivimage'
        ? asset.kind as PixivMediaKind
        : undefined;
      const source = String(asset.url);
      const localPath = String(asset.localPath);
      if (!source || !localPath || !kind) continue;
      mediaAssets.push({
        id: mediaAssetId(workId, kind, asset.sourceId ? String(asset.sourceId) : undefined),
        source: 'pixiv',
        kind: 'image',
        sourceUrl: source,
        artifactId: localPath,
        sourceRef: {
          workId,
          sourceId: asset.sourceId ? String(asset.sourceId) : undefined,
          marker: asset.marker ? String(asset.marker) : undefined,
          pixivKind: kind,
        },
      });
      manifest.push({ local: `images/${path.basename(localPath)}`, source });
    }
    return { mediaAssets, manifest };
  } catch {
    return { mediaAssets: [], manifest: [] };
  }
}

export function findRichNovelSources(
  artifact: DownloadedArtifact
): RichNovelSources | undefined {
  if (artifact.type !== 'novel') return undefined;
  const txtPath = artifact.files.find((f) => /\.txt$/i.test(f));
  if (!txtPath) return undefined;
  const mdPath = txtPath.replace(/\.txt$/i, '.md');
  if (!fs.existsSync(mdPath)) return undefined;
  const imagesDir = path.join(path.dirname(txtPath), 'images');
  let imagePaths: string[] = [];
  if (fs.existsSync(imagesDir)) {
    imagePaths = fs
      .readdirSync(imagesDir)
      .filter((name) => /\.(jpe?g|png|gif|webp|bmp)$/i.test(name))
      .map((name) => path.join(imagesDir, name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  const { mediaAssets, manifest } = readNovelMediaAssets(artifact);
  return {
    txtPath,
    mdPath,
    imagePaths,
    mediaAssets,
    manifest,
  };
}

/**
 * Publish a rich novel (markdown + inline images) to TelePress and return the
 * Telegraph URL. Client-side only — TelePress owns rendering/Catbox/Telegraph.
 * 
 * Failures classify as retryable when the endpoint was reached but answered
 * non-2xx (Transient), and non-retryable when local input is unusable.
 */
export async function publishRichNovelPreview(
  artifact: DownloadedArtifact,
  options: RichNovelPublishOptions
): Promise<{ url: string; retryable: boolean; operatorHint?: string }> {
  const sources = findRichNovelSources(artifact);
  if (!sources) return { url: '', retryable: false, operatorHint: 'no_rich_novel_assets' };
  if (sources.imagePaths.length === 0) {
    return { url: '', retryable: false, operatorHint: 'no_rich_novel_assets' };
  }

  const mdName = path.basename(sources.mdPath);
  const boundary = `telepress-${randomUUID()}`;
  const fields: Buffer[] = [];

  // Text part for the markdown file.
  fields.push(Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="md"; filename="${escape(mdName)}"\r\n` +
      `Content-Type: text/markdown\r\n\r\n`
  ));
  fields.push(await fs.promises.readFile(sources.mdPath));
  fields.push(Buffer.from('\r\n'));

  // Optional manifest: lets TelePress rewrite Pixiv CDN sources to the media
  // proxy instead of uploading local files to an image host.
  if (sources.manifest.length) {
    fields.push(Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="manifest"\r\n` +
        `Content-Type: application/json\r\n\r\n`
    ));
    fields.push(Buffer.from(JSON.stringify(sources.manifest)));
    fields.push(Buffer.from('\r\n'));
  }

  // File parts for each inline image, named with the `images/` prefix so the
  // relative markdown refs resolve on the receiving side.
  for (const imagePath of sources.imagePaths) {
    const name = `images/${path.basename(imagePath)}`;
    const stat = await fs.promises.stat(imagePath);
    if (stat.size <= 0) continue;
    const header = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="images"; filename="${escape(name)}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`
    );
    const data = await fs.promises.readFile(imagePath);
    fields.push(header, data, Buffer.from('\r\n'));
  }
  fields.push(Buffer.from(`--${boundary}--\r\n`));

  const timeoutMs = options.timeoutMs ?? 60_000;
  const headers: Record<string, string> = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': String(fields.reduce((n, b) => n + b.length, 0)),
    ...options.headers,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetch(options.url, { method: 'POST', headers, body: Buffer.concat(fields), signal: controller.signal });
    const text = await response.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* plain text */ }
    if (!response.ok) {
      logger.warn('TelePress rich novel publish returned an error status', {
        url: redactUrl(options.url),
        status: response.status,
        body: String(body).slice(0, 300),
      });
      return { url: '', retryable: response.status >= 500 || response.status === 408 || response.status === 429, operatorHint: `telepress_http_${response.status}` };
    }
    const data = (body && typeof body === 'object' ? (body as { url?: unknown }) : undefined);
    const url = typeof data?.url === 'string' ? data.url : '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { url: '', retryable: true, operatorHint: 'telepress_invalid_response' };
    }
    logger.info('TelePress rich novel publish succeeded', {
      url: redactUrl(url),
      images: sources.imagePaths.length,
    });
    return { url, retryable: false };
  } catch (error) {
    const aborted = (error as { name?: string })?.name === 'AbortError';
    logger.warn('TelePress rich novel publish failed', {
      url: redactUrl(options.url),
      retryable: !aborted,
      reason: aborted ? 'timeout' : String(error),
    });
    return { url: '', retryable: !aborted, operatorHint: aborted ? 'telepress_timeout' : 'telepress_network_error' };
  } finally {
    clearTimeout(timer);
  }
}

function escape(value: string): string {
  return value.replace(/[\r\n]/g, ' ').replace(/"/g, '%22');
}
