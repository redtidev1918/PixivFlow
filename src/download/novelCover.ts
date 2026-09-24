/**
 * Novel cover normalization (§novel-cover).
 *
 * Pixiv exposes the novel cover as `coverUrl` on the webview v2 text response.
 * Novels WITHOUT a custom cover return the stock "novel-cover-master-default"
 * placeholder — that is NOT a real cover and must never ship as Telegram
 * media. The normalized model is therefore `string | null`:
 *
 *   real cover       → the Pixiv CDN URL (original size when derivable)
 *   default / absent → null
 *
 * The cover rides the canonical MediaAsset contract with a dedicated
 * `novelcover` pixivKind, so consumers (TelePost) can distinguish it from
 * inline body illustrations (`uploadedimage` / `pixivimage`) without any
 * positional guessing.
 */
import { buildMediaAsset, MediaAsset } from '../domain/media/MediaAsset';

const DEFAULT_COVER_PATTERN = /novel-cover-(master-)?default/i;

/** Strip the `/c/<spec>/` resizer segment to recover the original-size URL. */
const RESIZED_COVER_PATTERN = /\/c\/[^/]+\/(novel-cover-master\/)/;

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
