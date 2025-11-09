"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const fs_1 = require("../utils/fs");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
class FileService {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    async initialise() {
        await (0, fs_1.ensureDir)(this.storage.downloadDirectory);
        if (this.storage.illustrationDirectory) {
            await (0, fs_1.ensureDir)(this.storage.illustrationDirectory);
        }
        if (this.storage.novelDirectory) {
            await (0, fs_1.ensureDir)(this.storage.novelDirectory);
        }
    }
    async saveImage(buffer, fileName, metadata) {
        const baseDirectory = this.storage.illustrationDirectory ?? this.storage.downloadDirectory;
        const organizationMode = this.storage.illustrationOrganization ?? 'flat';
        const targetDirectory = this.getOrganizedDirectory(baseDirectory, organizationMode, metadata, 'illustration');
        const uniquePath = await this.findUniquePath(targetDirectory, fileName);
        await node_fs_1.promises.writeFile(uniquePath, Buffer.from(buffer));
        return uniquePath;
    }
    async saveText(content, fileName, metadata) {
        const baseDirectory = this.storage.novelDirectory ?? this.storage.downloadDirectory;
        const organizationMode = this.storage.novelOrganization ?? 'flat';
        const targetDirectory = this.getOrganizedDirectory(baseDirectory, organizationMode, metadata, 'novel');
        const uniquePath = await this.findUniquePath(targetDirectory, fileName);
        await node_fs_1.promises.writeFile(uniquePath, content, 'utf-8');
        return uniquePath;
    }
    sanitizeFileName(name) {
        return name
            .replace(/[\/:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim();
    }
    sanitizeDirectoryName(name) {
        // Sanitize directory name, more restrictive than file names
        return name
            .replace(/[\/:*?"<>|\\]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/\./g, '_')
            .replace(/^_+|_+$/g, '')
            .trim() || 'unknown';
    }
    getOrganizedDirectory(baseDirectory, mode, metadata, fileType) {
        if (mode === 'flat') {
            return baseDirectory;
        }
        // Check if baseDirectory already ends with a type-specific directory name
        // This prevents duplicate type directories when baseDirectory is already novelDirectory or illustrationDirectory
        const baseDirNormalized = baseDirectory.replace(/[\/\\]+$/, ''); // Remove trailing slashes
        const lastSegment = baseDirNormalized.split(/[\/\\]/).pop()?.toLowerCase() || '';
        const alreadyHasTypeDir = lastSegment === 'novels' || lastSegment === 'illustrations';
        const parts = [];
        // Extract date information once for reuse
        const getDateParts = () => {
            const date = metadata?.date
                ? typeof metadata.date === 'string'
                    ? new Date(metadata.date)
                    : metadata.date
                : new Date();
            return {
                year: date.getFullYear(),
                month: String(date.getMonth() + 1).padStart(2, '0'),
                day: String(date.getDate()).padStart(2, '0'),
            };
        };
        // Handle date-based organization modes
        if (mode === 'byDate' || mode === 'byDateAndAuthor') {
            const { year, month } = getDateParts();
            parts.push(`${year}-${month}`);
            // Add type subdirectory only if baseDirectory doesn't already end with a type directory
            if (fileType && !alreadyHasTypeDir) {
                parts.push(fileType === 'novel' ? 'novels' : 'illustrations');
            }
        }
        if (mode === 'byDay' || mode === 'byDayAndAuthor') {
            const { year, month, day } = getDateParts();
            parts.push(`${year}-${month}-${day}`);
            // Add type subdirectory only if baseDirectory doesn't already end with a type directory
            if (fileType && !alreadyHasTypeDir) {
                parts.push(fileType === 'novel' ? 'novels' : 'illustrations');
            }
        }
        // Handle author-based organization
        if (mode === 'byAuthor' || mode === 'byAuthorAndTag' || mode === 'byDateAndAuthor' || mode === 'byDayAndAuthor') {
            const author = metadata?.author ? this.sanitizeDirectoryName(metadata.author) : 'unknown';
            parts.push(author);
        }
        // Handle tag-based organization
        if (mode === 'byTag' || mode === 'byAuthorAndTag') {
            const tag = metadata?.tag ? this.sanitizeDirectoryName(metadata.tag) : 'untagged';
            parts.push(tag);
        }
        return parts.length > 0 ? (0, node_path_1.join)(baseDirectory, ...parts) : baseDirectory;
    }
    async findUniquePath(directory, fileName) {
        await (0, fs_1.ensureDir)(directory);
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
    /**
     * Save metadata JSON file to hidden metadata directory (data/metadata)
     * instead of alongside the downloaded file to keep download directory clean
     * @param filePath Path to the downloaded file
     * @param metadata Metadata to save
     * @returns Path to the saved metadata file
     * @throws Error if metadata cannot be saved
     */
    async saveMetadata(filePath, metadata) {
        try {
            // Validate input
            if (!metadata || !metadata.pixiv_id || !metadata.type) {
                throw new Error('Invalid metadata: pixiv_id and type are required');
            }
            // Get metadata directory path based on database path
            // If databasePath is ./data/pixiv-downloader.db, metadata will be in ./data/metadata
            const databasePath = this.storage.databasePath || './data/pixiv-downloader.db';
            const dataDir = (0, node_path_1.dirname)((0, node_path_1.resolve)(databasePath));
            const metadataDir = (0, node_path_1.join)(dataDir, 'metadata');
            // Ensure metadata directory exists
            try {
                await (0, fs_1.ensureDir)(metadataDir);
            }
            catch (error) {
                throw new Error(`Failed to create metadata directory at ${metadataDir}: ${error instanceof Error ? error.message : String(error)}`);
            }
            // Use pixiv_id and type to create unique filename
            // Format: {pixiv_id}_{type}.json (e.g., 123456_novel.json)
            // For multi-page illustrations, include page number: {pixiv_id}_{type}_p{page}.json
            const pixivId = String(metadata.pixiv_id).replace(/[^a-zA-Z0-9_-]/g, '_');
            const type = metadata.type;
            const pageSuffix = metadata.page_number !== undefined
                ? `_p${metadata.page_number}`
                : '';
            const metadataFileName = `${pixivId}_${type}${pageSuffix}.json`;
            const metadataPath = (0, node_path_1.join)(metadataDir, metadataFileName);
            // Serialize metadata to JSON
            let jsonContent;
            try {
                jsonContent = JSON.stringify(metadata, null, 2);
            }
            catch (error) {
                throw new Error(`Failed to serialize metadata to JSON: ${error instanceof Error ? error.message : String(error)}`);
            }
            // Write metadata file
            try {
                await node_fs_1.promises.writeFile(metadataPath, jsonContent, 'utf-8');
            }
            catch (error) {
                throw new Error(`Failed to write metadata file to ${metadataPath}: ${error instanceof Error ? error.message : String(error)}`);
            }
            return metadataPath;
        }
        catch (error) {
            // Re-throw with context if it's already an Error with message
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Unexpected error saving metadata: ${String(error)}`);
        }
    }
}
exports.FileService = FileService;
//# sourceMappingURL=FileService.js.map