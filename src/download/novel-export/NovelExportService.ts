import { promises as fs } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { buildMediaAsset } from '../../domain/media/MediaAsset';
import { readImageDimensions } from '../../utils/imageDimensions';
import { createHash, randomUUID } from 'node:crypto';
import { artifactId, Artifact } from '../../domain/media/Artifact';
import type { MediaMaterializer } from '../materialization/MediaMaterializer';
import { NovelBook, NovelDocument, parseNovel, assembleSeries } from './NovelDocument';
import { BookImage, imageKey, writeEpub } from './EpubExporter';
import { PdfOptions, writePdf } from './PdfExporter';
import { MARKDOWN_RENDERER_VERSION, writeMarkdownBook } from './MarkdownExporter';
import { assertPixivImageUrl, atomicJson, containedPath, readBounded } from './NovelIo';

// Shared IO primitives live in NovelIo (leaf module); re-exported here so the
// historical NovelExportService import surface keeps working.
export { assertPixivImageUrl, atomicJson, containedPath, readBounded } from './NovelIo';

export type NovelExportFormat = 'txt' | 'md' | 'epub' | 'pdf';
export interface NovelExportOptions { formats?: Array<NovelExportFormat>; mergeSeries?: boolean; pdf?: PdfOptions }
export interface ExportResult {
  artifacts: Artifact[];
  errors: Array<{ format: string; code: string; message: string }>;
  /** Non-fatal degradations (e.g. Markdown kept an unavailable image marker). */
  warnings?: string[];
}
export interface SeriesManifest { version: 1; seriesId: string; title: string; orderedIds: string[]; metadataPaths: string[] }

export function validateNovelExport(value: unknown): asserts value is NovelExportOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('novelExport must be an object');
  const v = value as NovelExportOptions;
  if (v.formats !== undefined && (!Array.isArray(v.formats) || !v.formats.length || v.formats.some(f => !['txt', 'md', 'epub', 'pdf'].includes(f)))) throw new Error('novelExport.formats must contain txt, md, epub or pdf');
  if (v.mergeSeries !== undefined && typeof v.mergeSeries !== 'boolean') throw new Error('novelExport.mergeSeries must be boolean');
  if (v.pdf !== undefined) {
    if (!v.pdf || typeof v.pdf !== 'object') throw new Error('novelExport.pdf must be an object');
    for (const key of ['browserPath', 'fontPath'] as const) if (v.pdf[key] !== undefined && (typeof v.pdf[key] !== 'string' || !isAbsolute(v.pdf[key]!))) throw new Error(`novelExport.pdf.${key} must be an absolute path`);
    if (v.pdf.timeoutMs !== undefined && (!Number.isInteger(v.pdf.timeoutMs) || v.pdf.timeoutMs < 1000 || v.pdf.timeoutMs > 120_000)) throw new Error('novelExport.pdf.timeoutMs must be 1000..120000');
  }
}

function imageType(bytes: Buffer): { mime: string; ext: string } {
  const size = readImageDimensions(bytes);
  if (!size || size.width <= 0 || size.height <= 0 || size.width * size.height > 40_000_000) throw new Error('NOVEL_IMAGE_TYPE: invalid image dimensions or more than 40 megapixels');
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return { mime: 'image/png', ext: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) return { mime: 'image/gif', ext: 'gif' };
  throw new Error('NOVEL_IMAGE_TYPE: EPUB images must be PNG, JPEG or GIF; HTML/SVG/WebP are not silently embedded');
}

