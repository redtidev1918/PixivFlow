import { promises as fs } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { existsSync } from 'fs';
import { PixivMetadata } from './FileService';
import { StorageConfig, OrganizationMode } from '../config';
import { logger } from '../logger';
import { ensureDir } from '../utils/fs';
import { IFileService } from '../interfaces/IFileService';
import { IDatabase } from '../interfaces/IDatabase';
import { MetadataLoader } from './normalization/MetadataLoader';
import { FileNameNormalizer } from './normalization/FileNameNormalizer';
import { FileOperationUtils } from './normalization/FileOperationUtils';

export interface NormalizationResult {
  totalFiles: number;
  processedFiles: number;
  movedFiles: number;
  renamedFiles: number;
  updatedDatabase: number;
  errors: Array<{ file: string; error: string }>;
  skippedFiles: number;
}

export interface FileNormalizationOptions {
  dryRun?: boolean; // If true, only report what would be done without actually doing it
  normalizeNames?: boolean; // Normalize file names (remove special characters)
  reorganize?: boolean; // Reorganize files according to current organization mode
  updateDatabase?: boolean; // Update database with new paths
  type?: 'illustration' | 'novel' | 'all'; // Which type of files to normalize
}

export class FileNormalizationService {
  private readonly metadataLoader: MetadataLoader;
  private readonly fileNameNormalizer: FileNameNormalizer;

  constructor(
    private readonly storage: StorageConfig,
    private readonly fileService: IFileService,
    private readonly database: IDatabase
  ) {
    this.metadataLoader = new MetadataLoader(storage);
    this.fileNameNormalizer = new FileNameNormalizer(fileService);
  }

  /**
   * Normalize all downloaded files according to current configuration
   */
  public async normalizeFiles(options: FileNormalizationOptions = {}): Promise<NormalizationResult> {
    const {
      dryRun = false,
      normalizeNames = true,
      reorganize = true,
      updateDatabase = true,
      type = 'all',
    } = options;

    const result: NormalizationResult = {
      totalFiles: 0,
      processedFiles: 0,
      movedFiles: 0,
      renamedFiles: 0,
      updatedDatabase: 0,
      errors: [],
      skippedFiles: 0,
    };

    try {
      // Process illustrations
      if (type === 'all' || type === 'illustration') {
        const illustrationResult = await this.normalizeType('illustration', {
          dryRun,
          normalizeNames,
          reorganize,
          updateDatabase,
        });
        this.mergeResults(result, illustrationResult);
      }

      // Process novels
      if (type === 'all' || type === 'novel') {
        const novelResult = await this.normalizeType('novel', {
          dryRun,
          normalizeNames,
          reorganize,
          updateDatabase,
        });
        this.mergeResults(result, novelResult);
      }

      logger.info('File normalization completed', {
        totalFiles: result.totalFiles,
        processedFiles: result.processedFiles,
        movedFiles: result.movedFiles,
        renamedFiles: result.renamedFiles,
        updatedDatabase: result.updatedDatabase,
        errorsCount: result.errors.length,
        skippedFiles: result.skippedFiles,
      });
      return result;
    } catch (error) {
      logger.error('File normalization failed', { error });
      throw error;
    }
  }

