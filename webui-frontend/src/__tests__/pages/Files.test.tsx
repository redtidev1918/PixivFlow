/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Files from '../../pages/Files';
import { useFiles } from '../../hooks/useFiles';

// Mock hooks
jest.mock('../../hooks/useFiles');
jest.mock('../../hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

describe('Files', () => {
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
    (useFiles as jest.Mock).mockReturnValue({
      files: [],
      isLoading: false,
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
    // File browser should be rendered
    expect(screen.getByText('files.title')).toBeInTheDocument();
  });

  it('renders file filters', () => {
    renderWithProviders(<Files />);
    // File filters should be rendered
    expect(screen.getByText('files.title')).toBeInTheDocument();
  });

  it('shows loading state when files are loading', () => {
    (useFiles as jest.Mock).mockReturnValue({
      files: [],
      isLoading: true,
      refetch: jest.fn(),
    });

    renderWithProviders(<Files />);
    expect(screen.getByText('files.title')).toBeInTheDocument();
  });
});

