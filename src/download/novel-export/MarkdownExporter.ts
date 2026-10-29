import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { MediaMaterializer } from '../materialization/MediaMaterializer';
import { NovelBook, NovelDocument, parseNovel, safeLink } from './NovelDocument';
import { xml } from './NovelHtmlRenderer';
import { assertPixivImageUrl, containedPath, readBounded } from './NovelIo';

/**
 * Formal Markdown export (`novelExport.formats: ["md"]`).
 *
 * This is the *reader-facing* export: Pixiv markers are converted to real
 * Markdown structure (headings, links, ruby, page anchors) and inline images
 * resolve to local files so the result reads offline. It is deliberately a
 * different product from the rich-media sidecar (`<novel>.md`, raw markers
 * except image substitution, consumed by TelePress) — different file name
 * (`<base>.novel.md`), different artifact variant (`markdown-export`).
 *
 * Parsing reuses `parseNovel`/`scanNovelMarkers`; no second marker parser.
 */
export const MARKDOWN_RENDERER_VERSION = 1;

/** Relative POSIX reference such as `images/<name>` for an inline image marker. */
export type MarkdownImageRef = string;

export interface MarkdownExport {
  content: string;
  /** Resolved image references in first-occurrence order (fingerprint input). */
  refs: Array<{ doc: string; marker: string; ref: MarkdownImageRef }>;
  /** Non-fatal degradations: the marker stayed as text, the body is intact. */
  warnings: string[];
}

const INLINE_ESCAPES: Record<string, string> = {
  '\\': '\\\\', '`': '\\`', '*': '\\*', '_': '\\_', '[': '\\[', ']': '\\]',
  '<': '\\<', '>': '\\>', '&': '\\&',
};

