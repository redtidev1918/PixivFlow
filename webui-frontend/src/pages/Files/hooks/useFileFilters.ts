import { useMemo, useCallback } from 'react';
import { FileItem } from '../Files';

export type SortColumn = 'name' | 'time' | 'size' | 'type' | 'downloadedAt';
export type SortOrder = 'asc' | 'desc';
export type DateFilter =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth';

/**
 * Hook for managing file filtering and sorting
 */
export function useFileFilters(
  files: FileItem[],
  directories: FileItem[],
  searchText: string,
  dateFilter: DateFilter
) {


  // Calculate date range for date filter
  const getDateRange = useCallback((filter: DateFilter) => {
    if (filter === 'all') {
      return { startDate: null, endDate: null };
    }

    const now = new Date();
    let startDate: Date;
    let endDate: Date | null = null;

    switch (filter) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        break;
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        endDate = new Date(
          yesterday.getFullYear(),
          yesterday.getMonth(),
          yesterday.getDate(),
          23,
          59,
          59,
          999
        );
        break;
      case 'thisWeek':
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'lastWeek':
        const lastWeekStart = new Date(now);
        lastWeekStart.setDate(now.getDate() - now.getDay() - 7);
        lastWeekStart.setHours(0, 0, 0, 0);
        startDate = lastWeekStart;
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        lastWeekEnd.setHours(23, 59, 59, 999);
        endDate = lastWeekEnd;
        break;
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      default:
        startDate = new Date(0);
    }

    return { startDate, endDate };
  }, []);

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    let items = [...directories, ...files];

    // Apply search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(searchLower));
    }

    // Apply date filter (only for files with downloadedAt)
    if (dateFilter !== 'all') {
      const { startDate, endDate } = getDateRange(dateFilter);
      if (startDate) {
        items = items.filter((item) => {
          if (item.type === 'directory') return true;
          if (!item.downloadedAt) return false;

          const downloadDate = new Date(item.downloadedAt);
          const isAfterStart = downloadDate >= startDate;
          const isBeforeEnd = endDate ? downloadDate <= endDate : true;
          return isAfterStart && isBeforeEnd;
        });
      }
    }

    // Note: Sorting is handled by the server via useFiles hook
    // This hook only handles client-side filtering (search and date filter)

    return items;
  }, [directories, files, searchText, dateFilter, getDateRange]);

  // Separate directories and files
  const { filteredDirectories, filteredFiles } = useMemo(() => {
    const dirs = filteredAndSortedItems.filter((item) => item.type === 'directory');
    const fileItems = filteredAndSortedItems.filter((item) => item.type === 'file');
    return { filteredDirectories: dirs, filteredFiles: fileItems };
  }, [filteredAndSortedItems]);

  return {
    filteredDirectories,
    filteredFiles,
  };
}

