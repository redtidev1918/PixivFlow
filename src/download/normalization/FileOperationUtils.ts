import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ensureDir } from '../../utils/fs';
import { logger } from '../../logger';

/**
 * Utility functions for file operations during normalization.
 */
export class FileOperationUtils {
  /**
   * Get all files recursively from a directory.
   */
  static async getAllFiles(directory: string): Promise<string[]> {
    const files: string[] = [];

    async function walkDir(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.isFile()) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        logger.warn(`Failed to read directory: ${dir}`, { error });
      }
    }

    await walkDir(directory);
    return files;
  }

  /**
   * Find a unique file path by appending a suffix if the file already exists.
   */
  static async findUniquePath(directory: string, fileName: string): Promise<string> {
    await ensureDir(directory);
    const { ext, baseName } = FileOperationUtils.splitExtension(fileName);
    let attempt = 0;
    while (attempt < 1000) {
      const suffix = attempt === 0 ? '' : `_${attempt}`;
      const candidateName = `${baseName}${suffix}${ext}`;
      const filePath = join(directory, candidateName);
      try {
        await fs.access(filePath);
        attempt++;
      } catch {
        return filePath;
      }
    }
    throw new Error(`Unable to find unique file name for ${fileName} in ${directory}`);
  }

  /**
   * Split a filename into base name and extension.
   */
  static splitExtension(fileName: string): { baseName: string; ext: string } {
    const index = fileName.lastIndexOf('.');
    if (index === -1) {
      return { baseName: fileName, ext: '' };
    }
    return {
      baseName: fileName.slice(0, index),
      ext: fileName.slice(index),
    };
  }
}

