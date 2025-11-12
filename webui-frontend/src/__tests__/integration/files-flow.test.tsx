/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Files from '../../pages/Files';
import { fileService } from '../../services/fileService';
import { useFiles, useFilePreview } from '../../hooks/useFiles';

// Mock services
jest.mock('../../services/fileService');
jest.mock('../../hooks/useFiles');

const mockFileService = fileService as jest.Mocked<typeof fileService>;
const mockUseFiles = useFiles as jest.MockedFunction<typeof useFiles>;
const mockUseFilePreview = useFilePreview as jest.MockedFunction<typeof useFilePreview>;

describe('File Management Integration Flow', () => {
  let queryClient: QueryClient;
  const mockDeleteFile = jest.fn();
  const mockRefetch = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();

    // Setup default mocks
    mockUseFiles.mockReturnValue({
      files: [
        {
          name: 'test.jpg',
          path: '/test/test.jpg',
          size: 1024,
          type: 'image',
          modified: new Date().toISOString(),
        },
      ],
      directories: [],
      isLoading: false,
      error: null,
      deleteFile: mockDeleteFile,
      isDeleting: false,
      refetch: mockRefetch,
    });

    mockUseFilePreview.mockReturnValue({
      preview: null,
      isLoading: false,
      error: null,
      fetchPreview: jest.fn(),
    });

    mockFileService.listFiles = jest.fn().mockResolvedValue({
      data: {
        data: {
          files: [
            {
              name: 'test.jpg',
              path: '/test/test.jpg',
              size: 1024,
              type: 'image',
              modified: new Date().toISOString(),
            },
          ],
          directories: [],
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

    // Step 1: Render files page
    renderWithProviders(<Files />);
    expect(screen.getByText(/files/i)).toBeInTheDocument();

    // Step 2: Browse files
    await waitFor(() => {
      expect(screen.getByText(/test\.jpg/i)).toBeInTheDocument();
    });

    // Step 3: Preview file
    mockUseFilePreview.mockReturnValueOnce({
      preview: {
        content: 'data:image/jpeg;base64,test',
        type: 'image',
      },
      isLoading: false,
      error: null,
      fetchPreview: jest.fn().mockResolvedValue({
        content: 'data:image/jpeg;base64,test',
        type: 'image',
      }),
    });

    const fileItem = screen.getByText(/test\.jpg/i);
    await user.click(fileItem);

    // Step 4: Delete file
    mockDeleteFile.mockResolvedValueOnce({});
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    if (deleteButton) {
      await user.click(deleteButton);
      await waitFor(() => {
        expect(mockDeleteFile).toHaveBeenCalled();
      });
    }
  }, 10000);

  it('should handle file filtering flow', async () => {
    const user = userEvent.setup();

    renderWithProviders(<Files />);

    // Apply filter
    const filterInput = screen.getByPlaceholderText(/filter/i);
    if (filterInput) {
      await user.type(filterInput, 'test');
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });
    }
  }, 10000);
});

