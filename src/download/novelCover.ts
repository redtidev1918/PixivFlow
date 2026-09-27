/**
 * Novel cover normalization (§novel-cover).
 *
 * Pixiv exposes the novel cover as `coverUrl` on the webview v2 text response.
 * Novels WITHOUT a custom cover used to return the stock
 * "novel-cover-master-default" placeholder; today Pixiv instead RENDERS a
 * per-novel design (floral / seasonal / genre template with the novel title
 * typeset) and serves it from `novel-cover-master/img/...` with a unique hash,
 * so it is URL-indistinguishable from an author cover. Those design covers are
 * NOT real covers and must never ship as Telegram media, and no API field
 * (app-api `novel/detail`, webview v2) marks them: the one reliable
 * discriminator is the canvas Pixiv renders them on, always exactly 640x900
 * (`PIXIV_DESIGN_COVER_*` below). The normalized model is therefore
 * `string | null`:
 *
 *   real cover             → the Pixiv CDN URL (original size when derivable)
 *   default / design / absent → null
 *
 * Callers cannot tell a design cover from the URL alone, so the fetch-and-check
 * step (`isPixivDesignCoverImage`) lives in the downloader; this module stays a
 * pure URL/bytes helper.
 *
 * The cover rides the canonical MediaAsset contract with a dedicated
 * `novelcover` pixivKind, so consumers (TelePost) can distinguish it from
 * inline body illustrations (`uploadedimage` / `pixivimage`) without any
 * positional guessing.
 */
import { buildMediaAsset, MediaAsset } from '../domain/media/MediaAsset';
import {
  classifyNovelCover,
  PIXIV_GENERATED_COVER_HEIGHT,
  PIXIV_GENERATED_COVER_WIDTH,
} from '../domain/media/NovelCoverPolicy';

const DEFAULT_COVER_PATTERN = /novel-cover-(master-)?default/i;

/** Strip the `/c/<spec>/` resizer segment to recover the original-size URL. */
const RESIZED_COVER_PATTERN = /\/c\/[^/]+\/(novel-cover-master\/)/;

/**
 * Historical names for the generated-cover canvas; the classification and the
 * policy live in `src/domain/media/NovelCoverPolicy.ts` (§media-asset-pipeline).
 */
export const PIXIV_DESIGN_COVER_WIDTH = PIXIV_GENERATED_COVER_WIDTH;
export const PIXIV_DESIGN_COVER_HEIGHT = PIXIV_GENERATED_COVER_HEIGHT;

/**
 * True when the fetched cover bytes are one of Pixiv's generated designs.
 * Unknown formats / unreadable payloads return false — this predicate is the
 * raw classification only; whether an unclassifiable cover is delivered is the
 * caller's policy (`coverDeliveryDecision`, default: skipped).
 */
export function isPixivDesignCoverImage(
  cover: ArrayBuffer | Uint8Array | null | undefined
): boolean {
  return classifyNovelCover(cover) === 'pixiv_generated';
}

export function normalizeNovelCoverUrl(coverUrl?: string | null): string | null {
  const url = typeof coverUrl === 'string' ? coverUrl.trim() : '';
  if (!url) return null;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
  if (DEFAULT_COVER_PATTERN.test(url)) return null;
  return url.replace(RESIZED_COVER_PATTERN, '/$1');
}

export function novelCoverAsset(workId: string, coverUrl: string): MediaAsset {
  return buildMediaAsset({ workId, kind: 'novelcover', sourceUrl: coverUrl });
}
