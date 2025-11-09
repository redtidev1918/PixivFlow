import { FileService } from './FileService';
import { StorageConfig } from '../config';
import { Database } from '../storage/Database';
export interface NormalizationResult {
    totalFiles: number;
    processedFiles: number;
    movedFiles: number;
    renamedFiles: number;
    updatedDatabase: number;
    errors: Array<{
        file: string;
        error: string;
    }>;
    skippedFiles: number;
}
export interface FileNormalizationOptions {
    dryRun?: boolean;
    normalizeNames?: boolean;
    reorganize?: boolean;
    updateDatabase?: boolean;
    type?: 'illustration' | 'novel' | 'all';
}
export declare class FileNormalizationService {
    private readonly storage;
    private readonly fileService;
    private readonly database;
    constructor(storage: StorageConfig, fileService: FileService, database: Database);
    /**
     * Normalize all downloaded files according to current configuration
     */
    normalizeFiles(options?: FileNormalizationOptions): Promise<NormalizationResult>;
    private normalizeType;
    private normalizeFile;
    private normalizeFileName;
    private loadMetadataForFile;
    private updateDatabasePath;
    private updateMetadataFile;
    private findUniquePath;
    private splitExtension;
    private getAllFiles;
    private mergeResults;
}
//# sourceMappingURL=FileNormalizationService.d.ts.map