export async function prepareImages(book: NovelBook, roots: Map<string, string>, materializer?: MediaMaterializer, seeds = new Map<string, Buffer>()): Promise<BookImage[]> {
  const signal = AbortSignal.timeout(120_000);
  const images: BookImage[] = [];
  const cached = new Map<string, BookImage>();
  let total = 0;
  for (const doc of book.documents) {
    const markers = [...new Set(parseNovel(doc.rawText).filter(n => n.type === 'image').map(n => n.marker))];
    if (doc.media.some(m => m.asset.sourceRef?.pixivKind === 'novelcover')) markers.push('cover');
    for (const marker of markers) {
      signal.throwIfAborted();
      if (images.length >= 500) throw new Error('NOVEL_IMAGE_LIMIT: maximum 500 images');
      const ref = doc.media.find(m => marker === 'cover' ? m.asset.sourceRef?.pixivKind === 'novelcover' : m.asset.sourceRef?.marker === marker);
      if (!ref) throw new Error(`NOVEL_IMAGE_MISSING: ${doc.id} ${marker}`);
      const root = roots.get(doc.id)!;
      let bytes: Buffer;
      const cachedImage = cached.get(ref.asset.sourceUrl);
      if (cachedImage) { images.push({ ...cachedImage, key: imageKey(doc.id, marker) }); continue; }
      const seeded = seeds.get(ref.asset.sourceUrl);
      if (seeded) bytes = seeded;
      else {
        if (!ref.localPath) {
          if (!materializer) throw new Error(`NOVEL_IMAGE_UNAVAILABLE: ${doc.id} ${marker}; download/materialize images before offline export`);
          assertPixivImageUrl(ref.asset.sourceUrl);
          const sourceId = ref.asset.sourceRef?.sourceId;
          if (sourceId && !/^[\w-]+$/.test(sourceId)) throw new Error('NOVEL_IMAGE_ID_UNSAFE');
          const directory = join(root, 'images'); await fs.mkdir(directory, { recursive: true });
          await containedPath(root, directory);
          const artifact = await materializer.materialize(ref.asset, { destination: directory, variant: 'original', maxBytes: 20 * 1024 * 1024, rejectRedirects: true, signal });
          ref.localPath = relative(root, artifact.path);
        }
        bytes = await readBounded(await containedPath(root, ref.localPath), 20 * 1024 * 1024);
      }
      if (bytes.length > 20 * 1024 * 1024) throw new Error('NOVEL_IMAGE_LIMIT: maximum 20 MiB per image');
      total += bytes.length;
      if (total > 100 * 1024 * 1024) throw new Error('NOVEL_IMAGE_LIMIT: maximum 100 MiB of image bytes');
      const type = imageType(bytes);
      const hash = createHash('sha256').update(bytes).digest('hex');
      const image = { key: imageKey(doc.id, marker), name: `images/${hash}.${type.ext}`, mime: type.mime, bytes };
      images.push(image); cached.set(ref.asset.sourceUrl, image);
      // Persist cover probe bytes as well, so a later export needs no network.
      if (seeded && !ref.localPath) {
        const directory = join(root, 'images'); await fs.mkdir(directory, { recursive: true });
        await containedPath(root, directory);
        const file = join(directory, `${hash}.${type.ext}`);
        await fs.writeFile(file, bytes, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
        ref.localPath = relative(root, file);
      }
    }
  }
  return images;
}

export async function exportBook(book: NovelBook, roots: Map<string, string>, outputBase: string, options: NovelExportOptions, materializer?: MediaMaterializer, seeds?: Map<string, Buffer>): Promise<ExportResult> {
  validateNovelExport(options);
  if (!book.documents.length || book.documents.length > 1000) throw new Error('NOVEL_BOOK_LIMIT');
  if (book.documents.reduce((size, d) => size + Buffer.byteLength(d.rawText), 0) > 8 * 1024 * 1024) throw new Error('NOVEL_TEXT_LIMIT: maximum 8 MiB per book');
  const result: ExportResult = { artifacts: [], errors: [] };
  const formats = [...new Set(options.formats ?? ['epub'] as const)].filter((f): f is 'md' | 'epub' | 'pdf' => f !== 'txt');
  if (!formats.length) return result;
  let images: BookImage[] | undefined;
  let markdown: Awaited<ReturnType<typeof writeMarkdownBook>> | undefined;
  for (const format of formats) {
    // `.novel.md` never collides with the rich-media sidecar (`<base>.md`),
    // which TelePress consumes with raw-marker semantics.
    const dest = resolve(format === 'md' ? `${outputBase}.novel.md` : `${outputBase}.${format}`);
    const lockPath = `${dest}.lock`;
    const temp = `${dest}.${randomUUID()}.tmp`;
    let lock: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      await fs.mkdir(dirname(dest), { recursive: true });
      try { lock = await fs.open(lockPath, 'wx'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('NOVEL_EXPORT_BUSY: output is locked by another export'); throw error; }
      await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
      let fingerprint: string;
      if (format === 'md') {
        markdown ??= await writeMarkdownBook(book, roots, dest, materializer);
        fingerprint = createHash('sha256').update(JSON.stringify({ renderer: MARKDOWN_RENDERER_VERSION, book, format, refs: markdown.refs })).digest('hex');
      } else {
        images ??= await prepareImages(book, roots, materializer, seeds);
        fingerprint = createHash('sha256').update(JSON.stringify({ renderer: 1, book, format, pdf: options.pdf, images: images.map(i => i.name) })).digest('hex');
      }
      const receipt = `${dest}.export.json`;
      let cached = false;
      try {
        const prior = JSON.parse((await readBounded(receipt, 4096)).toString());
        const bytes = await readBounded(dest, 150 * 1024 * 1024);
        cached = prior.fingerprint === fingerprint && prior.checksum === createHash('sha256').update(bytes).digest('hex');
      } catch { /* No usable cached artifact. */ }
      if (!cached) {
        if (format === 'md' && markdown) await fs.writeFile(temp, markdown.content, 'utf-8');
        else if (format === 'epub' && images) await writeEpub(book, images, temp);
        else if (images) await writePdf(book, images, temp, options.pdf ?? {});
        const bytes = await readBounded(temp, 150 * 1024 * 1024);
        const checksum = createHash('sha256').update(bytes).digest('hex');
        await fs.rename(temp, dest);
        await atomicJson(receipt, { fingerprint, checksum });
      }
      if (format === 'md' && markdown?.warnings.length) result.warnings = [...(result.warnings ?? []), ...markdown.warnings];
      const variant: Artifact['variant'] = format === 'md' ? 'markdown-export' : format;
      const stat = await fs.stat(dest);
      result.artifacts.push({
        id: artifactId(book.id, variant, basename(dest)), workId: book.id,
        variant,
        path: dest,
        mimeType: format === 'md' ? 'text/markdown' : format === 'epub' ? 'application/epub+zip' : 'application/pdf',
        size: stat.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ format, code: message.split(':')[0], message });
    } finally {
      await fs.rm(temp, { force: true });
      if (lock) { await lock.close(); await fs.rm(lockPath, { force: true }); }
    }
  }
  return result;
}

export async function loadNovelDocument(metadataPath: string, legacyTextPath?: string): Promise<NovelDocument> {
  const value = JSON.parse((await readBounded(metadataPath, 16 * 1024 * 1024)).toString('utf8'));
  let d = value.novel_document as NovelDocument;
  if (!d && value.type === 'novel' && /^\d+$/.test(String(value.pixiv_id)) && (legacyTextPath || /\.txt\.json$/i.test(metadataPath))) {
    const original = (await readBounded(legacyTextPath ?? metadataPath.slice(0, -5), 8 * 1024 * 1024)).toString('utf8');
    const separator = /\r?\n---\r?\n\r?\n/.exec(original);
    if (!separator) throw new Error('NOVEL_LEGACY_HEADER: cannot locate original Pixiv text');
    const id = String(value.pixiv_id);
    const media: NovelDocument['media'] = (value.assets ?? []).map((a: { kind: 'uploadedimage' | 'pixivimage'; sourceId: string; marker: string; url?: string; localPath?: string }) => ({
      asset: buildMediaAsset({ workId: id, kind: a.kind, sourceId: a.sourceId, marker: a.marker, sourceUrl: a.url ?? '' }), localPath: a.localPath,
    }));
    if (value.cover_url) media.push({ asset: buildMediaAsset({ workId: id, kind: 'novelcover', sourceUrl: value.cover_url }) });
    d = { version: 1, id, title: value.title, author: value.author?.name ?? 'Unknown', sourceUrl: value.original_url,
      language: value.detected_language?.code ?? 'und', publishedAt: value.create_date,
      tags: (value.tags ?? []).map((t: { name: string }) => t.name), rawText: original.slice(separator.index + separator[0].length), media };
  }
  if (!d || d.version !== 1 || !/^\d+$/.test(d.id) || typeof d.rawText !== 'string' || typeof d.title !== 'string' || typeof d.author !== 'string' || typeof d.sourceUrl !== 'string' || typeof d.language !== 'string' || !Array.isArray(d.tags) || !d.tags.every(t => typeof t === 'string') || !Array.isArray(d.media)) throw new Error('NOVEL_DOCUMENT_MISSING: expected PixivFlow novel metadata with novel_document; legacy TXT must first be downloaded with this version');
  parseNovel(d.rawText);
  if (d.media.length > 500 || d.media.some(m => !m?.asset || typeof m.asset.sourceUrl !== 'string' || (m.localPath !== undefined && typeof m.localPath !== 'string'))) throw new Error('NOVEL_DOCUMENT_INVALID: invalid media');
  return d;
}

export async function exportSavedNovel(input: string, options: NovelExportOptions, outputBase?: string, metadataPath?: string): Promise<ExportResult> {
  input = resolve(input);
  if (metadataPath) {
    if (!/\.txt$/i.test(input)) throw new Error('NOVEL_INPUT_INVALID: --metadata requires --input original.txt');
    const doc = await loadNovelDocument(resolve(metadataPath), input);
    return exportBook({ id: doc.id, title: doc.title, documents: [doc] }, new Map([[doc.id, dirname(input)]]), outputBase ?? input.slice(0, -4), options);
  }
  if (input.endsWith('.series.json')) {
    const manifest = JSON.parse((await readBounded(input, 1024 * 1024)).toString()) as SeriesManifest;
    if (manifest.version !== 1 || !Array.isArray(manifest.metadataPaths) || !Array.isArray(manifest.orderedIds) || manifest.metadataPaths.length > 1000) throw new Error('NOVEL_SERIES_INVALID');
    const docs: NovelDocument[] = []; const roots = new Map<string, string>();
    for (const candidate of manifest.metadataPaths) {
      const file = await containedPath(dirname(input), candidate);
      const doc = await loadNovelDocument(file); docs.push(doc); roots.set(doc.id, dirname(file));
    }
    return exportBook(assembleSeries(manifest.seriesId, manifest.title, manifest.orderedIds, docs), roots, outputBase ?? input.slice(0, -12), options);
  }
  if (/\.txt$/i.test(input)) {
    try { await fs.access(`${input}.novel.json`); input += '.novel.json'; }
    catch { input += '.json'; }
  }
  const doc = await loadNovelDocument(input);
  return exportBook({ id: doc.id, title: doc.title, documents: [doc] }, new Map([[doc.id, dirname(input)]]), outputBase ?? input.replace(/(?:\.txt)?(?:\.novel)?\.json$/i, ''), options);
}
