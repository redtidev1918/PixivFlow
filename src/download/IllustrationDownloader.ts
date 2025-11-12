import { IPixivClient } from '../interfaces/IPixivClient';
import { IDatabase } from '../interfaces/IDatabase';
import { IFileService } from '../interfaces/IFileService';
import { FileMetadata, PixivMetadata } from './FileService';
import { PixivIllust, PixivIllustPage } from '../pixiv/PixivClient';
import { logger } from '../logger';
import { processInParallel } from '../utils/concurrency';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getErrorMessage } from '../utils/errors';

/**
 * Service for downloading illustrations
 */
export class IllustrationDownloader {
  constructor(
    private readonly client: IPixivClient,
    private readonly database: IDatabase,
    private readonly fileService: IFileService,
    private readonly downloadConcurrency: number,
    private readonly storagePath: string
  ) {}

  /**
   * Download an illustration
   */
  async downloadIllustration(illust: PixivIllust, tag: string): Promise<void> {
    // Check if files already exist in file system but not in database
    const existingFiles = await this.findExistingIllustrationFiles(illust.id);
    if (existingFiles.length > 0 && !this.database.hasDownloaded(String(illust.id), 'illustration')) {
      // Files exist but not in database - update database and skip download
      logger.info(`Found existing files for illustration ${illust.id} but missing database record. Updating database...`);
      
      // Get illustration detail with tags to get full information
      const { illust: detail, tags } = await Promise.race([
        this.client.getIllustDetailWithTags(illust.id),
        new Promise<{ illust: PixivIllust; tags: Array<{ name: string; translated_name?: string }> }>((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout: Failed to get illustration detail for ${illust.id} within 60 seconds`)), 60000)
        )
      ]);
      
      // Insert database records for existing files
      for (const filePath of existingFiles) {
        this.database.insertDownload({
          pixivId: String(detail.id),
          type: 'illustration',
          tag,
          title: detail.title,
          filePath,
          author: detail.user?.name,
          userId: detail.user?.id,
        });
      }
      
      logger.info(`Updated database with ${existingFiles.length} existing file(s) for illustration ${detail.id}`);
      return; // Skip download
    }
    
    // Add timeout protection for getIllustDetailWithTags to prevent hanging
    const { illust: detail, tags } = await Promise.race([
      this.client.getIllustDetailWithTags(illust.id),
      new Promise<{ illust: PixivIllust; tags: Array<{ name: string; translated_name?: string }> }>((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout: Failed to get illustration detail for ${illust.id} within 60 seconds`)), 60000)
      )
    ]);
    const pages = this.getIllustrationPages(detail);

    // Use parallel download for multiple pages to improve performance
    const concurrency = Math.min(this.downloadConcurrency, pages.length);
    
    if (pages.length > 1) {
      logger.debug(`Downloading ${pages.length} pages for illustration ${detail.id} in parallel (concurrency: ${concurrency})`);
    }

