import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logsService } from '../services/logsService';
import { useErrorHandler } from './useErrorHandler';

/**
 * Hook for managing application logs
 */
export function useLogs(params?: {
  page?: number;
  limit?: number;
  level?: string;
  search?: string;
}) {
  const queryClient = useQueryClient();
  const { handleError } = useErrorHandler();

  const {
    data: logsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['logs', params],
    queryFn: () => logsService.getLogs(params),
  });

  const clearMutation = useMutation({
    mutationFn: () => logsService.clearLogs(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
    },
    onError: (error) => handleError(error),
  });

  return {
    logs: logsData?.logs ?? [],
    total: logsData?.total ?? 0,
    page: logsData?.page ?? 1,
    limit: logsData?.limit ?? 20,
    isLoading,
    error,
    refetch,
    clear: clearMutation.mutate,
    clearAsync: clearMutation.mutateAsync,
    isClearing: clearMutation.isPending,
  };
}

