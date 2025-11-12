/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { message } from 'antd';
import Dashboard from '../../pages/Dashboard';
import { useStatsOverview } from '../../hooks/useStats';

// Mock hooks
jest.mock('../../hooks/useStats');
jest.mock('antd', () => {
  const antd = jest.requireActual('antd');
  return {
    ...antd,
    message: {
      loading: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
    },
  };
});

describe('Dashboard', () => {
  let queryClient: QueryClient;
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
    (useStatsOverview as jest.Mock).mockReturnValue({
      stats: {
        totalDownloads: 100,
        illustrations: 80,
        novels: 20,
        recentDownloads: 10,
      },
      isLoading: false,
      refetch: mockRefetch,
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('renders dashboard title', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('dashboard.title')).toBeInTheDocument();
  });

  it('displays statistics cards', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('dashboard.totalDownloads')).toBeInTheDocument();
    expect(screen.getByText('dashboard.illustrations')).toBeInTheDocument();
    expect(screen.getByText('dashboard.novels')).toBeInTheDocument();
  });

  it('displays stat values', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('shows loading spinner when loading', () => {
    (useStatsOverview as jest.Mock).mockReturnValue({
      stats: null,
      isLoading: true,
      refetch: mockRefetch,
    });

    renderWithProviders(<Dashboard />);
    expect(document.querySelector('.ant-spin')).toBeInTheDocument();
  });

  it('renders refresh button', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('dashboard.refreshStats')).toBeInTheDocument();
  });

  it('calls refetch when refresh button is clicked', async () => {
    mockRefetch.mockResolvedValue({});
    renderWithProviders(<Dashboard />);
    
    const refreshButton = screen.getByText('dashboard.refreshStats');
    refreshButton.click();

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it('handles refresh success', async () => {
    mockRefetch.mockResolvedValue({});
    renderWithProviders(<Dashboard />);
    
    const refreshButton = screen.getByText('dashboard.refreshStats');
    refreshButton.click();

    await waitFor(() => {
      expect(message.loading).toHaveBeenCalled();
      expect(message.success).toHaveBeenCalled();
    });
  });

  it('handles refresh error', async () => {
    mockRefetch.mockRejectedValue(new Error('Refresh failed'));
    renderWithProviders(<Dashboard />);
    
    const refreshButton = screen.getByText('dashboard.refreshStats');
    refreshButton.click();

    await waitFor(() => {
      expect(message.error).toHaveBeenCalled();
    });
  });

  it('handles stats data without nested structure', () => {
    (useStatsOverview as jest.Mock).mockReturnValue({
      stats: {
        totalDownloads: 50,
        illustrations: 40,
        novels: 10,
        recentDownloads: 5,
      },
      isLoading: false,
      refetch: mockRefetch,
    });

    renderWithProviders(<Dashboard />);
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('displays zero values when stats are missing', () => {
    (useStatsOverview as jest.Mock).mockReturnValue({
      stats: {},
      isLoading: false,
      refetch: mockRefetch,
    });

    renderWithProviders(<Dashboard />);
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });
});