    const downloadResults = await processInParallel(
      pages.map((page, index) => ({ page, index })),
      async ({ page, index }) => {
        const originalUrl = this.resolveImageUrl(page, detail);
        if (!originalUrl) {
          throw new Error(`Original image url missing for page ${index + 1}`);
        }

        const extension = this.extractExtension(originalUrl) ?? '.jpg';
        const fileName = this.fileService.sanitizeFileName(
          `${detail.id}_${detail.title}_${index + 1}${extension}`
        );

        const metadata: FileMetadata = {
          author: detail.user?.name,
          tag: tag,
          date: detail.create_date ? new Date(detail.create_date) : new Date(),
        };

        // Add timeout protection for image download (2 minutes per image)
        const buffer = await Promise.race([
          this.client.downloadImage(originalUrl),
          new Promise<ArrayBuffer>((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout: Failed to download image for illustration ${detail.id} page ${index + 1} within 120 seconds`)), 120000)
          )
        ]);
        const filePath = await this.fileService.saveImage(buffer, fileName, metadata);

        // Save metadata JSON file
        const pixivMetadata: PixivMetadata = {
          pixiv_id: detail.id,
          title: detail.title,
          author: {
            id: detail.user?.id || '',
            name: detail.user?.name || 'Unknown',
          },
          tags: tags,
          original_url: `https://www.pixiv.net/artworks/${detail.id}`,
          create_date: detail.create_date,
          download_tag: tag,
          type: 'illustration',
          page_number: index + 1,
          total_pages: pages.length,
          total_bookmarks: detail.total_bookmarks,
          total_view: detail.total_view,
          bookmark_count: detail.bookmark_count,
          view_count: detail.view_count,
        };
        try {
          await this.fileService.saveMetadata(filePath, pixivMetadata);
        } catch (error) {
          // Log warning but don't fail the download if metadata save fails
          logger.warn(`Failed to save metadata for illustration ${detail.id} page ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }

        return { filePath, index: index + 1 };
      },
      concurrency
    );

    // Insert download records and log results
    let successCount = 0;
    for (const result of downloadResults) {
      if (result.success) {
        this.database.insertDownload({
          pixivId: String(detail.id),
          type: 'illustration',
          tag,
          title: detail.title,
          filePath: result.result.filePath,
          author: detail.user?.name,
          userId: detail.user?.id,
        });
        // Display download path to user
        const { displayDownloadPath } = await import('../utils/directory-info');
        displayDownloadPath(result.result.filePath, 'illustration');
        
        logger.info(`Saved illustration ${detail.id} page ${result.result.index}`, { 
          filePath: result.result.filePath 
        });
        successCount++;
      } else {
        logger.warn(`Failed to download page ${result.error.message}`, { 
          illustId: detail.id,
          error: result.error.message 
        });
      }
    }

    if (successCount === 0) {
      throw new Error(`Failed to download any pages for illustration ${detail.id}`);
    }
  }

  /**
   * Find existing illustration files in the file system
   */
  private async findExistingIllustrationFiles(illustId: number): Promise<string[]> {
    const existingFiles: string[] = [];

    try {
      // Search in all subdirectories
      const searchDirectory = async (dir: string): Promise<void> => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              await searchDirectory(fullPath);
            } else if (entry.isFile()) {
              // Check if filename starts with the illustration ID
              if (entry.name.startsWith(`${illustId}_`)) {
                existingFiles.push(fullPath);
              }
            }
          }
        } catch (error) {
          logger.debug(`Error searching directory ${dir}: ${getErrorMessage(error)}`);
        }
      };

      await searchDirectory(this.storagePath);
    } catch (error) {
      logger.debug(`Error finding existing files for illustration ${illustId}: ${getErrorMessage(error)}`);
    }

    return existingFiles;
  }

  /**
   * Get illustration pages from detail
   */
  private getIllustrationPages(detail: PixivIllust): PixivIllustPage[] {
    if (detail.meta_pages && detail.meta_pages.length > 0) {
      return detail.meta_pages;
    }

    return [
      {
        image_urls: {
          square_medium: detail.image_urls.square_medium,
          medium: detail.image_urls.medium,
          large: detail.image_urls.large,
          original: detail.meta_single_page?.original_image_url,
        },
        meta_single_page: detail.meta_single_page,
      },
    ];
  }

  /**
   * Resolve image URL from page
   */
  private resolveImageUrl(page: PixivIllustPage, detail: PixivIllust): string | undefined {
    if (page.meta_single_page?.original_image_url) {
      return page.meta_single_page.original_image_url;
    }

    const imageUrls = page.image_urls;
    if (imageUrls.original) {
      return imageUrls.original;
    }

    if (detail.meta_single_page?.original_image_url) {
      return detail.meta_single_page.original_image_url;
    }

    return imageUrls.large ?? imageUrls.medium;
  }

  /**
   * Extract file extension from URL
   */
  private extractExtension(url: string): string | null {
    const path = new URL(url).pathname;
    const index = path.lastIndexOf('.');
    if (index === -1) {
      return null;
    }
    return path.slice(index);
  }
}

