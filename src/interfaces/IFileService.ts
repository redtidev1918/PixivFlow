import { FileMetadata, PixivMetadata } from '../download/FileService';

/**
 * Interface for file operations
 * Provides abstraction for file system operations
 */
export interface IFileService {
  /**
   * Initialize file service (create directories)
   */
  initialise(): Promise<void>;

  /**
   * Save image file
   */
  saveImage(
    buffer: ArrayBuffer,
    fileName: string,
    metadata?: FileMetadata
  ): Promise<string>;

  /**
   * Save text file (novel)
   */
  saveText(
    content: string,
    fileName: string,
    metadata?: FileMetadata
  ): Promise<string>;

  /**
   * Sanitize file name
   */
  sanitizeFileName(name: string): string;

  /**
   * Sanitize directory name
   */
  sanitizeDirectoryName(name: string): string;

  /**
   * Get organized directory path based on organization mode
   */
  getOrganizedDirectory(
    baseDirectory: string,
    mode: 'flat' | 'byAuthor' | 'byTag' | 'byDate' | 'byDay' | 'byDownloadDate' | 'byDownloadDay' | 'byAuthorAndTag' | 'byDateAndAuthor' | 'byDayAndAuthor' | 'byDownloadDateAndAuthor' | 'byDownloadDayAndAuthor',
    metadata?: FileMetadata,
    fileType?: 'novel' | 'illustration'
  ): string;

  /**
   * Find unique path for a file (adds number suffix if file exists)
   */
  findUniquePath(directory: string, fileName: string): Promise<string>;

  /**
   * Check if file exists
   */
  fileExists(filePath: string): Promise<boolean>;

  /**
   * Read file metadata from JSON file
   */
  readMetadata(filePath: string): Promise<PixivMetadata | null>;

  /**
   * Write metadata to JSON file
   */
  writeMetadata(filePath: string, metadata: PixivMetadata): Promise<void>;

  /**
   * Save metadata to JSON file (alias for writeMetadata)
   */
  saveMetadata(filePath: string, metadata: PixivMetadata): Promise<string>;
}

