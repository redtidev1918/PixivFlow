import { scanNovelMarkers } from '../novelMarkers';
import type { MediaAsset } from '../../domain/media/MediaAsset';

export type NovelNode =
  | { type: 'text'; value: string }
  | { type: 'chapter'; title: string }
  | { type: 'newpage' }
  | { type: 'ruby'; base: string; reading: string }
  | { type: 'link'; label: string; url: string }
  | { type: 'jump'; page: number }
  | { type: 'image'; marker: string };

export interface NovelDocument {
  version: 1;
  id: string;
  title: string;
  author: string;
  sourceUrl: string;
  language: string;
  publishedAt?: string;
  tags: string[];
  series?: { id: string; title: string };
  rawText: string;
  media: Array<{ asset: MediaAsset; localPath?: string }>;
}

export interface NovelBook {
  id: string;
  title: string;
  documents: NovelDocument[];
}

export function parseNovel(source: string): NovelNode[] {
  if (Buffer.byteLength(source, 'utf8') > 8 * 1024 * 1024) throw new Error('NOVEL_TEXT_LIMIT: maximum 8 MiB');
  const result = scanNovelMarkers(source).map((m): NovelNode => {
    switch (m.type) {
      case 'text': return m;
      case 'chapter': return { type: 'chapter', title: m.title };
      case 'newpage': return { type: 'newpage' };
      case 'ruby': {
        const split = m.reading.indexOf('>');
        return split > 0 ? { type: 'ruby', base: m.reading.slice(0, split), reading: m.reading.slice(split + 1) } : { type: 'text', value: m.raw };
      }
      case 'jumpuri': {
        const body = m.raw.slice(10, m.raw.endsWith(']]') ? -2 : -1);
        const split = body.indexOf('>');
        const url = body.slice(split + 1).trim();
        return split >= 0 && safeLink(url) ? { type: 'link', label: body.slice(0, split).trim(), url } : { type: 'text', value: m.raw };
      }
      case 'jump': return { type: 'jump', page: m.page };
      default: return { type: 'image', marker: m.raw };
    }
  });
  if (result.length > 100_000) throw new Error('NOVEL_NODE_LIMIT');
  return result;
}

export function safeLink(value: string): boolean {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}

export function assembleSeries(id: string, title: string, orderedIds: string[], documents: NovelDocument[]): NovelBook {
  if (!/^\d+$/.test(id) || !orderedIds.length || orderedIds.length > 1000 || new Set(orderedIds).size !== orderedIds.length) throw new Error('NOVEL_SERIES_INVALID: invalid or duplicate ordered IDs');
  const byId = new Map(documents.map(d => [d.id, d]));
  if (byId.size !== documents.length) throw new Error('NOVEL_SERIES_INVALID: duplicate documents');
  const missing = orderedIds.filter(key => !byId.has(key));
  if (missing.length) throw new Error(`NOVEL_SERIES_INCOMPLETE: missing chapters ${missing.join(', ')}`);
  const ordered = orderedIds.map(key => byId.get(key)!);
  if (ordered.some(d => d.series?.id !== id)) throw new Error('NOVEL_SERIES_MISMATCH: chapter belongs to another series');
  return { id: `series-${id}`, title, documents: ordered };
}