function escapeInline(value: string): string {
  return value.replace(/[\\`*_[\]<>&]/g, ch => INLINE_ESCAPES[ch]);
}

/** Metadata fields are single-line by contract; collapse stray control breaks. */
function singleLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim();
}

function escapeComment(value: string): string {
  return value.replace(/--+/g, '-').replace(/>/g, '\\>');
}

/**
 * Escape one body line so it can never open a Markdown block construct:
 * headings, lists, blockquotes (any `>`), ordered lists, thematic breaks and
 * setext underlines (`---` / `===`). Emphasis/bracket chars are escaped
 * inline; four-plus leading spaces (indented code) are capped at three.
 */
function escapeLine(value: string): string {
  let line = escapeInline(value);
  if (/^ {4}/.test(line) || line.startsWith('\t')) {
    line = line.replace(/^[\t ]+/, indent => ' '.repeat(Math.min(indent.length, 3)));
  }
  if (
    /^ {0,3}>/.test(line) ||
    /^ {0,3}[#+=-](?:[ \t]|$)/.test(line) ||
    /^ {0,3}\d{1,9}[.)](?:[ \t]|$)/.test(line) ||
    /^ {0,3}(?:[-=][ \t]*)+$/.test(line)
  ) {
    line = line.replace(/^( {0,3})(.)/, '$1\\$2');
  }
  return line;
}

/** Angle-form link destination; encode the few characters that would close it. */
function encodeUrl(url: string): string {
  return url.replace(/[<>\\ \t]/g, ch => ({ '<': '%3C', '>': '%3E', '\\': '%5C', ' ': '%20', '\t': '%09' }[ch]!));
}

interface DocumentMarkdown {
  blocks: string[];
  chapters: Array<{ anchor: string; title: string }>;
}

/**
 * Render one document body. `anchorPrefix` namespaces page/chapter anchors so
 * merged books keep unique ids even with duplicate chapter titles. Inline
 * images resolve through `imageRef`; markers without a local file stay as
 * escaped literal text (traceable, never silently dropped).
 */
function renderDocumentBody(
  doc: NovelDocument,
  anchorPrefix: string,
  chapterLevel: number,
  imageRef: (marker: string) => MarkdownImageRef | undefined
): DocumentMarkdown {
  const nodes = parseNovel(doc.rawText);
  const pageCount = 1 + nodes.filter(n => n.type === 'newpage').length;
  const pageAnchor = (page: number) => `${anchorPrefix}page-${page}`;
  const blocks: string[] = [`<a id="${pageAnchor(1)}"></a>`];
  const chapters: DocumentMarkdown['chapters'] = [];
  let paragraph: string[] = [];
  let page = 1;
  const flush = () => {
    // Backslash hard breaks: CommonMark-standard, survive whitespace-trimming
    // editors, and keep Pixiv's single-newline verse lines on separate rows.
    if (paragraph.length) blocks.push(paragraph.join('\\\n'));
    paragraph = [];
  };
  // Inline nodes continue the current source line; the scanner emits text
  // nodes split around bracket-like markers, so appending (not pushing) keeps
  // `前文[image]后文` on one rendered line, exactly as Pixiv shows it.
  const inline = (markup: string) => {
    if (paragraph.length) paragraph[paragraph.length - 1] += markup;
    else paragraph.push(markup);
  };
  for (const node of nodes) {
    switch (node.type) {
      case 'text': {
        const segments = node.value.replace(/\r\n?/g, '\n').split('\n');
        for (let index = 0; index < segments.length; index++) {
          const segment = segments[index];
          if (index === 0) {
            if (segment !== '') {
              if (paragraph.length) paragraph[paragraph.length - 1] += escapeInline(segment);
              else paragraph.push(escapeLine(segment));
            }
            continue;
          }
          if (segment.trim() === '') { flush(); continue; } // blank source line = paragraph boundary
          paragraph.push(escapeLine(segment));
        }
        break;
      }
      case 'chapter': {
        flush();
        if (!node.title) { blocks.push('<!-- pixiv marker: [chapter:] -->'); break; }
        const anchor = `${anchorPrefix}chapter-${chapters.length + 1}`;
        chapters.push({ anchor, title: node.title });
        blocks.push(`<a id="${anchor}"></a>`);
        blocks.push(`${'#'.repeat(chapterLevel)} ${escapeInline(singleLine(node.title))}`);
        break;
      }
      case 'newpage':
        flush();
        blocks.push('---');
        blocks.push(`<a id="${pageAnchor(++page)}"></a>`);
        break;
      case 'ruby':
        // rp parens are the plain-text degradation for ruby-less renderers.
        inline(`<ruby>${xml(node.base)}<rp>(</rp><rt>${xml(node.reading)}</rt><rp>)</rp></ruby>`);
        break;
      case 'link':
        inline(`[${escapeInline(node.label)}](<${encodeUrl(node.url)}>)`);
        break;
      case 'jump': {
        const raw = `[jump:${node.page}]`;
        inline(node.page >= 1 && node.page <= pageCount ? `[→ ${node.page}](#${pageAnchor(node.page)})` : escapeInline(raw));
        break;
      }
      case 'image': {
        const ref = imageRef(node.marker);
        inline(ref ? `![${escapeInline(node.marker)}](${ref})` : escapeInline(node.marker));
        break;
      }
    }
  }
  flush();
  return { blocks, chapters };
}

