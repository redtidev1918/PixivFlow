import { type MediaAsset, buildMediaAsset, type PixivMediaKind } from './MediaAsset';

/** Minimal domain work descriptor; does not carry scheduler/delivery state. */
export interface Work {
  id: string;
  type: 'novel' | 'illustration';
  title?: string;
  sourceUrl?: string;
  tags?: string[];
}

/**
 * Result of resolving a work WITHOUT materializing files: the work descriptor
 * plus the canonical media facts consumers may choose to materialize.
 */
export interface ResolvedWork {
  work: Work;
  mediaAssets: MediaAsset[];
}

export interface WorkMediaInput {
  workId: string;
  kind: PixivMediaKind;
  sourceId?: string;
  marker?: string;
  sourceUrl: string;
}

/** Build a ResolvedWork from already-fetched Pixiv detail + inline media refs. */
export function toResolvedWork(
  work: Work,
  mediaInputs: WorkMediaInput[]
): ResolvedWork {
  return {
    work,
    mediaAssets: mediaInputs.map((m) => buildMediaAsset(m)),
  };
}
