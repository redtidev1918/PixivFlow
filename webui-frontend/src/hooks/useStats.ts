import { useQuery } from '@tanstack/react-query';
import { statsService } from '../services/statsService';
import { QUERY_KEYS } from '../constants';

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
    queryKey: QUERY_KEYS.STATS_OVERVIEW,
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
    queryKey: QUERY_KEYS.STATS_DOWNLOADS(period),
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
    queryKey: QUERY_KEYS.STATS_TAGS(limit),
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
    queryKey: QUERY_KEYS.STATS_AUTHORS(limit),
    queryFn: () => statsService.getAuthorStats(limit),
  });

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}

