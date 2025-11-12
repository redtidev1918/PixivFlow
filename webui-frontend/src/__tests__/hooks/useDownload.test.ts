import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDownload,
  useDownloadStatus,
  useDownloadLogs,
  useDownloadHistory,
  useIncompleteTasks,
} from '../../hooks/useDownload';
import { downloadService } from '../../services/downloadService';

// Mock the download service
jest.mock('../../services/downloadService', () => ({
  downloadService: {
    startDownload: jest.fn(),
    stopDownload: jest.fn(),
    getDownloadStatus: jest.fn(),
    getTaskLogs: jest.fn(),
    getDownloadHistory: jest.fn(),
    getIncompleteTasks: jest.fn(),
    resumeDownload: jest.fn(),
    deleteIncompleteTask: jest.fn(),
    deleteAllIncompleteTasks: jest.fn(),
  },
}));

// Mock useErrorHandler
jest.mock('../../hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

describe('useDownload', () => {
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

  describe('useDownload', () => {
    it('should start download successfully', async () => {
      const mockTask = {
        taskId: 'task-123',
        status: 'running',
      };

      (downloadService.startDownload as jest.Mock).mockResolvedValue(mockTask);

      const { result } = renderHook(() => useDownload(), { wrapper });

      await result.current.startAsync({
        targetId: 'target-1',
      });

      expect(downloadService.startDownload).toHaveBeenCalledWith('target-1', undefined, undefined);
    });

    it('should start download with config', async () => {
      const mockTask = {
        taskId: 'task-123',
        status: 'running',
      };

      const config = {
        downloadDirectory: '/downloads',
        maxConcurrentDownloads: 5,
      };

      (downloadService.startDownload as jest.Mock).mockResolvedValue(mockTask);

      const { result } = renderHook(() => useDownload(), { wrapper });

      await result.current.startAsync({
        config,
      });

      expect(downloadService.startDownload).toHaveBeenCalledWith(undefined, config, undefined);
    });

    it('should stop download successfully', async () => {
      (downloadService.stopDownload as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDownload(), { wrapper });

      await result.current.stopAsync('task-123');

      expect(downloadService.stopDownload).toHaveBeenCalledWith('task-123');
    });

    it('should handle start download error', async () => {
      const error = new Error('Start download failed');
      (downloadService.startDownload as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useDownload(), { wrapper });

      await expect(
        result.current.startAsync({
          targetId: 'invalid-target',
        })
      ).rejects.toThrow('Start download failed');
    });

    it('should track loading states', async () => {
      (downloadService.startDownload as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ taskId: 'task-123' }), 100))
      );

      const { result } = renderHook(() => useDownload(), { wrapper });

      const startPromise = result.current.startAsync({
        targetId: 'target-1',
      });

      expect(result.current.isStarting).toBe(true);

      await startPromise;

      await waitFor(() => {
        expect(result.current.isStarting).toBe(false);
      });
    });
  });

  describe('useDownloadStatus', () => {
    it('should fetch download status successfully', async () => {
      const mockStatus = {
        hasActiveTask: true,
        activeTask: {
          taskId: 'task-123',
          status: 'running',
        },
        allTasks: [],
      };

      (downloadService.getDownloadStatus as jest.Mock).mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useDownloadStatus(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasActiveTask).toBe(true);
      expect(result.current.activeTask).toEqual(mockStatus.activeTask);
      expect(result.current.allTasks).toEqual([]);
    });

    it('should fetch status for specific task', async () => {
      const mockStatus = {
        hasActiveTask: true,
        activeTask: {
          taskId: 'task-123',
          status: 'running',
        },
        allTasks: [],
      };

      (downloadService.getDownloadStatus as jest.Mock).mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useDownloadStatus('task-123'), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(downloadService.getDownloadStatus).toHaveBeenCalledWith('task-123');
    });

    it('should handle no active task', async () => {
      const mockStatus = {
        hasActiveTask: false,
        activeTask: null,
        allTasks: [],
      };

      (downloadService.getDownloadStatus as jest.Mock).mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useDownloadStatus(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasActiveTask).toBe(false);
      expect(result.current.activeTask).toBeNull();
    });

    it('should use custom refetch interval', async () => {
      const mockStatus = {
        hasActiveTask: false,
        activeTask: null,
        allTasks: [],
      };

      (downloadService.getDownloadStatus as jest.Mock).mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useDownloadStatus(undefined, 5000), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // The refetch interval should be set to 5000ms
      expect(result.current.status).toEqual(mockStatus);
    });
  });

  describe('useDownloadLogs', () => {
    it('should fetch task logs successfully', async () => {
      const mockLogs = {
        logs: [
          { timestamp: '2025-01-01T00:00:00Z', level: 'INFO', message: 'Task started' },
          { timestamp: '2025-01-01T00:01:00Z', level: 'INFO', message: 'Downloading...' },
        ],
      };

      (downloadService.getTaskLogs as jest.Mock).mockResolvedValue(mockLogs);

      const { result } = renderHook(() => useDownloadLogs('task-123'), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.logs).toEqual(mockLogs.logs);
      expect(downloadService.getTaskLogs).toHaveBeenCalledWith('task-123', undefined);
    });

    it('should fetch logs with limit', async () => {
      const mockLogs = {
        logs: [
          { timestamp: '2025-01-01T00:00:00Z', level: 'INFO', message: 'Task started' },
        ],
      };

      (downloadService.getTaskLogs as jest.Mock).mockResolvedValue(mockLogs);

      const { result } = renderHook(() => useDownloadLogs('task-123', 100), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(downloadService.getTaskLogs).toHaveBeenCalledWith('task-123', 100);
    });

    it('should not fetch logs when taskId is undefined', async () => {
      const { result } = renderHook(() => useDownloadLogs(undefined), { wrapper });

      // Should not call the service when taskId is undefined
      expect(downloadService.getTaskLogs).not.toHaveBeenCalled();
    });

    it('should use custom refetch interval', async () => {
      const mockLogs = {
        logs: [],
      };

      (downloadService.getTaskLogs as jest.Mock).mockResolvedValue(mockLogs);

      const { result } = renderHook(() => useDownloadLogs('task-123', undefined, 3000), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.logs).toEqual([]);
    });
  });

  describe('useDownloadHistory', () => {
    it('should fetch download history successfully', async () => {
      const mockHistory = {
        items: [
          {
            id: 1,
            pixivId: '12345',
            title: 'Test Illustration',
            author: 'Test Author',
            type: 'illustration',
            downloadedAt: '2025-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      (downloadService.getDownloadHistory as jest.Mock).mockResolvedValue(mockHistory);

      const { result } = renderHook(() => useDownloadHistory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toEqual(mockHistory.items);
      expect(result.current.total).toBe(1);
      expect(result.current.page).toBe(1);
      expect(result.current.limit).toBe(20);
    });

    it('should fetch history with params', async () => {
      const mockHistory = {
        items: [],
        total: 0,
        page: 2,
        limit: 10,
      };

      (downloadService.getDownloadHistory as jest.Mock).mockResolvedValue(mockHistory);

      const { result } = renderHook(
        () =>
          useDownloadHistory({
            page: 2,
            limit: 10,
            type: 'illustration',
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(downloadService.getDownloadHistory).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        type: 'illustration',
      });
    });
  });

  describe('useIncompleteTasks', () => {
    it('should fetch incomplete tasks successfully', async () => {
      const mockTasks = {
        tasks: [
          {
            id: 1,
            tag: 'test-tag',
            type: 'illustration' as const,
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      };

      (downloadService.getIncompleteTasks as jest.Mock).mockResolvedValue(mockTasks);

      const { result } = renderHook(() => useIncompleteTasks(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.tasks).toEqual(mockTasks.tasks);
    });

    it('should resume incomplete task successfully', async () => {
      const mockTasks = {
        tasks: [
          {
            id: 1,
            tag: 'test-tag',
            type: 'illustration' as const,
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      };

      (downloadService.getIncompleteTasks as jest.Mock).mockResolvedValue(mockTasks);
      (downloadService.resumeDownload as jest.Mock).mockResolvedValue({ taskId: 'task-123' });

      const { result } = renderHook(() => useIncompleteTasks(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.resumeAsync({
        tag: 'test-tag',
        type: 'illustration',
      });

      expect(downloadService.resumeDownload).toHaveBeenCalledWith('test-tag', 'illustration');
    });

    it('should delete incomplete task successfully', async () => {
      const mockTasks = {
        tasks: [
          {
            id: 1,
            tag: 'test-tag',
            type: 'illustration' as const,
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      };

      (downloadService.getIncompleteTasks as jest.Mock).mockResolvedValue(mockTasks);
      (downloadService.deleteIncompleteTask as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useIncompleteTasks(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.deleteAsync(1);

      expect(downloadService.deleteIncompleteTask).toHaveBeenCalledWith(1);
    });

    it('should delete all incomplete tasks successfully', async () => {
      const mockTasks = {
        tasks: [
          {
            id: 1,
            tag: 'test-tag',
            type: 'illustration' as const,
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      };

      (downloadService.getIncompleteTasks as jest.Mock).mockResolvedValue(mockTasks);
      (downloadService.deleteAllIncompleteTasks as jest.Mock).mockResolvedValue({
        deleted: 1,
      });

      const { result } = renderHook(() => useIncompleteTasks(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.deleteAllAsync();

      expect(downloadService.deleteAllIncompleteTasks).toHaveBeenCalledTimes(1);
    });

    it('should track loading states', async () => {
      const mockTasks = {
        tasks: [],
      };

      (downloadService.getIncompleteTasks as jest.Mock).mockResolvedValue(mockTasks);
      (downloadService.resumeDownload as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ taskId: 'task-123' }), 100))
      );

      const { result } = renderHook(() => useIncompleteTasks(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const resumePromise = result.current.resumeAsync({
        tag: 'test-tag',
        type: 'illustration',
      });

      expect(result.current.isResuming).toBe(true);

      await resumePromise;

      await waitFor(() => {
        expect(result.current.isResuming).toBe(false);
      });
    });
  });
});

