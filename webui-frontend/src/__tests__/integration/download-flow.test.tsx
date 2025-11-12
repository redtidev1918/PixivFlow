/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Download from '../../pages/Download';
import { downloadService } from '../../services/downloadService';
import { useDownload, useDownloadStatus, useDownloadLogs, useIncompleteTasks } from '../../hooks/useDownload';
import type { DownloadTask } from '../../services/api/types';

// Mock services
jest.mock('../../services/downloadService');
jest.mock('../../hooks/useDownload', () => ({
  useDownload: jest.fn(),
  useDownloadStatus: jest.fn(),
  useDownloadLogs: jest.fn(),
  useIncompleteTasks: jest.fn(),
}));

const mockDownloadService = downloadService as jest.Mocked<typeof downloadService>;
const mockUseDownload = useDownload as jest.MockedFunction<typeof useDownload>;
const mockUseDownloadStatus = useDownloadStatus as jest.MockedFunction<typeof useDownloadStatus>;
const mockUseDownloadLogs = useDownloadLogs as jest.MockedFunction<typeof useDownloadLogs>;
const mockUseIncompleteTasks = useIncompleteTasks as jest.MockedFunction<typeof useIncompleteTasks>;

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

describe('Download Management Integration Flow', () => {
  let queryClient: QueryClient;
  const mockStart = jest.fn();
  const mockStop = jest.fn();
  const mockRefetchStatus = jest.fn();
  const mockLogsRefetch = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();

    // Setup default mocks
    mockUseDownload.mockReturnValue({
      start: mockStart,
      startAsync: mockStart,
      stop: mockStop,
      stopAsync: mockStop,
      isStarting: false,
      isStopping: false,
    });

    mockUseDownloadStatus.mockReturnValue({
      status: {
        hasActiveTask: false,
        activeTask: undefined,
        allTasks: [],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetchStatus,
      hasActiveTask: false,
      activeTask: undefined,
      allTasks: [],
    });

    mockUseDownloadLogs.mockReturnValue({
      logs: [],
      isLoading: false,
      error: null,
      refetch: mockLogsRefetch,
    });

    mockUseIncompleteTasks.mockReturnValue({
      tasks: [],
      isLoading: false,
      error: null,
      refetch: mockRefetchStatus,
      resume: jest.fn(),
      resumeAsync: jest.fn(),
      isResuming: false,
      delete: jest.fn(),
      deleteAsync: jest.fn(),
      isDeleting: false,
      deleteAll: jest.fn(),
      deleteAllAsync: jest.fn(),
      isDeletingAll: false,
    });

    mockDownloadService.startDownload = jest.fn().mockResolvedValue({
      data: { data: { taskId: 'test-task-id' } },
    });

    mockDownloadService.getDownloadStatus = jest.fn().mockResolvedValue({
      data: {
        data: {
          hasActiveTask: false,
          activeTask: undefined,
          allTasks: [],
        },
      },
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders download dashboard with task actions', () => {
    renderWithProviders(<Download />);

    expect(screen.getByText('download.title')).toBeInTheDocument();
    expect(screen.getByText('download.description')).toBeInTheDocument();
    expect(screen.getByText('download.taskOperations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download\.startDownload/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download\.downloadAll/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download\.stopCurrent/ })).toBeInTheDocument();
  });

  it('renders active task and logs when download is running', () => {
    const activeTask: DownloadTask = {
      taskId: 'task-123',
      status: 'running',
      startTime: new Date().toISOString(),
      progress: {
        current: 10,
        total: 100,
        message: 'Processing',
      },
    };

    mockUseDownloadStatus.mockReturnValue({
      status: {
        hasActiveTask: true,
        activeTask,
        allTasks: [activeTask],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetchStatus,
      hasActiveTask: true,
      activeTask,
      allTasks: [activeTask],
    });

    mockUseDownloadLogs.mockReturnValue({
      logs: [
        { timestamp: new Date().toISOString(), level: 'info', message: 'Test log entry' },
      ],
      isLoading: false,
      error: null,
      refetch: mockLogsRefetch,
    });

    renderWithProviders(<Download />);

    expect(screen.getByText('download.currentTask')).toBeInTheDocument();
    expect(screen.getByText('download.stopTask')).toBeInTheDocument();
    expect(screen.getByText(/Test log entry/)).toBeInTheDocument();
  });
});

