"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileNormalizationService = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const fs_1 = require("fs");
const logger_1 = require("../logger");
const fs_2 = require("../utils/fs");
class FileNormalizationService {
    storage;
    fileService;
    database;
    constructor(storage, fileService, database) {
        this.storage = storage;
        this.fileService = fileService;
        this.database = database;
    }
    /**
     * Normalize all downloaded files according to current configuration
     */
    async normalizeFiles(options = {}) {
        const { dryRun = false, normalizeNames = true, reorganize = true, updateDatabase = true, type = 'all', } = options;
        const result = {
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
            logger_1.logger.info('File normalization completed', {
                totalFiles: result.totalFiles,
                processedFiles: result.processedFiles,
                movedFiles: result.movedFiles,
                renamedFiles: result.renamedFiles,
                updatedDatabase: result.updatedDatabase,
                errorsCount: result.errors.length,
                skippedFiles: result.skippedFiles,
            });
            return result;
        }
        catch (error) {
            logger_1.logger.error('File normalization failed', { error });
            throw error;
        }
    }
    async normalizeType(fileType, options) {
        const result = {
            totalFiles: 0,
            processedFiles: 0,
            movedFiles: 0,
            renamedFiles: 0,
            updatedDatabase: 0,
            errors: [],
            skippedFiles: 0,
        };
        const baseDirectory = fileType === 'novel'
            ? this.storage.novelDirectory ?? this.storage.downloadDirectory
            : this.storage.illustrationDirectory ?? this.storage.downloadDirectory;
        if (!(0, fs_1.existsSync)(baseDirectory)) {
            logger_1.logger.warn(`Base directory does not exist: ${baseDirectory}`);
            return result;
        }
        // Get all files recursively
        const files = await this.getAllFiles(baseDirectory);
        result.totalFiles = files.length;
        logger_1.logger.info(`Processing ${files.length} ${fileType} files`, { baseDirectory });
        // Get current organization mode
        const organizationMode = fileType === 'novel'
            ? (this.storage.novelOrganization ?? 'flat')
            : (this.storage.illustrationOrganization ?? 'flat');
        // Process each file
        for (const filePath of files) {
            try {
                const fileResult = await this.normalizeFile(filePath, fileType, organizationMode, options);
                result.processedFiles++;
                if (fileResult.moved)
                    result.movedFiles++;
                if (fileResult.renamed)
                    result.renamedFiles++;
                if (fileResult.databaseUpdated)
                    result.updatedDatabase++;
                if (fileResult.skipped)
                    result.skippedFiles++;
            }
            catch (error) {
                result.errors.push({
                    file: filePath,
                    error: error instanceof Error ? error.message : String(error),
                });
                logger_1.logger.error(`Failed to normalize file: ${filePath}`, { error });
            }
        }
        return result;
    }
    async normalizeFile(filePath, fileType, organizationMode, options) {
        const result = {
            moved: false,
            renamed: false,
            databaseUpdated: false,
            skipped: false,
        };
        // Skip if file doesn't exist
        if (!(0, fs_1.existsSync)(filePath)) {
            result.skipped = true;
            return result;
        }
        // Try to load metadata
        const metadata = await this.loadMetadataForFile(filePath, fileType);
        if (!metadata) {
            logger_1.logger.warn(`No metadata found for file: ${filePath}`);
            result.skipped = true;
            return result;
        }
        // Determine target directory based on current organization mode
        const baseDirectory = fileType === 'novel'
            ? this.storage.novelDirectory ?? this.storage.downloadDirectory
            : this.storage.illustrationDirectory ?? this.storage.downloadDirectory;
        const targetDirectory = this.fileService.getOrganizedDirectory(baseDirectory, organizationMode, {
            author: metadata.author?.name,
            tag: metadata.download_tag,
            date: metadata.create_date ? new Date(metadata.create_date) : undefined,
        }, fileType);
        // Normalize file name
        let normalizedFileName = (0, node_path_1.basename)(filePath);
        if (options.normalizeNames) {
            normalizedFileName = this.normalizeFileName(normalizedFileName, metadata);
        }
        const targetPath = (0, node_path_1.join)(targetDirectory, normalizedFileName);
        // Check if file needs to be moved or renamed
        const needsMove = options.reorganize && (0, node_path_1.resolve)(filePath) !== (0, node_path_1.resolve)(targetPath);
        const needsRename = options.normalizeNames && (0, node_path_1.basename)(filePath) !== normalizedFileName;
        if (!needsMove && !needsRename) {
            result.skipped = true;
            return result;
        }
        // If dry run, just report what would be done
        if (options.dryRun) {
            if (needsMove)
                result.moved = true;
            if (needsRename)
                result.renamed = true;
            return result;
        }
        // Ensure target directory exists
        await (0, fs_2.ensureDir)(targetDirectory);
        // Handle file move/rename
        if (needsMove || needsRename) {
            // If target file already exists, find a unique name
            let finalTargetPath = targetPath;
            if ((0, fs_1.existsSync)(finalTargetPath) && (0, node_path_1.resolve)(filePath) !== (0, node_path_1.resolve)(finalTargetPath)) {
                finalTargetPath = await this.findUniquePath(targetDirectory, normalizedFileName);
            }
            // Move/rename file
            if ((0, node_path_1.resolve)(filePath) !== (0, node_path_1.resolve)(finalTargetPath)) {
                await node_fs_1.promises.rename(filePath, finalTargetPath);
                if (needsMove)
                    result.moved = true;
                if (needsRename)
                    result.renamed = true;
                // Update database
                if (options.updateDatabase) {
                    await this.updateDatabasePath(filePath, finalTargetPath, metadata);
                    result.databaseUpdated = true;
                }
                // Update metadata file path if it exists
                await this.updateMetadataFile(filePath, finalTargetPath, metadata);
                logger_1.logger.info(`Normalized file: ${filePath} -> ${finalTargetPath}`);
            }
        }
        return { ...result, newPath: targetPath };
    }
    normalizeFileName(fileName, metadata) {
        const ext = (0, node_path_1.extname)(fileName);
        const baseName = (0, node_path_1.basename)(fileName, ext);
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
    async loadMetadataForFile(filePath, fileType) {
        try {
            // First, try to find metadata file alongside the downloaded file
            const fileDir = (0, node_path_1.dirname)(filePath);
            const fileName = (0, node_path_1.basename)(filePath, (0, node_path_1.extname)(filePath));
            const metadataPathAlongside = (0, node_path_1.join)(fileDir, `${fileName}.json`);
            if ((0, fs_1.existsSync)(metadataPathAlongside)) {
                try {
                    const content = await node_fs_1.promises.readFile(metadataPathAlongside, 'utf-8');
                    const metadata = JSON.parse(content);
                    // Validate that it has the required fields
                    if (metadata.pixiv_id) {
                        return metadata;
                    }
                }
                catch (error) {
                    // If parsing fails, continue to try other locations
                    logger_1.logger.debug(`Failed to parse metadata file alongside: ${metadataPathAlongside}`, { error });
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
            const baseDirectory = fileType === 'novel'
                ? this.storage.novelDirectory ?? this.storage.downloadDirectory
                : this.storage.illustrationDirectory ?? this.storage.downloadDirectory;
            // Try to find metadata file in base directory by matching pixiv_id prefix
            // Format: {pixiv_id}_*.json
            try {
                const baseDirEntries = await node_fs_1.promises.readdir(baseDirectory);
                const metadataFileInBase = baseDirEntries.find(entry => {
                    return entry.startsWith(`${pixivId}_`) && entry.endsWith('.json');
                });
                if (metadataFileInBase) {
                    const metadataPathInBase = (0, node_path_1.join)(baseDirectory, metadataFileInBase);
                    try {
                        const content = await node_fs_1.promises.readFile(metadataPathInBase, 'utf-8');
                        const metadata = JSON.parse(content);
                        if (metadata.pixiv_id && String(metadata.pixiv_id) === pixivId) {
                            return metadata;
                        }
                    }
                    catch (error) {
                        logger_1.logger.debug(`Failed to parse metadata file in base directory: ${metadataPathInBase}`, { error });
                    }
                }
            }
            catch (error) {
                logger_1.logger.debug(`Failed to read base directory: ${baseDirectory}`, { error });
            }
            // Try to find metadata in data/metadata directory
            const databasePath = this.storage.databasePath || './data/pixiv-downloader.db';
            const dataDir = (0, node_path_1.dirname)((0, node_path_1.resolve)(databasePath));
            const metadataDir = (0, node_path_1.join)(dataDir, 'metadata');
            // Try to find metadata file
            // Format: {pixiv_id}_{type}.json or {pixiv_id}_{type}_p{page}.json
            const pageMatch = fileName.match(/_(\d+)$/);
            const pageSuffix = pageMatch ? `_p${pageMatch[1]}` : '';
            const metadataFileName = `${pixivId}_${fileType}${pageSuffix}.json`;
            const metadataPath = (0, node_path_1.join)(metadataDir, metadataFileName);
            if ((0, fs_1.existsSync)(metadataPath)) {
                const content = await node_fs_1.promises.readFile(metadataPath, 'utf-8');
                return JSON.parse(content);
            }
            // If not found, try without page suffix
            if (pageSuffix) {
                const metadataFileNameNoPage = `${pixivId}_${fileType}.json`;
                const metadataPathNoPage = (0, node_path_1.join)(metadataDir, metadataFileNameNoPage);
                if ((0, fs_1.existsSync)(metadataPathNoPage)) {
                    const content = await node_fs_1.promises.readFile(metadataPathNoPage, 'utf-8');
                    return JSON.parse(content);
                }
            }
            return null;
        }
        catch (error) {
            logger_1.logger.warn(`Failed to load metadata for file: ${filePath}`, { error });
            return null;
        }
    }
    async updateDatabasePath(oldPath, newPath, metadata) {
        try {
            const changes = this.database.updateFilePath(String(metadata.pixiv_id), metadata.type, oldPath, newPath);
            if (changes > 0) {
                logger_1.logger.debug(`Updated database path: ${oldPath} -> ${newPath}`);
            }
        }
        catch (error) {
            logger_1.logger.error(`Failed to update database path`, { oldPath, newPath, error });
            throw error;
        }
    }
    async updateMetadataFile(oldPath, newPath, metadata) {
        // Metadata files are stored in data/metadata, not alongside files
        // So we don't need to move them, but we could update the metadata if needed
        // For now, we'll leave metadata files as is
    }
    async findUniquePath(directory, fileName) {
        await (0, fs_2.ensureDir)(directory);
        const { ext, baseName } = this.splitExtension(fileName);
        let attempt = 0;
        while (attempt < 1000) {
            const suffix = attempt === 0 ? '' : `_${attempt}`;
            const candidateName = `${baseName}${suffix}${ext}`;
            const filePath = (0, node_path_1.join)(directory, candidateName);
            try {
                await node_fs_1.promises.access(filePath);
                attempt++;
            }
            catch {
                return filePath;
            }
        }
        throw new Error(`Unable to find unique file name for ${fileName} in ${directory}`);
    }
    splitExtension(fileName) {
        const index = fileName.lastIndexOf('.');
        if (index === -1) {
            return { baseName: fileName, ext: '' };
        }
        return {
            baseName: fileName.slice(0, index),
            ext: fileName.slice(index),
        };
    }
    async getAllFiles(directory) {
        const files = [];
        async function walkDir(dir) {
            try {
                const entries = await node_fs_1.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = (0, node_path_1.join)(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walkDir(fullPath);
                    }
                    else if (entry.isFile()) {
                        files.push(fullPath);
                    }
                }
            }
            catch (error) {
                logger_1.logger.warn(`Failed to read directory: ${dir}`, { error });
            }
        }
        await walkDir(directory);
        return files;
    }
    mergeResults(target, source) {
        target.totalFiles += source.totalFiles;
        target.processedFiles += source.processedFiles;
        target.movedFiles += source.movedFiles;
        target.renamedFiles += source.renamedFiles;
        target.updatedDatabase += source.updatedDatabase;
        target.errors.push(...source.errors);
        target.skippedFiles += source.skippedFiles;
    }
}
exports.FileNormalizationService = FileNormalizationService;
//# sourceMappingURL=FileNormalizationService.js.map