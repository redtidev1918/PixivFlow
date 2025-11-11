import { useQuery } from '@tanstack/react-query';
import { statsService } from '../services/statsService';

/**
 * Hook for getting overview statistics
 */
export function useStatsOverview() {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => statsService.getStatsOverview(),
  });

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for getting download statistics
 */
export function useDownloadStats(period?: string) {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['stats', 'downloads', period],
    queryFn: () => statsService.getDownloadStats(period),
  });

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for getting tag statistics
 */
export function useTagStats(limit?: number) {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['stats', 'tags', limit],
    queryFn: () => statsService.getTagStats(limit),
  });

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for getting author statistics
 */
export function useAuthorStats(limit?: number) {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['stats', 'authors', limit],
    queryFn: () => statsService.getAuthorStats(limit),
  });

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}

