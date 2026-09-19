/**
 * Canonical media reference for a download work.
 *
 * `MediaAsset` is the media fact (remote source + stable identity). It is NOT a
 * local file: consumers decide whether / when to materialize it. The legacy
 * `DownloadedArtifact.files[]` compatibility projection stays in place until all
 * consumers migrate.
 */
export type PixivMediaKind = 'uploadedimage' | 'pixivimage' | 'illust';

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
 * Deterministic stable identity: `pixiv:<workId>:<pixivKind>[:<sourceId>]`.
 * Never carries Telegram/thelegraph/catbox ids.
 */
export function mediaAssetId(workId: string, pixivKind: PixivMediaKind, sourceId?: string): string {
  const cleanWork = String(workId).trim();
  const cleanKind = String(pixivKind).trim();
  const cleanSource = sourceId ? String(sourceId).trim() : '';
  return `pixiv:${cleanWork}:${cleanKind}${cleanSource ? `:${cleanSource}` : ''}`;
}
