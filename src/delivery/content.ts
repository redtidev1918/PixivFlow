import { statSync } from 'node:fs';
import * as path from 'node:path';
import type { TargetCapabilities } from './capabilities';
import type { MediaAsset } from '../domain/media/MediaAsset';
import type { Artifact } from '../domain/media/Artifact';
import type { DeliveryContext, DeliveryRequest } from './types';

/**
 * The platform-agnostic representation of what is being delivered.
 *
 * Delivery providers convert THIS into their platform's wire format; nothing
 * below this line may read the downloader's internal structures. The vocabulary
 * is intentionally small — text, image, file, video and album — because those
 * are the five things the target platforms model. A provider that supports
 * `text` but not `album` renders the same Content as separate messages; the
 * decision belongs to the adapter, the content model stays neutral.
 */
export interface ContentTextPart {
  kind: 'text';
  text: string;
}

/**
 * One media reference, which may point anywhere.
 *
 * `mime` is inferred from the file extension when no canonical fact exists, so
 * a `.jpg` that is really a PNG is carried as `image/jpeg`; adapters that care
 * should sniff the bytes rather than trust the label.
 */
export interface ContentMedia {
  /** Local absolute path PixivFlow materialized — always present. */
  path: string;
  mime: string;
  /** Size in bytes when a canonical fact or a local stat could supply it. */
  size?: number;
  /** Pixiv low-resolution companion preview for this file, when one exists. */
  previewPath?: string;
  /** Remote source URL from the canonical MediaAsset, when known. */
  sourceUrl?: string;
  /** Canonical `pixiv:<workId>:<variant>:<label>` artifact id, when known. */
  assetId?: string;
}

export interface ContentImagePart {
  kind: 'image';
  media: ContentMedia;
}

export interface ContentFilePart {
  kind: 'file';
  media: ContentMedia;
}

export interface ContentVideoPart {
  kind: 'video';
  media: ContentMedia;
}

export interface ContentAlbumPart {
  kind: 'album';
  /** Album members, in delivery order — only images and videos. */
  items: ContentImagePart[] | ContentVideoPart[];
}

export type ContentPart =
  | ContentTextPart
  | ContentImagePart
  | ContentFilePart
  | ContentVideoPart
  | ContentAlbumPart;

/**
 * What is delivered: the text body plus every local media file, already
 * resolved by the delivery service.
 *
 * Always built from `deliveryFilePaths` output (never re-derived from raw
 * artifacts), so the "metadata/markdown/preview files are never attachments"
 * rule keeps holding no matter who constructs Content.
 */
export interface Content {
  /** Human-facing text body. Adapters must respect `maxTextLength`. */
  text: string;
  parts: ContentPart[];
  /** The Pixiv work this content belongs to (audit / correlation only). */
  workId: string;
  workType: string;
  /** Canonical Pixiv permalink. */
  sourceUrl: string;
  title: string;
  /** R-18 works: adapters may hide behind a spoiler/mask. */
  spoiler?: boolean;
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.tif', '.tiff']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v']);

const EXTENSION_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/x-m4v',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.zip': 'application/zip',
  '.json': 'application/json',
};

/** Media kind of one local file, decided by extension (lowercased, never guessed from content). */
export type ContentMediaKind = 'image' | 'video' | 'file';

export function classifyMediaPath(filePath: string): ContentMediaKind {
  const extension = path.extname(filePath.trim()).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return 'file';
}

export function mimeTypeForPath(filePath: string): string {
  return EXTENSION_MIME[path.extname(filePath.trim()).toLowerCase()] ?? 'application/octet-stream';
}

/** Pixiv permalink; novels and illustrations live on different paths. */
export function pixivSourceUrl(pixivId: string, type: string): string {
  return type === 'novel'
    ? `https://www.pixiv.net/novel/show.php?id=${pixivId}`
    : `https://www.pixiv.net/artworks/${pixivId}`;
}

/** Deterministic default text body: the work title plus its canonical link. */
export function defaultContentText(title: string, type: string, pixivId: string): string {
  const link = pixivSourceUrl(pixivId, type);
  return title?.trim() ? `${title.trim()}\n${link}` : link;
}

/** Best-effort local byte size; a missing file simply reports no size. */
function statSize(filePath: string): number | undefined {
  try {
    const stat = statSync(filePath);
    return stat.isFile() ? stat.size : undefined;
  } catch {
    return undefined;
  }
}

