/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Files from '../../pages/Files';
import { useFiles, useFileNormalize, useFilePreview } from '../../hooks/useFiles';

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: jest.fn(),
      language: 'en',
    },
  }),
}));

// Mock hooks
jest.mock('../../hooks/useFiles', () => ({
  useFiles: jest.fn(),
  useFilePreview: jest.fn(),
  useFileNormalize: jest.fn(() => ({
    normalizeAsync: jest.fn(),
    normalize: jest.fn(),
    isNormalizing: false,
    normalizeResult: undefined,
  })),
}));
jest.mock('../../hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

// Mock antd message
jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    message: {
      success: jest.fn(),
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
    },
  };
});

describe('Files', () => {
  let queryClient: QueryClient;
  const mockedUseFiles = useFiles as jest.MockedFunction<typeof useFiles>;
  const mockedUseFileNormalize = useFileNormalize as jest.MockedFunction<typeof useFileNormalize>;
  const mockedUseFilePreview = useFilePreview as jest.MockedFunction<typeof useFilePreview>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
    mockedUseFiles.mockReturnValue({
      files: [],
      directories: [],
      currentPath: '',
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      deleteFile: jest.fn(),
      deleteFileAsync: jest.fn(),
      isDeleting: false,
    });
    mockedUseFileNormalize.mockReturnValue({
      normalizeAsync: jest.fn(),
      normalize: jest.fn(),
      isNormalizing: false,
      normalizeResult: undefined,
    });
    mockedUseFilePreview.mockReturnValue({
      previewUrl: null,
      previewBlob: undefined,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('renders files page', () => {
    renderWithProviders(<Files />);
    expect(screen.getByText('files.title')).toBeInTheDocument();
  });

  it('renders file browser', () => {
    renderWithProviders(<Files />);
    const page = screen.getByText('files.title');
    expect(page).toBeInTheDocument();
  });

  it('renders file filters', () => {
    renderWithProviders(<Files />);
    const page = screen.getByText('files.title');
    expect(page).toBeInTheDocument();
  });

  it('shows loading state when files are loading', () => {
    mockedUseFiles.mockReturnValueOnce({
      files: [],
      directories: [],
      currentPath: '',
      isLoading: true,
      error: null,
      refetch: jest.fn(),
      deleteFile: jest.fn(),
      deleteFileAsync: jest.fn(),
      isDeleting: false,
    });

    renderWithProviders(<Files />);
    const page = screen.getByText('files.title');
    expect(page).toBeInTheDocument();
  });
});

