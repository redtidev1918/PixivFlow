import { useState, useCallback, useMemo } from 'react';

export type SortOrder = 'asc' | 'desc';

export interface TableSortConfig<T extends string = string> {
  sortBy: T;
  sortOrder: SortOrder;
}

export interface TableSortActions<T extends string = string> {
  handleSort: (column: T) => void;
  setSortBy: (column: T) => void;
  setSortOrder: (order: SortOrder) => void;
  reset: () => void;
}

export interface UseTableSortReturn<T extends string = string>
  extends TableSortConfig<T>,
    TableSortActions<T> {
  getSortIcon: (column: T) => React.ReactNode | null;
}

/**
 * Custom hook for managing table sorting state
 * Provides utilities for column sorting with visual indicators
 * 
 * @param defaultSortBy - Default column to sort by
 * @param defaultSortOrder - Default sort order (default: 'desc')
 * @returns Sort state and actions
 * 
 * @example
 * const sort = useTableSort<'name' | 'date' | 'size'>('date');
 * 
 * // Use in table column
 * {
 *   title: (
 *     <span onClick={() => sort.handleSort('name')}>
 *       Name {sort.getSortIcon('name')}
 *     </span>
 *   ),
 *   dataIndex: 'name',
 * }
 */
export function useTableSort<T extends string = string>(
  defaultSortBy: T,
  defaultSortOrder: SortOrder = 'desc'
): UseTableSortReturn<T> {
  const [sortBy, setSortBy] = useState<T>(defaultSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultSortOrder);

  const handleSort = useCallback(
    (column: T) => {
      if (sortBy === column) {
        // Toggle sort order if clicking the same column
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        // Set new column and default to descending
        setSortBy(column);
        setSortOrder('desc');
      }
    },
    [sortBy]
  );

  const reset = useCallback(() => {
    setSortBy(defaultSortBy);
    setSortOrder(defaultSortOrder);
  }, [defaultSortBy, defaultSortOrder]);

  const getSortIcon = useCallback(
    (column: T): React.ReactNode | null => {
      if (sortBy !== column) return null;
      return sortOrder === 'asc' ? '↑' : '↓';
    },
    [sortBy, sortOrder]
  );

  return {
    sortBy,
    sortOrder,
    handleSort,
    setSortBy,
    setSortOrder,
    reset,
    getSortIcon,
  };
}

