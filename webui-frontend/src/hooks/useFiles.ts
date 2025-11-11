import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fileService } from '../services/fileService';
import { useErrorHandler } from './useErrorHandler';

/**
 * Hook for managing files
 */
export function useFiles(params?: {
  path?: string;
  type?: string;
  sort?: string;
  order?: string;
  dateFilter?: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'all';
}) {
  const queryClient = useQueryClient();
  const { handleError } = useErrorHandler();

  const {
    data: filesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['files', params],
    queryFn: () => fileService.listFiles(params),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, path, type }: { id: string; path?: string; type?: string }) =>
      fileService.deleteFile(id, { path, type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (error) => handleError(error),
  });

  return {
    files: filesData?.files ?? [],
    directories: filesData?.directories ?? [],
    currentPath: filesData?.currentPath ?? '',
    isLoading,
    error,
    refetch,
    deleteFile: deleteMutation.mutate,
    deleteFileAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Hook for managing recent files
 */
export function useRecentFiles(params?: {
  limit?: number;
  type?: 'illustration' | 'novel';
  filter?: 'today' | 'yesterday' | 'last7days' | 'last30days';
}) {
  const {
    data: recentFilesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['files', 'recent', params],
    queryFn: () => fileService.getRecentFiles(params),
  });

  return {
    files: recentFilesData?.files ?? [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for file preview
 */
export function useFilePreview(path: string | undefined, type?: string) {
  const {
    data: previewBlob,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['files', 'preview', path, type],
    queryFn: () => fileService.getFilePreview(path!, type),
    enabled: !!path,
  });

  // Create object URL for preview
  const previewUrl = previewBlob ? URL.createObjectURL(previewBlob) : null;

  return {
    previewUrl,
    previewBlob,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for file normalization
 */
export function useFileNormalize() {
  const queryClient = useQueryClient();
  const { handleError } = useErrorHandler();

  const normalizeMutation = useMutation({
    mutationFn: (options?: {
      dryRun?: boolean;
      normalizeNames?: boolean;
      reorganize?: boolean;
      updateDatabase?: boolean;
      type?: 'illustration' | 'novel' | 'all';
    }) => fileService.normalizeFiles(options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (error) => handleError(error),
  });

  return {
    normalize: normalizeMutation.mutate,
    normalizeAsync: normalizeMutation.mutateAsync,
    isNormalizing: normalizeMutation.isPending,
    normalizeResult: normalizeMutation.data,
  };
}

