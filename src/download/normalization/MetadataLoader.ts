import { promises as fs } from 'node:fs';
import { join, dirname, basename, extname, resolve } from 'node:path';
import { existsSync } from 'fs';
import { PixivMetadata } from '../FileService';
import { StorageConfig } from '../../config';
import { logger } from '../../logger';

/**
 * Service for loading metadata for files during normalization.
 */
export class MetadataLoader {
  constructor(private readonly storage: StorageConfig) {}

  async loadMetadataForFile(
    filePath: string,
    fileType: 'illustration' | 'novel'
  ): Promise<PixivMetadata | null> {
    try {
      // First, try to find metadata file alongside the downloaded file
      const fileDir = dirname(filePath);
      const fileName = basename(filePath, extname(filePath));
      const metadataPathAlongside = join(fileDir, `${fileName}.json`);
      
      if (existsSync(metadataPathAlongside)) {
        try {
          const content = await fs.readFile(metadataPathAlongside, 'utf-8');
          const metadata = JSON.parse(content) as PixivMetadata;
          // Validate that it has the required fields
          if (metadata.pixiv_id) {
            return metadata;
          }
        } catch (error) {
          // If parsing fails, continue to try other locations
          logger.debug(`Failed to parse metadata file alongside: ${metadataPathAlongside}`, { error });
        }
      }

      // Extract pixiv_id from filename
      const pixivIdMatch = fileName.match(/^(\d+)/);
      if (!pixivIdMatch) {
        return null;
      }
      const pixivId = pixivIdMatch[1];

      // Try to find metadata in base directory (root of downloads)
      // Files might be in subdirectories but metadata might be in root
      const baseDirectory =
        fileType === 'novel'
          ? this.storage.novelDirectory ?? this.storage.downloadDirectory!
          : this.storage.illustrationDirectory ?? this.storage.downloadDirectory!;
      
      // Try to find metadata file in base directory by matching pixiv_id prefix
      // Format: {pixiv_id}_*.json
      try {
        const baseDirEntries = await fs.readdir(baseDirectory);
        const metadataFileInBase = baseDirEntries.find(entry => {
          return entry.startsWith(`${pixivId}_`) && entry.endsWith('.json');
        });
        
        if (metadataFileInBase) {
          const metadataPathInBase = join(baseDirectory, metadataFileInBase);
          try {
            const content = await fs.readFile(metadataPathInBase, 'utf-8');
            const metadata = JSON.parse(content) as PixivMetadata;
            if (metadata.pixiv_id && String(metadata.pixiv_id) === pixivId) {
              return metadata;
            }
          } catch (error) {
            logger.debug(`Failed to parse metadata file in base directory: ${metadataPathInBase}`, { error });
          }
        }
      } catch (error) {
        logger.debug(`Failed to read base directory: ${baseDirectory}`, { error });
      }

      // Try to find metadata in data/metadata directory
      const databasePath = this.storage.databasePath || './data/pixiv-downloader.db';
      const dataDir = dirname(resolve(databasePath));
      const metadataDir = join(dataDir, 'metadata');

      // Try to find metadata file
      // Format: {pixiv_id}_{type}.json or {pixiv_id}_{type}_p{page}.json
      const pageMatch = fileName.match(/_(\d+)$/);
      const pageSuffix = pageMatch ? `_p${pageMatch[1]}` : '';
      const metadataFileName = `${pixivId}_${fileType}${pageSuffix}.json`;
      const metadataPath = join(metadataDir, metadataFileName);

      if (existsSync(metadataPath)) {
        const content = await fs.readFile(metadataPath, 'utf-8');
        return JSON.parse(content) as PixivMetadata;
      }

      // If not found, try without page suffix
      if (pageSuffix) {
        const metadataFileNameNoPage = `${pixivId}_${fileType}.json`;
        const metadataPathNoPage = join(metadataDir, metadataFileNameNoPage);
        if (existsSync(metadataPathNoPage)) {
          const content = await fs.readFile(metadataPathNoPage, 'utf-8');
          return JSON.parse(content) as PixivMetadata;
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to load metadata for file: ${filePath}`, { error });
      return null;
    }
  }
}

