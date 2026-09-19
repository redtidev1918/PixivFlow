/**
 * A materialized file produced for a work.
 *
 * `Artifact` is the file fact (which file, which variant), separate from
 * `MediaAsset` (the media fact). Legacy `DownloadedArtifact.files[]` remains a
 * compatibility projection until all consumers migrate.
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

/**
 * Legacy projection: old consumers can keep reading `files[]`, which the new
 * canonical list of artifacts backs. Only file-backed variants are projected.
 */
export function projectLegacyFiles(artifacts: Artifact[]): string[] {
  return artifacts
    .filter((a): a is Artifact & { path: string } => Boolean(a && a.path))
    .map((a) => a.path);
}
