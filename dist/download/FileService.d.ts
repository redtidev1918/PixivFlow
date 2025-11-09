import { StorageConfig } from '../config';
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
    tags: Array<{
        name: string;
        translated_name?: string;
    }>;
    original_url: string;
    create_date: string;
    download_tag?: string;
    type: 'illustration' | 'novel';
    page_number?: number;
    total_pages?: number;
    total_bookmarks?: number;
    total_view?: number;
    bookmark_count?: number;
    view_count?: number;
    detected_language?: {
        code: string;
        name: string;
        is_chinese: boolean;
    };
}
export declare class FileService {
    private readonly storage;
    constructor(storage: StorageConfig);
    initialise(): Promise<void>;
    saveImage(buffer: ArrayBuffer, fileName: string, metadata?: FileMetadata): Promise<string>;
    saveText(content: string, fileName: string, metadata?: FileMetadata): Promise<string>;
    sanitizeFileName(name: string): string;
    sanitizeDirectoryName(name: string): string;
    private getOrganizedDirectory;
    private findUniquePath;
    private splitExtension;
    /**
     * Save metadata JSON file to hidden metadata directory (data/metadata)
     * instead of alongside the downloaded file to keep download directory clean
     * @param filePath Path to the downloaded file
     * @param metadata Metadata to save
     * @returns Path to the saved metadata file
     * @throws Error if metadata cannot be saved
     */
    saveMetadata(filePath: string, metadata: PixivMetadata): Promise<string>;
}
//# sourceMappingURL=FileService.d.ts.map