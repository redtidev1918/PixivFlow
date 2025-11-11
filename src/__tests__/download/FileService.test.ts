import { FileService, FileMetadata, PixivMetadata } from '../../download/FileService';
import { StorageConfig } from '../../config';
import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { ensureDir } from '../../utils/fs';

// Mock dependencies
jest.mock('node:fs', () => ({
  promises: {
    writeFile: jest.fn(),
    access: jest.fn(),
    readFile: jest.fn(),
  },
}));

jest.mock('../../utils/fs', () => ({
  ensureDir: jest.fn(),
}));

describe('FileService', () => {
  let fileService: FileService;
  let mockStorage: StorageConfig;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockEnsureDir = ensureDir as jest.MockedFunction<typeof ensureDir>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = {
      downloadDirectory: '/test/downloads',
      illustrationDirectory: '/test/downloads/illustrations',
      novelDirectory: '/test/downloads/novels',
      databasePath: './data/pixiv-downloader.db',
    } as StorageConfig;
    fileService = new FileService(mockStorage);
  });

  describe('initialise', () => {
    it('should create all required directories', async () => {
      await fileService.initialise();

      expect(mockEnsureDir).toHaveBeenCalledWith('/test/downloads');
      expect(mockEnsureDir).toHaveBeenCalledWith('/test/downloads/illustrations');
      expect(mockEnsureDir).toHaveBeenCalledWith('/test/downloads/novels');
    });

    it('should create only download directory when illustration and novel directories are not set', async () => {
      const storageWithoutSubdirs: StorageConfig = {
        downloadDirectory: '/test/downloads',
        databasePath: './data/pixiv-downloader.db',
      } as StorageConfig;
      const service = new FileService(storageWithoutSubdirs);

      await service.initialise();

      expect(mockEnsureDir).toHaveBeenCalledWith('/test/downloads');
      expect(mockEnsureDir).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveImage', () => {
    it('should save image to illustration directory with flat organization', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('File not found'));
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      const buffer = new ArrayBuffer(100);
      const fileName = 'test.jpg';
      const result = await fileService.saveImage(buffer, fileName);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test.jpg'),
        Buffer.from(buffer)
      );
      expect(result).toContain('test.jpg');
    });

    it('should use download directory when illustration directory is not set', async () => {
      const storage: StorageConfig = {
        downloadDirectory: '/test/downloads',
        illustrationOrganization: 'flat',
        databasePath: './data/pixiv-downloader.db',
      } as StorageConfig;
      const service = new FileService(storage);
      mockFs.access.mockRejectedValueOnce(new Error('File not found'));
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      const buffer = new ArrayBuffer(100);
      await service.saveImage(buffer, 'test.jpg');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/test/downloads'),
        expect.any(Buffer)
      );
    });

    it('should organize image by author when mode is byAuthor', async () => {
      mockStorage.illustrationOrganization = 'byAuthor';
      const service = new FileService(mockStorage);
      mockFs.access.mockRejectedValueOnce(new Error('File not found'));
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      const buffer = new ArrayBuffer(100);
      const metadata: FileMetadata = { author: 'Test Author' };
      await service.saveImage(buffer, 'test.jpg', metadata);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('Test_Author'),
        expect.any(Buffer)
      );
    });
  });

  describe('saveText', () => {
    it('should save text to novel directory with flat organization', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('File not found'));
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      const content = 'Test novel content';
      const fileName = 'test.txt';
      const result = await fileService.saveText(content, fileName);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test.txt'),
        content,
        'utf-8'
      );
      expect(result).toContain('test.txt');
    });

    it('should use download directory when novel directory is not set', async () => {
      const storage: StorageConfig = {
        downloadDirectory: '/test/downloads',
        novelOrganization: 'flat',
        databasePath: './data/pixiv-downloader.db',
      } as StorageConfig;
      const service = new FileService(storage);
      mockFs.access.mockRejectedValueOnce(new Error('File not found'));
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      await service.saveText('content', 'test.txt');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/test/downloads'),
        'content',
        'utf-8'
      );
    });
  });

  describe('sanitizeFileName', () => {
    it('should replace invalid characters with underscore', () => {
      expect(fileService.sanitizeFileName('test/file:name?.txt')).toBe('test_file_name_.txt');
    });

    it('should replace multiple spaces with single space', () => {
      expect(fileService.sanitizeFileName('test    file.txt')).toBe('test file.txt');
    });

    it('should trim whitespace', () => {
      expect(fileService.sanitizeFileName('  test.txt  ')).toBe('test.txt');
    });

    it('should handle empty string', () => {
      expect(fileService.sanitizeFileName('')).toBe('');
    });
  });

  describe('sanitizeDirectoryName', () => {
    it('should replace invalid characters with underscore', () => {
      expect(fileService.sanitizeDirectoryName('test/dir:name?.txt')).toBe('test_dir_name__txt');
    });

    it('should replace spaces with underscore', () => {
      expect(fileService.sanitizeDirectoryName('test dir name')).toBe('test_dir_name');
    });

    it('should replace dots with underscore', () => {
      expect(fileService.sanitizeDirectoryName('test.dir')).toBe('test_dir');
    });

    it('should remove leading and trailing underscores', () => {
      expect(fileService.sanitizeDirectoryName('___test___')).toBe('test');
    });

    it('should return unknown for empty string after sanitization', () => {
      expect(fileService.sanitizeDirectoryName('')).toBe('unknown');
    });

    it('should return unknown for string with only invalid characters', () => {
      expect(fileService.sanitizeDirectoryName('///')).toBe('unknown');
    });
  });

  describe('getOrganizedDirectory', () => {
    it('should return base directory for flat mode', () => {
      const result = fileService.getOrganizedDirectory('/base', 'flat');
      expect(result).toBe('/base');
    });

    it('should organize by author for byAuthor mode', () => {
      const metadata: FileMetadata = { author: 'Test Author' };
      const result = fileService.getOrganizedDirectory('/base', 'byAuthor', metadata);
      expect(result).toContain('Test_Author');
    });

    it('should organize by tag for byTag mode', () => {
      const metadata: FileMetadata = { tag: 'test-tag' };
      const result = fileService.getOrganizedDirectory('/base', 'byTag', metadata);
      expect(result).toContain('test-tag');
    });

    it('should organize by date for byDate mode', () => {
      const metadata: FileMetadata = { date: new Date('2023-06-15') };
      const result = fileService.getOrganizedDirectory('/base', 'byDate', metadata);
      expect(result).toContain('2023-06');
    });

    it('should organize by day for byDay mode', () => {
      const metadata: FileMetadata = { date: new Date('2023-06-15') };
      const result = fileService.getOrganizedDirectory('/base', 'byDay', metadata);
      expect(result).toContain('2023-06-15');
    });

    it('should organize by download date for byDownloadDate mode', () => {
      const result = fileService.getOrganizedDirectory('/base', 'byDownloadDate');
      const today = new Date();
      const expectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      expect(result).toContain(expectedMonth);
    });

    it('should organize by download day for byDownloadDay mode', () => {
      const result = fileService.getOrganizedDirectory('/base', 'byDownloadDay');
      const today = new Date();
      const expectedDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(result).toContain(expectedDay);
    });

    it('should organize by date and author for byDateAndAuthor mode', () => {
      const metadata: FileMetadata = { 
        date: new Date('2023-06-15'),
        author: 'Test Author'
      };
      const result = fileService.getOrganizedDirectory('/base', 'byDateAndAuthor', metadata);
      expect(result).toContain('2023-06');
      expect(result).toContain('Test_Author');
    });

    it('should organize by day and author for byDayAndAuthor mode', () => {
      const metadata: FileMetadata = { 
        date: new Date('2023-06-15'),
        author: 'Test Author'
      };
      const result = fileService.getOrganizedDirectory('/base', 'byDayAndAuthor', metadata);
      expect(result).toContain('2023-06-15');
      expect(result).toContain('Test_Author');
    });

    it('should organize by author and tag for byAuthorAndTag mode', () => {
      const metadata: FileMetadata = { 
        author: 'Test Author',
        tag: 'test-tag'
      };
      const result = fileService.getOrganizedDirectory('/base', 'byAuthorAndTag', metadata);
      expect(result).toContain('Test_Author');
      expect(result).toContain('test-tag');
    });

    it('should add type subdirectory for illustration when base directory does not have type dir', () => {
      const metadata: FileMetadata = { date: new Date('2023-06-15') };
      const result = fileService.getOrganizedDirectory('/base', 'byDate', metadata, 'illustration');
      expect(result).toContain('illustrations');
    });

    it('should add type subdirectory for novel when base directory does not have type dir', () => {
      const metadata: FileMetadata = { date: new Date('2023-06-15') };
      const result = fileService.getOrganizedDirectory('/base', 'byDate', metadata, 'novel');
      expect(result).toContain('novels');
    });

    it('should not add type subdirectory when base directory already ends with type dir', () => {
      const metadata: FileMetadata = { date: new Date('2023-06-15') };
      const result = fileService.getOrganizedDirectory('/base/illustrations', 'byDate', metadata, 'illustration');
      // Should not have duplicate 'illustrations' directory
      const parts = result.split('/');
      expect(parts.filter(p => p === 'illustrations').length).toBe(1);
    });

    it('should use unknown for missing author', () => {
      const result = fileService.getOrganizedDirectory('/base', 'byAuthor');
      expect(result).toContain('unknown');
    });

    it('should use untagged for missing tag', () => {
      const result = fileService.getOrganizedDirectory('/base', 'byTag');
      expect(result).toContain('untagged');
    });

    it('should handle date as string', () => {
      const metadata: FileMetadata = { date: '2023-06-15' };
      const result = fileService.getOrganizedDirectory('/base', 'byDate', metadata);
      expect(result).toContain('2023-06');
    });

    it('should use current date when metadata date is missing', () => {
      const result = fileService.getOrganizedDirectory('/base', 'byDate');
      const today = new Date();
      const expectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      expect(result).toContain(expectedMonth);
    });
  });

  describe('findUniquePath', () => {
    it('should return path when file does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('File not found'));

      const result = await fileService.findUniquePath('/test/dir', 'test.jpg');

      expect(mockEnsureDir).toHaveBeenCalledWith('/test/dir');
      expect(result).toBe(join('/test/dir', 'test.jpg'));
    });

    it('should add suffix when file exists', async () => {
      mockFs.access
        .mockResolvedValueOnce(undefined) // File exists
        .mockRejectedValueOnce(new Error('File not found')); // Suffix version does not exist

      const result = await fileService.findUniquePath('/test/dir', 'test.jpg');

      expect(result).toBe(join('/test/dir', 'test_1.jpg'));
    });

    it('should try multiple suffixes until finding unique path', async () => {
      mockFs.access
        .mockResolvedValueOnce(undefined) // test.jpg exists
        .mockResolvedValueOnce(undefined) // test_1.jpg exists
        .mockResolvedValueOnce(undefined) // test_2.jpg exists
        .mockRejectedValueOnce(new Error('File not found')); // test_3.jpg does not exist

      const result = await fileService.findUniquePath('/test/dir', 'test.jpg');

      expect(result).toBe(join('/test/dir', 'test_3.jpg'));
    });

    it('should throw error after 1000 attempts', async () => {
      // Mock all 1000 attempts to return that file exists
      for (let i = 0; i < 1000; i++) {
        mockFs.access.mockResolvedValueOnce(undefined);
      }

      await expect(
        fileService.findUniquePath('/test/dir', 'test.jpg')
      ).rejects.toThrow('Unable to find unique file name');
    });

    it('should handle file without extension', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('File not found'));

      const result = await fileService.findUniquePath('/test/dir', 'test');

      expect(result).toBe(join('/test/dir', 'test'));
    });
  });

  describe('saveMetadata', () => {
    it('should save metadata to metadata directory', async () => {
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      const metadata: PixivMetadata = {
        pixiv_id: '123456',
        title: 'Test Illustration',
        author: { id: '12345', name: 'Test Author' },
        tags: [{ name: 'test' }],
        original_url: 'https://example.com',
        create_date: '2023-06-15',
        type: 'illustration',
      };

      const result = await fileService.saveMetadata('/test/file.jpg', metadata);

      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('123456_illustration.json'),
        expect.stringContaining('"pixiv_id"'),
        'utf-8'
      );
      expect(result).toContain('123456_illustration.json');
    });

    it('should include page number in metadata filename for multi-page illustrations', async () => {
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      const metadata: PixivMetadata = {
        pixiv_id: '123456',
        title: 'Test Illustration',
        author: { id: '12345', name: 'Test Author' },
        tags: [{ name: 'test' }],
        original_url: 'https://example.com',
        create_date: '2023-06-15',
        type: 'illustration',
        page_number: 2,
        total_pages: 3,
      };

      const result = await fileService.saveMetadata('/test/file.jpg', metadata);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('123456_illustration_p2.json'),
        expect.any(String),
        'utf-8'
      );
      expect(result).toContain('123456_illustration_p2.json');
    });

    it('should throw error for invalid metadata', async () => {
      const invalidMetadata = {} as PixivMetadata;

      await expect(
        fileService.saveMetadata('/test/file.jpg', invalidMetadata)
      ).rejects.toThrow('Invalid metadata');
    });

    it('should sanitize pixiv_id in filename', async () => {
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      const metadata: PixivMetadata = {
        pixiv_id: '123/456',
        title: 'Test',
        author: { id: '12345', name: 'Test Author' },
        tags: [],
        original_url: 'https://example.com',
        create_date: '2023-06-15',
        type: 'illustration',
      };

      await fileService.saveMetadata('/test/file.jpg', metadata);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('123_456_illustration.json'),
        expect.any(String),
        'utf-8'
      );
    });

    it('should handle errors when creating metadata directory', async () => {
      mockEnsureDir.mockRejectedValueOnce(new Error('Permission denied'));

      const metadata: PixivMetadata = {
        pixiv_id: '123456',
        title: 'Test',
        author: { id: '12345', name: 'Test Author' },
        tags: [],
        original_url: 'https://example.com',
        create_date: '2023-06-15',
        type: 'illustration',
      };

      await expect(
        fileService.saveMetadata('/test/file.jpg', metadata)
      ).rejects.toThrow('Failed to create metadata directory');
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);

      const result = await fileService.fileExists('/test/file.jpg');

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith('/test/file.jpg');
    });

    it('should return false when file does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('File not found'));

      const result = await fileService.fileExists('/test/file.jpg');

      expect(result).toBe(false);
    });
  });

  describe('readMetadata', () => {
    it('should read metadata from metadata directory', async () => {
      const metadata: PixivMetadata = {
        pixiv_id: '123456',
        title: 'Test Illustration',
        author: { id: '12345', name: 'Test Author' },
        tags: [{ name: 'test' }],
        original_url: 'https://example.com',
        create_date: '2023-06-15',
        type: 'illustration',
      };

      mockFs.access
        .mockResolvedValueOnce(undefined); // File exists
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(metadata));

      const result = await fileService.readMetadata('/test/123456.jpg');

      expect(result).toEqual(metadata);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('123456_illustration.json'),
        'utf-8'
      );
    });

    it('should try novel type when illustration metadata not found', async () => {
      const metadata: PixivMetadata = {
        pixiv_id: '123456',
        title: 'Test Novel',
        author: { id: '12345', name: 'Test Author' },
        tags: [{ name: 'test' }],
        original_url: 'https://example.com',
        create_date: '2023-06-15',
        type: 'novel',
      };

      mockFs.access
        .mockRejectedValueOnce(new Error('Not found')) // illustration not found
        .mockResolvedValueOnce(undefined); // novel found
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(metadata));

      const result = await fileService.readMetadata('/test/123456.txt');

      expect(result).toEqual(metadata);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('123456_novel.json'),
        'utf-8'
      );
    });

    it('should return null when pixiv_id cannot be extracted from filename', async () => {
      const result = await fileService.readMetadata('/test/invalid.jpg');

      expect(result).toBeNull();
    });

    it('should return null when metadata file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const result = await fileService.readMetadata('/test/123456.jpg');

      expect(result).toBeNull();
    });

    it('should handle page number in filename', async () => {
      const metadata: PixivMetadata = {
        pixiv_id: '123456',
        title: 'Test Illustration',
        author: { id: '12345', name: 'Test Author' },
        tags: [{ name: 'test' }],
        original_url: 'https://example.com',
        create_date: '2023-06-15',
        type: 'illustration',
        page_number: 2,
      };

      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(metadata));

      const result = await fileService.readMetadata('/test/123456_2.jpg');

      expect(result).toEqual(metadata);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('123456_illustration_p2.json'),
        'utf-8'
      );
    });

    it('should try without page suffix if page-specific metadata not found', async () => {
      const metadata: PixivMetadata = {
        pixiv_id: '123456',
        title: 'Test Illustration',
        author: { id: '12345', name: 'Test Author' },
        tags: [{ name: 'test' }],
        original_url: 'https://example.com',
        create_date: '2023-06-15',
        type: 'illustration',
      };

      mockFs.access
        .mockRejectedValueOnce(new Error('Not found')) // page-specific not found
        .mockResolvedValueOnce(undefined); // without page suffix found
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(metadata));

      const result = await fileService.readMetadata('/test/123456_2.jpg');

      expect(result).toEqual(metadata);
    });

    it('should return null when metadata JSON is invalid', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValueOnce('invalid json');

      const result = await fileService.readMetadata('/test/123456.jpg');

      expect(result).toBeNull();
    });
  });

  describe('writeMetadata', () => {
    it('should call saveMetadata', async () => {
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      const metadata: PixivMetadata = {
        pixiv_id: '123456',
        title: 'Test',
        author: { id: '12345', name: 'Test Author' },
        tags: [],
        original_url: 'https://example.com',
        create_date: '2023-06-15',
        type: 'illustration',
      };

      await fileService.writeMetadata('/test/file.jpg', metadata);

      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });
});

