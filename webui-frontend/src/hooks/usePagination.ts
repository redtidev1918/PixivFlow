import { useState, useCallback, useMemo } from 'react';

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
}

export interface PaginationActions {
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setTotal: (total: number) => void;
  reset: () => void;
  nextPage: () => void;
  prevPage: () => void;
}

export interface UsePaginationReturn extends PaginationConfig, PaginationActions {
  hasNextPage: boolean;
  hasPrevPage: boolean;
  totalPages: number;
}

/**
 * Custom hook for managing pagination state
 * Provides utilities for page navigation and state management
 * 
 * @param initialPageSize - Initial page size (default: 20)
 * @returns Pagination state and actions
 * 
 * @example
 * const pagination = usePagination(50);
 * 
 * // Use in component
 * <Table
 *   pagination={{
 *     current: pagination.page,
 *     pageSize: pagination.pageSize,
 *     total: pagination.total,
 *     onChange: pagination.setPage,
 *     onShowSizeChange: (_, size) => pagination.setPageSize(size),
 *   }}
 * />
 */
export function usePagination(initialPageSize: number = 20): UsePaginationReturn {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize]);
  const hasNextPage = useMemo(() => page < totalPages, [page, totalPages]);
  const hasPrevPage = useMemo(() => page > 1, [page]);

  const reset = useCallback(() => {
    setPage(1);
    setTotal(0);
  }, []);

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage]);

  const prevPage = useCallback(() => {
    if (hasPrevPage) {
      setPage((prev) => prev - 1);
    }
  }, [hasPrevPage]);

  const handleSetPageSize = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1); // Reset to first page when page size changes
  }, []);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage,
    hasPrevPage,
    setPage,
    setPageSize: handleSetPageSize,
    setTotal,
    reset,
    nextPage,
    prevPage,
  };
}

