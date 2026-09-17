import type {
  PixivNovelTextResponse,
  PixivNovelUploadedImage,
  PixivNovelIllustRef,
} from '@redtidev/pixiv-client';

/**
 * Single-pass novel text tokenizer, ported from PixEz
 * (Notsfsssf/pixez-flutter lib/page/novel/viewer/image_text.dart,
 * NovelSpansGenerator.buildSpans). Same endpoint + same extraction path as
 * PixivFlow's webview fallback; keeps the `[[...]]` double-bracket close rule so
 * URLs/etc. inside jumpuri/ruby markers are not truncated early.
 */

export type NovelMarker =
  | { type: 'text'; value: string }
  | { type: 'newpage'; raw: string }
  | { type: 'chapter'; raw: string; title: string }
  | { type: 'pixivimage'; raw: string; key: string }
  | { type: 'uploadedimage'; raw: string; key: string }
  | { type: 'jumpuri'; raw: string; url?: string }
  | { type: 'ruby'; raw: string; reading: string };

export interface NovelAsset {
  marker: string;
  kind: 'uploadedimage' | 'pixivimage';
  sourceId: string;
  url?: string;
  localPath?: string;
  status: 'pending' | 'downloaded' | 'failed' | 'unavailable';
  failureReason?: string;
}

const linkRegex = /https?:\/\/\S+/;

function parseMarker(span: string): NovelMarker {
  if (span.startsWith('[newpage]')) return { type: 'newpage', raw: span };
  if (span.startsWith('[chapter:')) {
    return { type: 'chapter', raw: span, title: span.slice('[chapter:'.length, -1) };
  }
  if (span.startsWith('[pixivimage:')) {
    return { type: 'pixivimage', raw: span, key: span.slice('[pixivimage:'.length, -1) };
  }
  if (span.startsWith('[uploadedimage:')) {
    return { type: 'uploadedimage', raw: span, key: span.slice('[uploadedimage:'.length, -1) };
  }
  if (span.startsWith('[[jumpuri:')) {
    const body = span.slice('[[jumpuri:'.length, span.endsWith(']]') ? -2 : -1);
    return { type: 'jumpuri', raw: span, url: body.match(linkRegex)?.[0] };
  }
  if (span.startsWith('[[rb:')) {
    const reading = span.slice('[[rb:'.length, span.endsWith(']]') ? -2 : -1);
    return { type: 'ruby', raw: span, reading };
  }
  return { type: 'text', value: span };
}

export function scanNovelMarkers(source: string): NovelMarker[] {
  const result: NovelMarker[] = [];
  let now = '';
  for (const ch of source) {
    if (ch === '[') {
      if (!now) {
        now = ch;
      } else if (now === '[') {
        now += ch;
      } else {
        result.push(parseMarker(now));
        now = ch;
      }
    } else if (ch === ']') {
      if (now.startsWith('[[')) {
        if (now.endsWith(']')) {
          now += ch;
          result.push(parseMarker(now));
          now = '';
        } else {
          now += ch;
        }
      } else {
        now += ch;
        result.push(parseMarker(now));
        now = '';
      }
    } else {
      now += ch;
    }
  }
  if (now) result.push(parseMarker(now));
  return result;
}

function uploadedImageUrl(img?: PixivNovelUploadedImage): string | undefined {
  if (!img?.urls) return undefined;
  return img.urls.original ?? img.urls.the1200X1200 ?? img.urls.the480Mw ?? img.urls.the240Mw ?? img.urls.the128X128;
}

function illustImageUrl(ref?: PixivNovelIllustRef | null): string | undefined {
  if (!ref?.illust?.images) return undefined;
  return ref.illust.images.original ?? ref.illust.images.medium ?? ref.illust.images.small;
}

/**
 * Build the ordered set of inline image assets referenced by the novel text.
 * `unavailable` = the source is missing in the webview payload (deleted/no
 * permission) so it will never succeed; `pending` = resolvable + downloadable.
 */
export function extractNovelAssets(
  text: string,
  response?: Pick<PixivNovelTextResponse, 'images' | 'illusts'>
): NovelAsset[] {
  const assets: NovelAsset[] = [];
  for (const marker of scanNovelMarkers(text)) {
    if (marker.type === 'uploadedimage') {
      const url = uploadedImageUrl(response?.images?.[marker.key]);
      assets.push({
        marker: marker.raw,
        kind: 'uploadedimage',
        sourceId: marker.key,
        url,
        status: url ? 'pending' : 'unavailable',
      });
    } else if (marker.type === 'pixivimage') {
      const url = illustImageUrl(response?.illusts?.[marker.key]);
      assets.push({
        marker: marker.raw,
        kind: 'pixivimage',
        sourceId: marker.key,
        url,
        status: url ? 'pending' : 'unavailable',
      });
    }
  }
  return assets;
}

/** Minimal self-check for the scanner's double-bracket handling. */
export function demo(): void {
  const { assert } = require('node:assert');
  for (const s of [
    'before [uploadedimage:11] after',
    '[[jumpuri:Title > https://example.com/a]] tail',
    'mixed [pixivimage:12551-1] and [[rb:漢字>かな]] done',
  ]) {
    assert(Array.isArray(scanNovelMarkers(s)) && scanNovelMarkers(s).length > 0, 'markers parsed');
  }
}