export interface BuildContentInput {
  /** The route/work context frozen at enqueue time. */
  context: Pick<DeliveryContext, 'pixivId' | 'type' | 'title' | 'spoiler'>;
  /** Transport paths to deliver, in order (from `deliveryFilePaths`). */
  files: string[];
  /** Per-file previews aligned with `files`; ignored when lengths differ. */
  previewFiles?: string[];
  /** Canonical media facts (remote source, stable id) for the delivered files. */
  mediaAssets?: MediaAsset[];
  /** Canonical file facts, when the enqueue site has them. */
  artifactFacts?: Artifact[];
  /** Explicit caption override; falls back to title + canonical link. */
  caption?: string;
}

/**
 * Build the neutral content model from resolved delivery facts.
 *
 * Media comes from the ALREADY-RESOLVED `files` (with `previewFiles` aligned
 * one-to-one); canonical facts only contribute metadata. A single image or
 * video stays a standalone part — an album of one is not worth a separate
 * message, matching Telegram's `sendMediaGroup` minimum of two items.
 */
export function buildContent(input: BuildContentInput): Content {
  const previews = input.previewFiles ?? [];
  const previewAligned = previews.length === input.files.length ? previews : [];
  const factByPath = new Map((input.artifactFacts ?? []).map((fact) => [fact.path, fact] as const));
  const assetByPath = new Map(
    (input.mediaAssets ?? [])
      .filter((asset) => Boolean(asset.artifactId))
      .map((asset) => [asset.artifactId as string, asset] as const)
  );

  const media: ContentMedia[] = input.files.map((file, index) => {
    const fact = factByPath.get(file);
    const asset = assetByPath.get(file);
    const size = fact?.size ?? statSize(file);
    return {
      path: file,
      mime: fact?.mimeType?.trim() || mimeTypeForPath(file),
      ...(size !== undefined ? { size } : {}),
      ...(previewAligned[index] ? { previewPath: previewAligned[index] } : {}),
      ...(asset?.sourceUrl ? { sourceUrl: asset.sourceUrl } : {}),
      ...(fact?.id ? { assetId: fact.id } : {}),
    };
  });

  const images: ContentImagePart[] = [];
  const videos: ContentVideoPart[] = [];
  const others: ContentFilePart[] = [];
  for (const item of media) {
    switch (classifyMediaPath(item.path)) {
      case 'image':
        images.push({ kind: 'image', media: item });
        break;
      case 'video':
        videos.push({ kind: 'video', media: item });
        break;
      default:
        others.push({ kind: 'file', media: item });
    }
  }

  const { pixivId, type, title } = input.context;
  const text = input.caption?.trim()
    ? input.caption.trim()
    : defaultContentText(title, type, pixivId);
  const parts: ContentPart[] = [{ kind: 'text', text }];
  // Files first, then the visual gallery: a caption rendered on the first image
  // of an album must describe that album, not an unrelated zip attachment.
  parts.push(...others);
  if (images.length + videos.length === 1) {
    const single: ContentImagePart | ContentVideoPart | undefined = images[0] ?? videos[0];
    if (single) parts.push(single);
  } else if (images.length > 0 && videos.length === 0) {
    parts.push({ kind: 'album', items: images });
  } else if (videos.length > 0 && images.length === 0) {
    parts.push({ kind: 'album', items: videos });
  } else if (images.length > 0 || videos.length > 0) {
    // Mixed kinds cannot share one platform album (Telegram forbids grouping
    // documents/audio with media; Feishu `post` carries images only). Emit the
    // images as one album and each video as its own part; adapters whose album
    // range does not fit degrade it further via `planDelivery`.
    if (images.length > 0) parts.push({ kind: 'album', items: images });
    parts.push(...videos);
  }

  return {
    text,
    parts,
    workId: pixivId,
    workType: type,
    sourceUrl: pixivSourceUrl(pixivId, type),
    title,
    ...(input.context.spoiler !== undefined ? { spoiler: input.context.spoiler } : {}),
  };
}

/** Build Content straight from a delivery request (the adapter-facing helper). */
export function contentFromRequest(request: DeliveryRequest): Content {
  if (request.content) return request.content;
  return buildContent({
    context: request.context,
    files: request.files,
    previewFiles: request.previewFiles,
    mediaAssets: request.mediaAssets,
    caption: request.caption,
  });
}

