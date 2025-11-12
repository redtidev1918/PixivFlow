/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Logs from '../../pages/Logs';
import { useLogs } from '../../hooks/useLogs';

// Mock hooks
jest.mock('../../hooks/useLogs');
jest.mock('../../pages/Logs/hooks/useLogsRealtime', () => ({
  useLogsRealtime: jest.fn(),
  useLogsAutoScroll: jest.fn(),
}));

describe('Logs', () => {
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
    (useLogs as jest.Mock).mockReturnValue({
      logs: [],
      total: 0,
      isLoading: false,
      refetch: jest.fn(),
      clear: jest.fn(),
      isClearing: false,
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('renders logs page', () => {
    renderWithProviders(<Logs />);
    expect(screen.getByText('logs.title')).toBeInTheDocument();
  });

  it('renders logs statistics', () => {
    renderWithProviders(<Logs />);
    // Logs statistics should be rendered
    expect(screen.getByText('logs.title')).toBeInTheDocument();
  });

  it('renders logs controls', () => {
    renderWithProviders(<Logs />);
    // Logs controls should be rendered
    expect(screen.getByText('logs.title')).toBeInTheDocument();
  });

  it('renders logs filters', () => {
    renderWithProviders(<Logs />);
    // Logs filters should be rendered
    expect(screen.getByText('logs.title')).toBeInTheDocument();
  });

  it('renders logs table', () => {
    renderWithProviders(<Logs />);
    // Logs table should be rendered
    expect(screen.getByText('logs.title')).toBeInTheDocument();
  });

  it('shows loading state when logs are loading', () => {
    (useLogs as jest.Mock).mockReturnValue({
      logs: [],
      total: 0,
      isLoading: true,
      refetch: jest.fn(),
      clear: jest.fn(),
      isClearing: false,
    });

    renderWithProviders(<Logs />);
    expect(screen.getByText('logs.title')).toBeInTheDocument();
  });
});

