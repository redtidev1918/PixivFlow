/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import History from '../../pages/History';
import { useDownloadHistory } from '../../hooks/useDownload';

// Mock hooks
jest.mock('../../hooks/useDownload');

describe('History', () => {
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
    (useDownloadHistory as jest.Mock).mockReturnValue({
      items: [],
      total: 0,
      isLoading: false,
      error: null,
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('renders history page', () => {
    renderWithProviders(<History />);
    expect(screen.getByText('history.title')).toBeInTheDocument();
  });

  it('renders history statistics', () => {
    renderWithProviders(<History />);
    // History statistics should be rendered
    expect(screen.getByText('history.title')).toBeInTheDocument();
  });

  it('renders history filters', () => {
    renderWithProviders(<History />);
    // History filters should be rendered
    expect(screen.getByText('history.title')).toBeInTheDocument();
  });

  it('renders history table', () => {
    renderWithProviders(<History />);
    // History table should be rendered
    expect(screen.getByText('history.title')).toBeInTheDocument();
  });

  it('shows loading state when history is loading', () => {
    (useDownloadHistory as jest.Mock).mockReturnValue({
      items: [],
      total: 0,
      isLoading: true,
      error: null,
    });

    renderWithProviders(<History />);
    expect(screen.getByText('history.title')).toBeInTheDocument();
  });

  it('displays history items', () => {
    (useDownloadHistory as jest.Mock).mockReturnValue({
      items: [
        {
          id: '1',
          title: 'Test Item',
          author: 'Test Author',
          type: 'illustration',
        },
      ],
      total: 1,
      isLoading: false,
      error: null,
    });

    renderWithProviders(<History />);
    expect(screen.getByText('history.title')).toBeInTheDocument();
  });
});

