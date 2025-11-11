import { basename, extname } from 'node:path';
import { PixivMetadata } from '../FileService';
import { IFileService } from '../../interfaces/IFileService';

/**
 * Service for normalizing file names during file normalization.
 */
export class FileNameNormalizer {
  constructor(private readonly fileService: IFileService) {}

  normalizeFileName(fileName: string, metadata: PixivMetadata): string {
    const ext = extname(fileName);
    const baseName = basename(fileName, ext);

    // Extract pixiv_id from filename (format: {pixiv_id}_title_page.ext)
    const pixivIdMatch = baseName.match(/^(\d+)/);
    const pixivId = pixivIdMatch ? pixivIdMatch[1] : String(metadata.pixiv_id);

    // Get title and sanitize it
    let title = metadata.title || '';
    title = this.fileService.sanitizeFileName(title);

    // Get page number if it's a multi-page illustration
    const pageMatch = baseName.match(/_(\d+)$/);
    const pageNumber = pageMatch ? pageMatch[1] : (metadata.page_number ? String(metadata.page_number) : '');

    // Build normalized filename: {pixiv_id}_{title}_{page}.ext
    let normalizedName = pixivId;
    if (title) {
      normalizedName += `_${title}`;
    }
    if (pageNumber) {
      normalizedName += `_${pageNumber}`;
    }
    normalizedName += ext;

    // Ensure filename is not too long (max 255 characters for most filesystems)
    if (normalizedName.length > 255) {
      const maxTitleLength = 255 - pixivId.length - pageNumber.length - ext.length - 10; // 10 for separators and buffer
      if (title.length > maxTitleLength) {
        title = title.substring(0, maxTitleLength);
      }
      normalizedName = `${pixivId}_${title}${pageNumber ? `_${pageNumber}` : ''}${ext}`;
    }

    return normalizedName;
  }
}

