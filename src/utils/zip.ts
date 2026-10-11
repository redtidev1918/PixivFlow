import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import type { Transform } from 'node:stream';

// Keep native import(): TypeScript's CommonJS emit would turn a source-level
// import() into require(), which cannot reliably load archiver's ESM entry.
// The fixed import contains no configuration or user-provided code.
const importArchiver = new Function('return import("archiver")') as () => Promise<{
  ZipArchive: new (options: { zlib: { level: number }; statConcurrency: number }) => Archiver;
}>;

interface Archiver extends Transform {
  file(sourcePath: string, data: { name: string }): void;
  finalize(): Promise<void>;
  abort(): void;
}

export interface ArchiveEntry {
  /** Path the file is stored under inside the zip (e.g. "images/001.jpg"). */
  name: string;
  /** Absolute path of the file on disk. */
  sourcePath: string;
}

/**
 * Create a zip archive at `destPath` containing `entries` (order preserved).
 * Returns destPath on success; on failure removes a partial destination so a
 * caller never hands a half-written archive to a delivery. Pure FS helper — no
 * domain logic.
 */
export async function createZipArchive(destPath: string, entries: ArchiveEntry[]): Promise<string> {
  const { ZipArchive } = await importArchiver();
  // Files enter the archive after asynchronous stat calls. Serial admission
  // keeps their archive order equal to the caller's entry order.
  const archive = new ZipArchive({ zlib: { level: 9 }, statConcurrency: 1 });
  const output = createWriteStream(destPath);

  const settled = new Promise<string>((resolve, reject) => {
    output.on('close', () => resolve(destPath));
    output.on('error', reject);
    archive.on('error', reject);
  });

  try {
    archive.pipe(output);
    for (const e of entries) {
      archive.file(e.sourcePath, { name: e.name });
    }
    await Promise.all([archive.finalize(), settled]);
    await fs.access(destPath);
    return destPath;
  } catch (error) {
    archive.abort();
    output.destroy();
    if (!output.closed) {
      await new Promise<void>(resolve => output.once('close', resolve));
    }
    try {
      await fs.rm(destPath, { force: true });
    } catch {
      /* best-effort cleanup */
    }
    throw new Error(`Failed to create zip archive: ${error instanceof Error ? error.message : String(error)}`);
  }
}
