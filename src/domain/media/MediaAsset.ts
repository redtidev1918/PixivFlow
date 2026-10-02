/**
 * Canonical media reference for a download work.
 *
 * `MediaAsset` is the media fact (remote source + stable identity). It is NOT a
 * local file: consumers decide whether / when to materialize it. The legacy
 * file-only projection has been removed; materialized files live in
 * `DownloadedArtifact.artifacts`, and `artifactId` here is optional on
 * purpose (referenced media may still be unmaterialized).
 */
export type PixivMediaKind = 'uploadedimage' | 'pixivimage' | 'illust' | 'novelcover';

/**
 * Default (and production) namespace prefix of media-asset ids: `pixiv`.
 * `pixiv:` asset ids stay valid forever — consumers (TelePost) treat the
 * prefix as opaque; a second source may adopt its own namespace via
 * `download.assetNamespace` in the config without any consumer change.
 */
export const DEFAULT_MEDIA_ASSET_NAMESPACE = 'pixiv';

const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

let assetNamespace = DEFAULT_MEDIA_ASSET_NAMESPACE;

/**
 * Configure the media-asset id namespace for this process. Called once from
 * the config loader (`download.assetNamespace`); invalid/empty values fall
 * back to the default so existing `pixiv:` ids never break.
 */
export function configureMediaAssetNamespace(namespace?: string): void {
  const clean = String(namespace ?? '').trim().toLowerCase();
  assetNamespace = NAMESPACE_PATTERN.test(clean) ? clean : DEFAULT_MEDIA_ASSET_NAMESPACE;
}

/** Current media-asset id namespace (default `pixiv`). */
export function getMediaAssetNamespace(): string {
  return assetNamespace;
}

export interface MediaSourceRef {
  /** Pixiv work id, e.g. the novel/illust id. */
  workId: string;
  /** Pixiv-side image identifier (illust page / uploaded image id). */
  sourceId?: string;
  /** Original in-text marker, when known. */
  marker?: string;
  /** Pixiv-specific media subtype (uploadedimage vs pixivimage vs illust). */
  pixivKind?: PixivMediaKind;
}

export interface MediaAsset {
  /** Stable deterministic id, independent of any consumer/delivery system. */
  id: string;
  source: 'pixiv';
  kind: 'image';
  sourceUrl: string;

  mimeType?: string;
  width?: number;
  height?: number;
  page?: number;
  /** Optional materialized file reference; never required. */
  artifactId?: string;

  sourceRef?: MediaSourceRef;
}

/**
 * Deterministic stable identity: `<namespace>:<workId>:<pixivKind>[:<sourceId>]`
 * where `namespace` defaults to the configured asset namespace (`pixiv`).
 * Never carries Telegram/thelegraph/catbox ids.
 */
export function mediaAssetId(
  workId: string,
  pixivKind: PixivMediaKind,
  sourceId?: string,
  namespace?: string,
): string {
  const cleanWork = String(workId).trim();
  const cleanKind = String(pixivKind).trim();
  const cleanSource = sourceId ? String(sourceId).trim() : '';
  const ns = String(namespace ?? assetNamespace).trim() || DEFAULT_MEDIA_ASSET_NAMESPACE;
  return `${ns}:${cleanWork}:${cleanKind}${cleanSource ? `:${cleanSource}` : ''}`;
}

export interface MediaAssetInput {
  workId: string;
  kind: PixivMediaKind;
  sourceId?: string;
  marker?: string;
  sourceUrl: string;
  artifactId?: string;
}

/** Build a canonical MediaAsset from a resolved Pixiv media reference. */
export function buildMediaAsset(input: MediaAssetInput): MediaAsset {
  return {
    id: mediaAssetId(input.workId, input.kind, input.sourceId),
    source: 'pixiv',
    kind: 'image',
    sourceUrl: input.sourceUrl,
    artifactId: input.artifactId,
    sourceRef: {
      workId: input.workId,
      sourceId: input.sourceId,
      marker: input.marker,
      pixivKind: input.kind,
    },
  };
}