/** The text body of a content model (always the first `text` part, may be empty). */
export function contentText(content: Content): string {
  const part = content.parts.find((item): item is ContentTextPart => item.kind === 'text');
  return part?.text ?? content.text;
}

/** Reason a part could not be carried by a target. */
export type ContentDowngradeReason =
  | 'album_not_supported'
  | 'image_not_supported'
  | 'file_not_supported'
  | 'video_not_supported';

/** One adaptation the delivery plan had to make for the target's capabilities. */
export interface ContentDowngrade {
  reason: ContentDowngradeReason;
  /** How many original media items this downgrade covers. */
  count: number;
}

/** A target-ready delivery plan: parts plus every adaptation that was needed. */
export interface DeliveryPlan {
  capabilities: TargetCapabilities;
  /** Parts the target can carry, in order. */
  parts: ContentPart[];
  /** Adaptations applied (album split into single messages, ...). */
  downgrades: ContentDowngrade[];
  /** Media the target cannot carry at all; the adapter reports them, never drops them silently. */
  unsupported: ContentMedia[];
}

export interface PlanDeliveryOptions {
  capabilities: TargetCapabilities;
}

/**
 * Adapt a Content model to a target's capabilities.
 *
 * Rules:
 *  - text: kept only when the target supports text. Truncation/splitting is the
 *    adapter's business (it knows its own message limits), never silent here.
 *  - album: kept when supported; otherwise expanded into its individual parts
 *    and recorded as a downgrade, so the images still arrive.
 *  - image/file/video: kept when supported; otherwise moved to `unsupported`
 *    so the adapter (and the event log) can report the loss.
 */
export function planDelivery(content: Content, options: PlanDeliveryOptions): DeliveryPlan {
  const capabilities = options.capabilities;
  const supported = new Set(capabilities.supported);
  const parts: ContentPart[] = [];
  const downgrades: ContentDowngrade[] = [];
  const unsupported: ContentMedia[] = [];

  for (const part of content.parts) {
    switch (part.kind) {
      case 'text': {
        if (supported.has('text') && part.text.trim()) parts.push(part);
        break;
      }
      case 'album': {
        const members = part.items;
        const albumMax = capabilities.album?.max ?? 0;
        const canAlbum =
          supported.has('album') &&
          albumMax > 0 &&
          members.length >= (capabilities.album?.min ?? 2) &&
          members.length <= albumMax;
        if (canAlbum) {
          parts.push(part);
          break;
        }
        for (const item of members) {
          if (supported.has(item.kind)) {
            parts.push(item);
          } else {
            unsupported.push(item.media);
          }
        }
        // Only a capability mismatch is a downgrade; an over-large album is the
        // adapter's chunking job, not a capability gap.
        if (!supported.has('album') && members.length > 0) {
          downgrades.push({ reason: 'album_not_supported', count: members.length });
        }
        break;
      }
      case 'image':
      case 'file':
      case 'video': {
        if (supported.has(part.kind)) {
          parts.push(part);
        } else {
          unsupported.push(part.media);
        }
        break;
      }
    }
  }

  if (unsupported.length > 0) {
    const counts: Record<'image' | 'file' | 'video', number> = { image: 0, file: 0, video: 0 };
    for (const item of unsupported) counts[classifyMediaPath(item.path)] += 1;
    for (const kind of ['image', 'file', 'video'] as const) {
      if (counts[kind] > 0) downgrades.push({ reason: `${kind}_not_supported`, count: counts[kind] });
    }
  }

  return { capabilities, parts, downgrades, unsupported };
}

/** Build then adapt in one call — the shape a future adapter will use. */
export function buildDeliveryPlan(
  request: DeliveryRequest,
  capabilities: TargetCapabilities
): DeliveryPlan {
  return planDelivery(contentFromRequest(request), { capabilities });
}

/** The resolved media of a plan, in order (albums flattened). */
export function planMedia(plan: DeliveryPlan): ContentMedia[] {
  const media: ContentMedia[] = [];
  for (const part of plan.parts) {
    if (part.kind === 'album') {
      for (const item of part.items) media.push(item.media);
    } else if (part.kind !== 'text') {
      media.push(part.media);
    }
  }
  return media;
}