  private async normalizeType(
    fileType: 'illustration' | 'novel',
    options: Required<Omit<FileNormalizationOptions, 'type'>>
  ): Promise<NormalizationResult> {
    const result: NormalizationResult = {
      totalFiles: 0,
      processedFiles: 0,
      movedFiles: 0,
      renamedFiles: 0,
      updatedDatabase: 0,
      errors: [],
      skippedFiles: 0,
    };

    const baseDirectory =
      fileType === 'novel'
        ? this.storage.novelDirectory ?? this.storage.downloadDirectory!
        : this.storage.illustrationDirectory ?? this.storage.downloadDirectory!;

    if (!existsSync(baseDirectory)) {
      logger.warn(`Base directory does not exist: ${baseDirectory}`);
      return result;
    }

    // Get all files recursively
    const files = await FileOperationUtils.getAllFiles(baseDirectory);
    result.totalFiles = files.length;

    logger.info(`Processing ${files.length} ${fileType} files`, { baseDirectory });

    // Get current organization mode
    const organizationMode =
      fileType === 'novel'
        ? (this.storage.novelOrganization ?? 'flat')
        : (this.storage.illustrationOrganization ?? 'flat');

    // Process each file
    for (const filePath of files) {
      try {
        const fileResult = await this.normalizeFile(filePath, fileType, organizationMode, options);
        result.processedFiles++;
        if (fileResult.moved) result.movedFiles++;
        if (fileResult.renamed) result.renamedFiles++;
        if (fileResult.databaseUpdated) result.updatedDatabase++;
        if (fileResult.skipped) result.skippedFiles++;
      } catch (error) {
        result.errors.push({
          file: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
        logger.error(`Failed to normalize file: ${filePath}`, { error });
      }
    }

    return result;
  }

  private async normalizeFile(
    filePath: string,
    fileType: 'illustration' | 'novel',
    organizationMode: OrganizationMode,
    options: Required<Omit<FileNormalizationOptions, 'type'>>
  ): Promise<{
    moved: boolean;
    renamed: boolean;
    databaseUpdated: boolean;
    skipped: boolean;
    newPath?: string;
  }> {
    const result = {
      moved: false,
      renamed: false,
      databaseUpdated: false,
      skipped: false,
    };

    // Skip if file doesn't exist
    if (!existsSync(filePath)) {
      result.skipped = true;
      return result;
    }

    // Try to load metadata
    const metadata = await this.metadataLoader.loadMetadataForFile(filePath, fileType);
    if (!metadata) {
      logger.warn(`No metadata found for file: ${filePath}`);
      result.skipped = true;
      return result;
    }

    // Determine target directory based on current organization mode
    const baseDirectory =
      fileType === 'novel'
        ? this.storage.novelDirectory ?? this.storage.downloadDirectory!
        : this.storage.illustrationDirectory ?? this.storage.downloadDirectory!;

    const targetDirectory = this.fileService.getOrganizedDirectory(
      baseDirectory,
      organizationMode,
      {
        author: metadata.author?.name,
        tag: metadata.download_tag,
        date: metadata.create_date ? new Date(metadata.create_date) : undefined,
      },
      fileType
    );

    // Normalize file name
    let normalizedFileName = basename(filePath);
    if (options.normalizeNames) {
      normalizedFileName = this.fileNameNormalizer.normalizeFileName(normalizedFileName, metadata);
    }

    const targetPath = join(targetDirectory, normalizedFileName);

    // Check if file needs to be moved or renamed
    const needsMove = options.reorganize && resolve(filePath) !== resolve(targetPath);
    const needsRename = options.normalizeNames && basename(filePath) !== normalizedFileName;

    if (!needsMove && !needsRename) {
      result.skipped = true;
      return result;
    }

    // If dry run, just report what would be done
    if (options.dryRun) {
      if (needsMove) result.moved = true;
      if (needsRename) result.renamed = true;
      return result;
    }

    // Ensure target directory exists
    await ensureDir(targetDirectory);

    // Handle file move/rename
    if (needsMove || needsRename) {
      // If target file already exists, find a unique name
      let finalTargetPath = targetPath;
      if (existsSync(finalTargetPath) && resolve(filePath) !== resolve(finalTargetPath)) {
        finalTargetPath = await FileOperationUtils.findUniquePath(targetDirectory, normalizedFileName);
      }

      // Move/rename file
      if (resolve(filePath) !== resolve(finalTargetPath)) {
        await fs.rename(filePath, finalTargetPath);
        if (needsMove) result.moved = true;
        if (needsRename) result.renamed = true;

        // Update database
        if (options.updateDatabase) {
          await this.updateDatabasePath(filePath, finalTargetPath, metadata);
          result.databaseUpdated = true;
        }

        // Update metadata file path if it exists
        await this.updateMetadataFile(filePath, finalTargetPath, metadata);

        logger.info(`Normalized file: ${filePath} -> ${finalTargetPath}`);
      }
    }

    return { ...result, newPath: targetPath };
  }


  private async updateDatabasePath(
    oldPath: string,
    newPath: string,
    metadata: PixivMetadata
  ): Promise<void> {
    try {
      const changes = this.database.updateFilePath(
        String(metadata.pixiv_id),
        metadata.type,
        oldPath,
        newPath
      );
      if (changes > 0) {
        logger.debug(`Updated database path: ${oldPath} -> ${newPath}`);
      }
    } catch (error) {
      logger.error(`Failed to update database path`, { oldPath, newPath, error });
      throw error;
    }
  }

  private async updateMetadataFile(
    oldPath: string,
    newPath: string,
    metadata: PixivMetadata
  ): Promise<void> {
    // Metadata files are stored in data/metadata, not alongside files
    // So we don't need to move them, but we could update the metadata if needed
    // For now, we'll leave metadata files as is
  }

  private mergeResults(target: NormalizationResult, source: NormalizationResult): void {
    target.totalFiles += source.totalFiles;
    target.processedFiles += source.processedFiles;
    target.movedFiles += source.movedFiles;
    target.renamedFiles += source.renamedFiles;
    target.updatedDatabase += source.updatedDatabase;
    target.errors.push(...source.errors);
    target.skippedFiles += source.skippedFiles;
  }
}