export function renderMarkdownBook(
  book: NovelBook,
  resolveRef: (docId: string, marker: string) => MarkdownImageRef | undefined
): string {
  const merged = book.documents.length > 1;
  const first = book.documents[0];
  const out: string[] = [
    `<!-- PixivFlow novel markdown export v${MARKDOWN_RENDERER_VERSION} · work ${escapeComment(book.id)} -->`,
    `# ${escapeInline(singleLine(book.title))}`,
  ];
  const meta: string[] = [];
  if (merged) {
    const authors = [...new Set(book.documents.map(d => singleLine(d.author)).filter(Boolean))];
    if (authors.length) meta.push(`- Author: ${authors.map(a => escapeInline(a)).join(', ')}`);
    meta.push(`- Chapters: ${book.documents.length}`);
  } else if (first.author) {
    meta.push(`- Author: ${escapeInline(singleLine(first.author))}`);
  }
  if (safeLink(first.sourceUrl)) meta.push(`- Source: <${encodeUrl(first.sourceUrl)}>`);
  if (first.publishedAt && Number.isFinite(Date.parse(first.publishedAt))) meta.push(`- Published: ${first.publishedAt}`);
  if (!merged && first.tags.length) meta.push(`- Tags: ${first.tags.map(t => escapeInline(singleLine(t))).join(', ')}`);
  if (meta.length) out.push(meta.join('\n'));

  const rendered = book.documents.map((d, index) =>
    renderDocumentBody(d, merged ? `doc-${index}-` : '', merged ? 3 : 2, marker => resolveRef(d.id, marker))
  );

  if (merged) {
    out.push('## 目录 / Contents');
    out.push(book.documents.map((d, index) => {
      const entry = `- [${index + 1}. ${escapeInline(singleLine(d.title))}](#doc-${index})`;
      const subs = rendered[index].chapters.map(c => `  - [${escapeInline(singleLine(c.title))}](#${c.anchor})`);
      return [entry, ...subs].join('\n');
    }).join('\n'));
  }

  book.documents.forEach((doc, index) => {
    out.push('---');
    if (merged) {
      out.push(`<a id="doc-${index}"></a>`);
      out.push(`## ${index + 1}. ${escapeInline(singleLine(doc.title))}`);
      const chapterMeta: string[] = [];
      if (doc.author) chapterMeta.push(`- Author: ${escapeInline(singleLine(doc.author))}`);
      if (safeLink(doc.sourceUrl)) chapterMeta.push(`- Source: <${encodeUrl(doc.sourceUrl)}>`);
      if (doc.publishedAt && Number.isFinite(Date.parse(doc.publishedAt))) chapterMeta.push(`- Published: ${doc.publishedAt}`);
      if (chapterMeta.length) out.push(chapterMeta.join('\n'));
    }
    out.push(...rendered[index].blocks);
  });
  return out.join('\n\n') + '\n';
}

function sniffImageExt(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('latin1'))) return 'gif';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (bytes.subarray(0, 2).toString('latin1') === 'BM') return 'bmp';
  return undefined;
}

const markerKey = (docId: string, marker: string) => `${docId}\u0000${marker}`;
const toPosix = (value: string) => value.split(sep).join('/');
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function warningCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.split(':')[0];
  return /^NOVEL_[A-Z_]+$/.test(code) ? code : 'NOVEL_IMAGE_DOWNLOAD_FAILED';
}

/** First existing `<sourceId>.<image-ext>` in `directory`, sorted for stability. */
async function preferredExistingName(directory: string, sourceId: string): Promise<string | undefined> {
  try {
    const names = (await fs.readdir(directory)).filter(name => new RegExp(`^${escapeRegExp(sourceId)}\\.(jpe?g|png|gif|webp|bmp)$`, 'i').test(name)).sort();
    return names[0];
  } catch { return undefined; }
}

/**
 * Resolve every inline image of the book to a local file next to `dest`
 * (downloading through `materializer` only when the saved document has no
 * local file), then render the full Markdown document.
 *
 * Contract differences from EPUB/PDF (`prepareImages`):
 *  - images are referenced, not embedded, so the export stays a pair of
 *    `<base>.novel.md` + `images/`;
 *  - a missing/unavailable image never fails the export — the marker stays as
 *    literal text and a warning is reported, so the body is always complete;
 *  - files already inside the export's `images/` directory are referenced in
 *    place; anything else is copied under a content-hash name, so repeated
 *    references and repeated exports are idempotent and never re-download.
 */
