/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Files from '../../pages/Files';
import { fileService } from '../../services/fileService';
import { useFiles, useFilePreview, useFileNormalize } from '../../hooks/useFiles';
import type { FileItem as ApiFileItem } from '../../services/api/types';

// Mock services
jest.mock('../../services/fileService');
jest.mock('../../hooks/useFiles', () => ({
  useFiles: jest.fn(),
  useFilePreview: jest.fn(),
  useFileNormalize: jest.fn(),
}));

const mockFileService = fileService as jest.Mocked<typeof fileService>;
const mockUseFiles = useFiles as jest.MockedFunction<typeof useFiles>;
const mockUseFilePreview = useFilePreview as jest.MockedFunction<typeof useFilePreview>;
const mockUseFileNormalize = useFileNormalize as jest.MockedFunction<typeof useFileNormalize>;

const createFileItem = (overrides: Partial<ApiFileItem> = {}): ApiFileItem => ({
  name: 'test.jpg',
  path: '/test/test.jpg',
  type: 'file',
  size: 1024,
  modified: new Date().toISOString(),
  downloadedAt: new Date().toISOString(),
  extension: '.jpg',
  ...overrides,
});

const createDirectoryItem = (overrides: Partial<ApiFileItem> = {}): ApiFileItem => ({
  name: 'folder',
  path: '/test/folder',
  type: 'directory',
  modified: new Date().toISOString(),
  ...overrides,
});

describe('File Management Integration Flow', () => {
  let queryClient: QueryClient;
  const mockDeleteFileAsync = jest.fn<Promise<void>, [{ id: string; path?: string; type?: string }]>();
  const mockRefetch = jest.fn();
  const mockPreviewRefetch = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
    mockDeleteFileAsync.mockResolvedValue(undefined);
    mockRefetch.mockReset();
    mockPreviewRefetch.mockReset();

    // Setup default mocks
    mockUseFiles.mockReturnValue({
      files: [createFileItem()],
      directories: [createDirectoryItem()],
      currentPath: '/',
      isLoading: false,
      error: null,
      refetch: mockRefetch,
      deleteFile: jest.fn(),
      deleteFileAsync: mockDeleteFileAsync,
      isDeleting: false,
    });

    mockUseFilePreview.mockReturnValue({
      previewUrl: 'data:image/jpeg;base64,test',
      previewBlob: undefined,
      isLoading: false,
      error: null,
      refetch: mockPreviewRefetch,
    });

    mockUseFileNormalize.mockReturnValue({
      normalizeAsync: jest.fn(),
      normalize: jest.fn(),
      isNormalizing: false,
      normalizeResult: undefined,
    });

    mockFileService.listFiles = jest.fn().mockResolvedValue({
      data: {
        data: {
          files: [createFileItem()],
          directories: [createDirectoryItem()],
        },
      },
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('should complete full file management flow', async () => {
    const user = userEvent.setup();

    renderWithProviders(<Files />);

    expect(screen.getByText('files.title')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'test.jpg' })).toBeInTheDocument();
    });

    expect(screen.getByText('files.typeDirectory')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /files\.delete/ })).toBeInTheDocument();
  }, 10000);

  it('should handle file filtering flow', async () => {
    const user = userEvent.setup();

    renderWithProviders(<Files />);

    const filterInput = screen.getByPlaceholderText('files.searchPlaceholder') as HTMLInputElement;
    await user.type(filterInput, 'test');
    expect(filterInput).toHaveValue('test');

    expect(screen.getByText('files.filterAll')).toBeInTheDocument();
  }, 10000);
});

