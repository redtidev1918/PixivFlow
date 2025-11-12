import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useStatsOverview,
  useDownloadStats,
  useTagStats,
  useAuthorStats,
} from '../../hooks/useStats';
import { statsService } from '../../services/statsService';

// Mock the stats service
jest.mock('../../services/statsService', () => ({
  statsService: {
    getStatsOverview: jest.fn(),
    getDownloadStats: jest.fn(),
    getTagStats: jest.fn(),
    getAuthorStats: jest.fn(),
  },
}));

describe('useStatsOverview', () => {
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

  it('should fetch stats overview successfully', async () => {
    const mockStats = {
      totalDownloads: 100,
      illustrations: 80,
      novels: 20,
      recentDownloads: 10,
    };

    (statsService.getStatsOverview as jest.Mock<any>).mockResolvedValue(mockStats);

    const { result } = renderHook(() => useStatsOverview(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats).toEqual(mockStats);
    expect(statsService.getStatsOverview).toHaveBeenCalled();
  });

  it('should handle loading state', () => {
    (statsService.getStatsOverview as jest.Mock<any>).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useStatsOverview(), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('should provide refetch function', () => {
    const { result } = renderHook(() => useStatsOverview(), { wrapper });

    expect(result.current.refetch).toBeDefined();
    expect(typeof result.current.refetch).toBe('function');
  });
});

describe('useDownloadStats', () => {
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

  it('should fetch download stats with period', async () => {
    const mockStats = {
      period: '7d',
      downloads: 50,
      illustrations: 40,
      novels: 10,
    };

    (statsService.getDownloadStats as jest.Mock<any>).mockResolvedValue(mockStats);

    const { result } = renderHook(() => useDownloadStats('7d'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats).toEqual(mockStats);
    expect(statsService.getDownloadStats).toHaveBeenCalledWith('7d');
  });

  it('should fetch download stats without period', async () => {
    const mockStats = {
      downloads: 100,
    };

    (statsService.getDownloadStats as jest.Mock<any>).mockResolvedValue(mockStats);

    const { result } = renderHook(() => useDownloadStats(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(statsService.getDownloadStats).toHaveBeenCalledWith(undefined);
  });
});

describe('useTagStats', () => {
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

  it('should fetch tag stats with limit', async () => {
    const mockStats = {
      tags: [
        { name: 'tag1', count: 100 },
        { name: 'tag2', count: 80 },
      ],
    };

    (statsService.getTagStats as jest.Mock<any>).mockResolvedValue(mockStats);

    const { result } = renderHook(() => useTagStats(10), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats).toEqual(mockStats);
    expect(statsService.getTagStats).toHaveBeenCalledWith(10);
  });

  it('should fetch tag stats without limit', async () => {
    const mockStats = {
      tags: [],
    };

    (statsService.getTagStats as jest.Mock<any>).mockResolvedValue(mockStats);

    const { result } = renderHook(() => useTagStats(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(statsService.getTagStats).toHaveBeenCalledWith(undefined);
  });
});

describe('useAuthorStats', () => {
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

  it('should fetch author stats with limit', async () => {
    const mockStats = {
      authors: [
        { id: '1', name: 'Author 1', count: 50 },
        { id: '2', name: 'Author 2', count: 30 },
      ],
    };

    (statsService.getAuthorStats as jest.Mock<any>).mockResolvedValue(mockStats);

    const { result } = renderHook(() => useAuthorStats(10), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats).toEqual(mockStats);
    expect(statsService.getAuthorStats).toHaveBeenCalledWith(10);
  });

  it('should fetch author stats without limit', async () => {
    const mockStats = {
      authors: [],
    };

    (statsService.getAuthorStats as jest.Mock<any>).mockResolvedValue(mockStats);

    const { result } = renderHook(() => useAuthorStats(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(statsService.getAuthorStats).toHaveBeenCalledWith(undefined);
  });
});

