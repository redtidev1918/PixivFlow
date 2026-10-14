import { promises as fs } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { buildMediaAsset } from '../../domain/media/MediaAsset';
import { readImageDimensions } from '../../utils/imageDimensions';
import { createHash, randomUUID } from 'node:crypto';
import { artifactId, Artifact } from '../../domain/media/Artifact';
import type { MediaMaterializer } from '../materialization/MediaMaterializer';
import { NovelBook, NovelDocument, parseNovel, assembleSeries } from './NovelDocument';
import { BookImage, imageKey, writeEpub } from './EpubExporter';
import { PdfOptions, writePdf } from './PdfExporter';

export interface NovelExportOptions { formats?: Array<'txt' | 'epub' | 'pdf'>; mergeSeries?: boolean; pdf?: PdfOptions }
export interface ExportResult { artifacts: Artifact[]; errors: Array<{ format: string; code: string; message: string }> }
export interface SeriesManifest { version: 1; seriesId: string; title: string; orderedIds: string[]; metadataPaths: string[] }

export function validateNovelExport(value: unknown): asserts value is NovelExportOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('novelExport must be an object');
  const v = value as NovelExportOptions;
  if (v.formats !== undefined && (!Array.isArray(v.formats) || !v.formats.length || v.formats.some(f => !['txt', 'epub', 'pdf'].includes(f)))) throw new Error('novelExport.formats must contain txt, epub or pdf');
  if (v.mergeSeries !== undefined && typeof v.mergeSeries !== 'boolean') throw new Error('novelExport.mergeSeries must be boolean');
  if (v.pdf !== undefined) {
    if (!v.pdf || typeof v.pdf !== 'object') throw new Error('novelExport.pdf must be an object');
    for (const key of ['browserPath', 'fontPath'] as const) if (v.pdf[key] !== undefined && (typeof v.pdf[key] !== 'string' || !isAbsolute(v.pdf[key]!))) throw new Error(`novelExport.pdf.${key} must be an absolute path`);
    if (v.pdf.timeoutMs !== undefined && (!Number.isInteger(v.pdf.timeoutMs) || v.pdf.timeoutMs < 1000 || v.pdf.timeoutMs > 120_000)) throw new Error('novelExport.pdf.timeoutMs must be 1000..120000');
  }
}

export async function containedPath(root: string, candidate: string): Promise<string> {
  const base = await fs.realpath(root);
  const full = await fs.realpath(resolve(root, candidate));
  const rel = relative(base, full);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('NOVEL_PATH_UNSAFE: asset must stay inside its source directory');
  return full;
}

export async function readBounded(file: string, max: number): Promise<Buffer> {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > max) throw new Error('NOVEL_FILE_LIMIT: input is not a bounded regular file');
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const chunk = await handle.read(bytes, length, bytes.length - length, null);
      if (!chunk.bytesRead) break;
      length += chunk.bytesRead;
    }
    if (length > stat.size) throw new Error('NOVEL_FILE_CHANGED: input grew while reading');
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

function imageType(bytes: Buffer): { mime: string; ext: string } {
  const size = readImageDimensions(bytes);
  if (!size || size.width <= 0 || size.height <= 0 || size.width * size.height > 40_000_000) throw new Error('NOVEL_IMAGE_TYPE: invalid image dimensions or more than 40 megapixels');
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return { mime: 'image/png', ext: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) return { mime: 'image/gif', ext: 'gif' };
  throw new Error('NOVEL_IMAGE_TYPE: EPUB images must be PNG, JPEG or GIF; HTML/SVG/WebP are not silently embedded');
}

export function assertPixivImageUrl(source: string): void {
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.hostname !== 'i.pximg.net' || url.port || url.username || url.password) throw new Error('NOVEL_IMAGE_URL_UNSAFE: expected https://i.pximg.net');
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

export async function atomicJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(tmp, JSON.stringify(value, null, 2), { flag: 'wx' }); await fs.rename(tmp, file); }
  finally { await fs.rm(tmp, { force: true }); }
}

export async function exportBook(book: NovelBook, roots: Map<string, string>, outputBase: string, options: NovelExportOptions, materializer?: MediaMaterializer, seeds?: Map<string, Buffer>): Promise<ExportResult> {
  validateNovelExport(options);
  if (!book.documents.length || book.documents.length > 1000) throw new Error('NOVEL_BOOK_LIMIT');
  if (book.documents.reduce((size, d) => size + Buffer.byteLength(d.rawText), 0) > 8 * 1024 * 1024) throw new Error('NOVEL_TEXT_LIMIT: maximum 8 MiB per book');
  const result: ExportResult = { artifacts: [], errors: [] };
  const formats = [...new Set(options.formats ?? ['epub'] as const)].filter((f): f is 'epub' | 'pdf' => f !== 'txt');
  if (!formats.length) return result;
  let images: BookImage[] | undefined;
  for (const format of formats) {
    const dest = resolve(`${outputBase}.${format}`);
    const lockPath = `${dest}.lock`;
    const temp = `${dest}.${randomUUID()}.tmp`;
    let lock: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      await fs.mkdir(dirname(dest), { recursive: true });
      try { lock = await fs.open(lockPath, 'wx'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('NOVEL_EXPORT_BUSY: output is locked by another export'); throw error; }
      await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
      images ??= await prepareImages(book, roots, materializer, seeds);
      const fingerprint = createHash('sha256').update(JSON.stringify({ renderer: 1, book, format, pdf: options.pdf, images: images.map(i => i.name) })).digest('hex');
      const receipt = `${dest}.export.json`;
      let cached = false;
      try {
        const prior = JSON.parse((await readBounded(receipt, 4096)).toString());
        const bytes = await readBounded(dest, 150 * 1024 * 1024);
        cached = prior.fingerprint === fingerprint && prior.checksum === createHash('sha256').update(bytes).digest('hex');
      } catch { /* No usable cached artifact. */ }
      if (!cached) {
        if (format === 'epub') await writeEpub(book, images, temp);
        else await writePdf(book, images, temp, options.pdf ?? {});
        const bytes = await readBounded(temp, 150 * 1024 * 1024);
        const checksum = createHash('sha256').update(bytes).digest('hex');
        await fs.rename(temp, dest);
        await atomicJson(receipt, { fingerprint, checksum });
      }
      const stat = await fs.stat(dest);
      result.artifacts.push({ id: artifactId(book.id, format, basename(dest)), workId: book.id, variant: format, path: dest, mimeType: format === 'epub' ? 'application/epub+zip' : 'application/pdf', size: stat.size });
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
