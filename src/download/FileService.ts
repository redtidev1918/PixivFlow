import { ensureDir } from '../utils/fs';
import { StorageConfig, OrganizationMode } from '../config';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';

export interface FileMetadata {
  author?: string;
  tag?: string;
  date?: Date | string;
}

export interface PixivMetadata {
  pixiv_id: string | number;
  title: string;
  author: {
    id: string;
    name: string;
  };
  tags: Array<{ name: string; translated_name?: string }>;
  original_url: string;
  create_date: string;
  download_tag?: string;
  type: 'illustration' | 'novel';
  page_number?: number; // For multi-page illustrations
  total_pages?: number; // For multi-page illustrations
  // Popularity metrics
  total_bookmarks?: number;
  total_view?: number;
  bookmark_count?: number;
  view_count?: number;
  // Language detection (for novels)
  detected_language?: {
    code: string; // ISO 639-3 language code
    name: string; // Language name
    is_chinese: boolean;
  };
}

export class FileService {
  constructor(private readonly storage: StorageConfig) {}

  public async initialise() {
    await ensureDir(this.storage.downloadDirectory!);
    if (this.storage.illustrationDirectory) {
      await ensureDir(this.storage.illustrationDirectory);
    }
    if (this.storage.novelDirectory) {
      await ensureDir(this.storage.novelDirectory);
    }
  }

  public async saveImage(
    buffer: ArrayBuffer,
    fileName: string,
    metadata?: FileMetadata
  ): Promise<string> {
    const baseDirectory = this.storage.illustrationDirectory ?? this.storage.downloadDirectory!;
    const organizationMode = this.storage.illustrationOrganization ?? 'flat';
    const targetDirectory = this.getOrganizedDirectory(baseDirectory, organizationMode, metadata, 'illustration');
    const uniquePath = await this.findUniquePath(targetDirectory, fileName);
    await fs.writeFile(uniquePath, Buffer.from(buffer));
    return uniquePath;
  }

  public async saveText(
    content: string,
    fileName: string,
    metadata?: FileMetadata
  ): Promise<string> {
    const baseDirectory = this.storage.novelDirectory ?? this.storage.downloadDirectory!;
    const organizationMode = this.storage.novelOrganization ?? 'flat';
    const targetDirectory = this.getOrganizedDirectory(baseDirectory, organizationMode, metadata, 'novel');
    const uniquePath = await this.findUniquePath(targetDirectory, fileName);
    await fs.writeFile(uniquePath, content, 'utf-8');
    return uniquePath;
  }

  public sanitizeFileName(name: string) {
    return name
      .replace(/[\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public sanitizeDirectoryName(name: string): string {
    // Sanitize directory name, more restrictive than file names
    return name
      .replace(/[\/:*?"<>|\\]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/\./g, '_')
      .replace(/^_+|_+$/g, '')
      .trim() || 'unknown';
  }

  private getOrganizedDirectory(
    baseDirectory: string,
    mode: OrganizationMode,
    metadata?: FileMetadata,
    fileType?: 'novel' | 'illustration'
  ): string {
    if (mode === 'flat') {
      return baseDirectory;
    }

    const parts: string[] = [];

    if (mode === 'byDate' || mode === 'byDateAndAuthor') {
      const date = metadata?.date
        ? typeof metadata.date === 'string'
          ? new Date(metadata.date)
          : metadata.date
        : new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      parts.push(`${year}-${month}`);
      // Add type subdirectory in date folder
      if (fileType) {
        parts.push(fileType === 'novel' ? 'novels' : 'illustrations');
      }
    }

    if (mode === 'byDay' || mode === 'byDayAndAuthor') {
      const date = metadata?.date
        ? typeof metadata.date === 'string'
          ? new Date(metadata.date)
          : metadata.date
        : new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      parts.push(`${year}-${month}-${day}`);
      // Add type subdirectory in date folder
      if (fileType) {
        parts.push(fileType === 'novel' ? 'novels' : 'illustrations');
      }
    }

    if (mode === 'byAuthor' || mode === 'byAuthorAndTag' || mode === 'byDateAndAuthor' || mode === 'byDayAndAuthor') {
      const author = metadata?.author ? this.sanitizeDirectoryName(metadata.author) : 'unknown';
      parts.push(author);
    }

    if (mode === 'byTag' || mode === 'byAuthorAndTag') {
      const tag = metadata?.tag ? this.sanitizeDirectoryName(metadata.tag) : 'untagged';
      parts.push(tag);
    }

    return parts.length > 0 ? join(baseDirectory, ...parts) : baseDirectory;
  }

  private async findUniquePath(directory: string, fileName: string): Promise<string> {
    await ensureDir(directory);
    const { ext, baseName } = this.splitExtension(fileName);
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

  private splitExtension(fileName: string): { baseName: string; ext: string } {
    const index = fileName.lastIndexOf('.');
    if (index === -1) {
      return { baseName: fileName, ext: '' };
    }
    return {
      baseName: fileName.slice(0, index),
      ext: fileName.slice(index),
    };
  }

  /**
   * Save metadata JSON file alongside the downloaded file
   * @param filePath Path to the downloaded file
   * @param metadata Metadata to save
   */
  public async saveMetadata(filePath: string, metadata: PixivMetadata): Promise<string> {
    const { baseName } = this.splitExtension(filePath);
    const metadataPath = join(dirname(filePath), `${baseName}.json`);
    const jsonContent = JSON.stringify(metadata, null, 2);
    await fs.writeFile(metadataPath, jsonContent, 'utf-8');
    return metadataPath;
  }
}

