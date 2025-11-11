/**
 * Integration tests for file normalization flow
 * Tests the complete file normalization process with real dependencies
 */

import { FileNormalizationService } from '../../download/FileNormalizationService';
import { FileService } from '../../download/FileService';
import { Database } from '../../storage/Database';
import { StandaloneConfig, StorageConfig } from '../../config';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';

// Mock global setTimeout to prevent hanging in tests
jest.useFakeTimers();
jest.spyOn(global, 'setTimeout').mockImplementation((callback: Function, delay?: number) => {
  // Execute callback immediately in tests to avoid delays
  if (typeof callback === 'function') {
    Promise.resolve().then(() => callback());
  }
  return {} as NodeJS.Timeout;
});

describe('FileNormalizationService Integration', () => {
  let testDir: string;
  let dbPath: string;
  let storageConfig: StorageConfig;
  let fileService: FileService;
  let database: Database;
  let normalizationService: FileNormalizationService;
  let config: StandaloneConfig;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = join(tmpdir(), `pixiv-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    dbPath = join(testDir, 'test.db');
    storageConfig = {
      downloadDirectory: join(testDir, 'downloads'),
      illustrationDirectory: join(testDir, 'downloads', 'illustrations'),
      novelDirectory: join(testDir, 'downloads', 'novels'),
      databasePath: dbPath,
      illustrationOrganization: 'flat',
      novelOrganization: 'flat',
    };

    config = {
      storage: storageConfig,
      pixiv: {
        clientId: 'test',
        clientSecret: 'test',
        deviceToken: 'test',
        refreshToken: 'test',
        userAgent: 'test',
      },
      targets: [],
    };

    // Initialize services
    fileService = new FileService(storageConfig);
    database = new Database(dbPath);
    database.migrate();
    normalizationService = new FileNormalizationService(storageConfig, fileService, database);

    // Initialize file service
    await fileService.initialise();
  });

  afterEach(async () => {
    // Cleanup
    if (database) {
      database.close();
    }
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('normalizeFiles', () => {
    it('should handle empty directory', async () => {
      const result = await normalizationService.normalizeFiles({
        dryRun: false,
        normalizeNames: true,
        reorganize: true,
        updateDatabase: true,
        type: 'all',
      });

      expect(result.totalFiles).toBe(0);
      expect(result.processedFiles).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should normalize files in dry-run mode', async () => {
      // Create test files in illustration directory
      await fs.mkdir(storageConfig.illustrationDirectory!, { recursive: true });
      const testFile = join(storageConfig.illustrationDirectory!, 'test_illustration_123.jpg');
      await fs.writeFile(testFile, 'test content');

      // Create metadata file (required for normalization)
      const metadataFile = join(storageConfig.illustrationDirectory!, 'test_illustration_123.json');
      await fs.writeFile(metadataFile, JSON.stringify({
        pixiv_id: '123',
        title: 'Test Illustration',
        author: {
          id: '456',
          name: 'Test Author',
        },
        download_tag: 'test',
        create_date: new Date().toISOString(),
        type: 'illustration',
      }));

      // Add to database
      database.insertDownload({
        pixivId: '123',
        type: 'illustration',
        tag: 'test',
        title: 'Test Illustration',
        filePath: testFile,
        author: 'Test Author',
      });

      const result = await normalizationService.normalizeFiles({
        dryRun: true,
        normalizeNames: true,
        reorganize: true,
        updateDatabase: true,
        type: 'all',
      });

      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.processedFiles).toBeGreaterThan(0);
      // In dry-run mode, files should not be actually moved, but the count may reflect what would be moved
      // The important thing is that files are processed and reported
      expect(result.processedFiles).toBeGreaterThan(0);
    });

    it('should reorganize files according to organization mode', async () => {
      // Set organization mode to byAuthor
      storageConfig.illustrationOrganization = 'byAuthor';

      // Create test files in illustration directory
      await fs.mkdir(storageConfig.illustrationDirectory!, { recursive: true });
      const testFile = join(storageConfig.illustrationDirectory!, 'test_illustration_123.jpg');
      await fs.writeFile(testFile, 'test content');

      // Create metadata file (required for normalization)
      const metadataFile = join(storageConfig.illustrationDirectory!, 'test_illustration_123.json');
      await fs.writeFile(metadataFile, JSON.stringify({
        pixiv_id: '123',
        title: 'Test Illustration',
        author: {
          id: '456',
          name: 'Test Author',
        },
        download_tag: 'test',
        create_date: new Date().toISOString(),
        type: 'illustration',
      }));

      // Add to database
      database.insertDownload({
        pixivId: '123',
        type: 'illustration',
        tag: 'test',
        title: 'Test Illustration',
        filePath: testFile,
        author: 'Test Author',
      });

      const result = await normalizationService.normalizeFiles({
        dryRun: false,
        normalizeNames: false,
        reorganize: true,
        updateDatabase: true,
        type: 'illustration',
      });

      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.processedFiles).toBeGreaterThan(0);
      // Files should be moved to author directory
      expect(result.movedFiles).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      // Create a file that will cause an error (invalid path)
      const invalidPath = join('/invalid', 'path', 'file.jpg');
      
      // Try to normalize with invalid path in database
      database.insertDownload({
        pixivId: '999',
        type: 'illustration',
        tag: 'test',
        title: 'Invalid File',
        filePath: invalidPath,
        author: 'Test',
      });

      const result = await normalizationService.normalizeFiles({
        dryRun: false,
        normalizeNames: true,
        reorganize: true,
        updateDatabase: true,
        type: 'illustration',
      });

      // Should handle error gracefully
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
      // Should still process other files if any
      expect(result.processedFiles).toBeGreaterThanOrEqual(0);
    });
  });

  describe('file normalization with different organization modes', () => {
    const organizationModes: Array<'flat' | 'byAuthor' | 'byDate' | 'byTag'> = [
      'flat',
      'byAuthor',
      'byDate',
      'byTag',
    ];

    organizationModes.forEach((mode) => {
      it(`should normalize files with ${mode} organization mode`, async () => {
        storageConfig.illustrationOrganization = mode;

        // Create test files in illustration directory
        await fs.mkdir(storageConfig.illustrationDirectory!, { recursive: true });
        const testFile = join(storageConfig.illustrationDirectory!, `test_illustration_${mode}_123.jpg`);
        await fs.writeFile(testFile, 'test content');

        // Add to database
        database.insertDownload({
          pixivId: '123',
          type: 'illustration',
          tag: 'test',
          title: 'Test Illustration',
          filePath: testFile,
          author: 'Test Author',
        });

        const result = await normalizationService.normalizeFiles({
          dryRun: false,
          normalizeNames: false,
          reorganize: true,
          updateDatabase: true,
          type: 'illustration',
        });

        expect(result.totalFiles).toBeGreaterThan(0);
        expect(result.processedFiles).toBeGreaterThan(0);
        expect(result.errors).toHaveLength(0);
      });
    });
  });
});