export async function writeMarkdownBook(
  book: NovelBook,
  roots: Map<string, string>,
  dest: string,
  materializer?: MediaMaterializer
): Promise<MarkdownExport> {
  const destDir = dirname(resolve(dest));
  const imagesDir = join(destDir, 'images');
  const warnings: string[] = [];
  const refs: MarkdownExport['refs'] = [];
  const byMarker = new Map<string, MarkdownImageRef | undefined>();
  const byRealPath = new Map<string, MarkdownImageRef>();
  const bySourceUrl = new Map<string, MarkdownImageRef>();
  const byHash = new Map<string, MarkdownImageRef>();
  let realImagesDir: string | undefined;

  const ensureImagesDir = async () => {
    await fs.mkdir(imagesDir, { recursive: true });
    realImagesDir ??= await fs.realpath(imagesDir);
    return realImagesDir;
  };

  const refFromRealPath = async (real: string): Promise<MarkdownImageRef> => {
    const cached = byRealPath.get(real);
    if (cached) return cached;
    const images = await ensureImagesDir();
    const within = relative(images, real);
    if (within && !within.startsWith('..') && !isAbsolute(within)) {
      const ref = `images/${toPosix(within)}`;
      byRealPath.set(real, ref);
      return ref;
    }
    const bytes = await readBounded(real, 20 * 1024 * 1024);
    const ext = sniffImageExt(bytes);
    if (!ext) throw new Error('NOVEL_IMAGE_TYPE: not a recognized image payload');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const cachedRef = byHash.get(hash);
    if (cachedRef) { byRealPath.set(real, cachedRef); return cachedRef; }
    const file = join(imagesDir, `${hash}.${ext}`);
    await fs.writeFile(file, bytes, { flag: 'wx' }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
    const ref = `images/${hash}.${ext}`;
    byHash.set(hash, ref);
    byRealPath.set(real, ref);
    return ref;
  };

  const signal = AbortSignal.timeout(120_000);
  for (const doc of book.documents) {
    const root = roots.get(doc.id);
    const markers = [...new Set(parseNovel(doc.rawText).filter(n => n.type === 'image').map(n => n.marker))];
    for (const marker of markers) {
      const media = doc.media.find(m => m.asset.sourceRef?.marker === marker);
      const degrade = (code: string, detail?: string) => {
        warnings.push(detail ? `${code}: ${doc.id} ${marker} (${detail})`.slice(0, 300) : `${code}: ${doc.id} ${marker}`);
        byMarker.set(markerKey(doc.id, marker), undefined);
      };
      if (!media) { degrade('NOVEL_IMAGE_MISSING'); continue; }
      try {
        let ref: MarkdownImageRef | undefined;
        if (media.localPath) {
          if (!root) { degrade('NOVEL_IMAGE_ROOT_MISSING'); continue; }
          let real: string;
          try {
            real = await containedPath(root, resolve(root, media.localPath));
          } catch (error) {
            degrade((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'NOVEL_IMAGE_FILE_MISSING' : 'NOVEL_IMAGE_UNSAFE');
            continue;
          }
          try {
            await fs.access(real);
          } catch {
            degrade('NOVEL_IMAGE_FILE_MISSING');
            continue;
          }
          ref = await refFromRealPath(real);
        } else {
          const url = media.asset.sourceUrl;
          const cached = bySourceUrl.get(url);
          if (cached) {
            ref = cached;
          } else if (!materializer) {
            degrade('NOVEL_IMAGE_UNAVAILABLE', 'no local file and no materializer; export offline first or download with images');
            continue;
          } else {
            assertPixivImageUrl(url);
            const sourceId = media.asset.sourceRef?.sourceId;
            if (!sourceId || !/^[\w-]+$/.test(sourceId)) { degrade('NOVEL_IMAGE_ID_UNSAFE'); continue; }
            await ensureImagesDir();
            const artifact = await materializer.materialize(media.asset, {
              destination: imagesDir, variant: 'original', maxBytes: 20 * 1024 * 1024, rejectRedirects: true, signal,
            });
            // Keep the first deterministic `<sourceId>.<ext>` name across
            // repeated exports (findUniquePath suffixes re-downloads).
            const preferred = await preferredExistingName(imagesDir, sourceId);
            let file = artifact.path;
            if (preferred && resolve(imagesDir, preferred) !== resolve(file)) {
              await fs.rm(file, { force: true });
              file = join(imagesDir, preferred);
            }
            if (root) media.localPath = relative(root, file);
            ref = await refFromRealPath(await fs.realpath(file));
            bySourceUrl.set(url, ref);
          }
        }
        byMarker.set(markerKey(doc.id, marker), ref);
        refs.push({ doc: doc.id, marker, ref });
      } catch (error) {
        degrade(warningCode(error), error instanceof Error ? error.message : String(error));
      }
    }
  }

  const content = renderMarkdownBook(book, (docId, marker) => byMarker.get(markerKey(docId, marker)));
  return { content, refs, warnings };
}
