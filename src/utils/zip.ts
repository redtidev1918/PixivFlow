import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { Transform } from 'node:stream';

// archiver ships no matching TS factory types; bind it at runtime via
// createRequire and keep a minimal local contract (nothing Pixiv-specific).
const archiver = createRequire(__filename)('archiver') as (
  format: 'zip', options?: { zlib?: { level?: number } }
) => Archiver;

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
  const output = createWriteStream(destPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

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
    await archive.finalize();
    await settled;
    await fs.access(destPath);
    return destPath;
  } catch (error) {
    try {
      await fs.rm(destPath, { force: true });
    } catch {
      /* best-effort cleanup */
    }
    throw new Error(`Failed to create zip archive: ${error instanceof Error ? error.message : String(error)}`);
  }
}
