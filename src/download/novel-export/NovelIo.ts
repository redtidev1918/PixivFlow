import { promises as fs } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Bounded filesystem primitives shared by the novel exporters. Kept in a
 * leaf module so EPUB/PDF/Markdown writers can reuse them without import
 * cycles against `NovelExportService`.
 */
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

export async function atomicJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(tmp, JSON.stringify(value, null, 2), { flag: 'wx' }); await fs.rename(tmp, file); }
  finally { await fs.rm(tmp, { force: true }); }
}

export function assertPixivImageUrl(source: string): void {
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.hostname !== 'i.pximg.net' || url.port || url.username || url.password) throw new Error('NOVEL_IMAGE_URL_UNSAFE: expected https://i.pximg.net');
}
