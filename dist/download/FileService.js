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
     * Save metadata JSON file alongside the downloaded file
     * @param filePath Path to the downloaded file
     * @param metadata Metadata to save
     */
    async saveMetadata(filePath, metadata) {
        const fileName = (0, node_path_1.basename)(filePath);
        const { baseName } = this.splitExtension(fileName);
        const metadataPath = (0, node_path_1.join)((0, node_path_1.dirname)(filePath), `${baseName}.json`);
        const jsonContent = JSON.stringify(metadata, null, 2);
        await node_fs_1.promises.writeFile(metadataPath, jsonContent, 'utf-8');
        return metadataPath;
    }
}
exports.FileService = FileService;
//# sourceMappingURL=FileService.js.map