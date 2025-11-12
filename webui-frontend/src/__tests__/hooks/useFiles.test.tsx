import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFiles, useRecentFiles, useFilePreview, useFileNormalize } from '../../hooks/useFiles';
import { fileService } from '../../services/fileService';

// Mock the file service
jest.mock('../../services/fileService', () => ({
  fileService: {
    listFiles: jest.fn(),
    getRecentFiles: jest.fn(),
    getFilePreview: jest.fn(),
    deleteFile: jest.fn(),
    normalizeFiles: jest.fn(),
  },
}));

// Mock useErrorHandler
jest.mock('../../hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

describe('useFiles', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('should fetch files successfully', async () => {
    const mockFiles = [
      { name: 'file1.jpg', path: '/path/to/file1.jpg', type: 'file' as const },
      { name: 'file2.png', path: '/path/to/file2.png', type: 'file' as const },
    ];
    const mockDirectories = [{ name: 'dir1', path: '/path/to/dir1', type: 'directory' as const }];

    (fileService.listFiles as jest.Mock<any>).mockResolvedValue({
      files: mockFiles,
      directories: mockDirectories,
      currentPath: '/path/to',
    });

    const { result } = renderHook(() => useFiles({ path: '/path/to' }), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.files).toEqual(mockFiles);
    expect(result.current.directories).toEqual(mockDirectories);
    expect(result.current.currentPath).toBe('/path/to');
  });

  it('should handle empty files list', async () => {
    (fileService.listFiles as jest.Mock<any>).mockResolvedValue({
      files: [],
      directories: [],
      currentPath: '',
    });

    const { result } = renderHook(() => useFiles(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.directories).toEqual([]);
  });

  it('should provide delete file function', () => {
    const { result } = renderHook(() => useFiles(), { wrapper });

    expect(result.current.deleteFile).toBeDefined();
    expect(typeof result.current.deleteFile).toBe('function');
    expect(result.current.deleteFileAsync).toBeDefined();
    expect(typeof result.current.deleteFileAsync).toBe('function');
  });

  it('should handle delete file mutation', async () => {
    (fileService.deleteFile as jest.Mock<any>).mockResolvedValue(undefined);
    (fileService.listFiles as jest.Mock<any>).mockResolvedValue({
      files: [],
      directories: [],
      currentPath: '',
    });

    const { result } = renderHook(() => useFiles(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    result.current.deleteFile({ id: 'test-file', path: '/test', type: 'illustration' });

    await waitFor(() => {
      expect(fileService.deleteFile).toHaveBeenCalledWith('test-file', {
        path: '/test',
        type: 'illustration',
      });
    });
  });
});

describe('useRecentFiles', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('should fetch recent files successfully', async () => {
    const mockFiles = [
      { name: 'recent1.jpg', path: '/path/to/recent1.jpg', type: 'file' as const },
    ];

    (fileService.getRecentFiles as jest.Mock<any>).mockResolvedValue({
      files: mockFiles,
    });

    const { result } = renderHook(() => useRecentFiles({ limit: 10 }), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.files).toEqual(mockFiles);
    expect(fileService.getRecentFiles).toHaveBeenCalledWith({ limit: 10 });
  });

  it('should handle empty recent files', async () => {
    (fileService.getRecentFiles as jest.Mock<any>).mockResolvedValue({
      files: [],
    });

    const { result } = renderHook(() => useRecentFiles(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.files).toEqual([]);
  });
});

describe('useFilePreview', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('should fetch file preview when path is provided', async () => {
    const mockBlob = new Blob(['test content'], { type: 'image/jpeg' });
    (fileService.getFilePreview as jest.Mock<any>).mockResolvedValue(mockBlob);

    const { result } = renderHook(() => useFilePreview('/path/to/file.jpg'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.previewBlob).toBe(mockBlob);
    expect(fileService.getFilePreview).toHaveBeenCalledWith('/path/to/file.jpg', undefined);
  });

  it('should not fetch when path is undefined', () => {
    const { result } = renderHook(() => useFilePreview(undefined), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(fileService.getFilePreview).not.toHaveBeenCalled();
  });
});

describe('useFileNormalize', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('should provide normalize function', () => {
    const { result } = renderHook(() => useFileNormalize(), { wrapper });

    expect(result.current.normalize).toBeDefined();
    expect(typeof result.current.normalize).toBe('function');
    expect(result.current.normalizeAsync).toBeDefined();
    expect(typeof result.current.normalizeAsync).toBe('function');
  });

  it('should handle normalize mutation', async () => {
    const mockResult = { normalized: 10, errors: [] };
    (fileService.normalizeFiles as jest.Mock<any>).mockResolvedValue(mockResult);

    const { result } = renderHook(() => useFileNormalize(), { wrapper });

    result.current.normalize({
      dryRun: true,
      normalizeNames: true,
      type: 'illustration',
    });

    await waitFor(() => {
      expect(fileService.normalizeFiles).toHaveBeenCalledWith({
        dryRun: true,
        normalizeNames: true,
        type: 'illustration',
      });
    });
  });
});

