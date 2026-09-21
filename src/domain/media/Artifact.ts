/**
 * A materialized file produced for a work.
 *
 * `Artifact` is the file fact (which file, which variant), separate from
 * `MediaAsset` (the media fact). Since 2.45.0 `DownloadedArtifact` only
 * carries `artifacts`; delivery providers receive transport paths derived
 * from these file facts.
 */
export type ArtifactVariant =
  | 'original'
  | 'text'
  | 'markdown'
  | 'zip'
  | 'metadata'
  | 'delivery';

export interface Artifact {
  /** Stable deterministic id, derived from the work + variant, not delivery state. */
  id: string;
  /** When this file is a materialized medium, the source MediaAsset id. */
  sourceAssetId?: string;
  workId: string;
  variant: ArtifactVariant;
  path: string;
  mimeType?: string;
  size?: number;
  checksum?: string;
}

/**
 * Deterministic artifact identity: `pixiv:<workId>:<variant>:<basename>`.
 * The basename may be empty for generated variants; callers should pass a sane
 * label so the id stays unique within a work.
 */
export function artifactId(workId: string, variant: ArtifactVariant, label: string): string {
  const cleanWork = String(workId).trim();
  const cleanLabel = String(label).trim();
  return `pixiv:${cleanWork}:${variant}${cleanLabel ? `:${cleanLabel}` : ''}`;
}
