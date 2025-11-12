/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Download from '../../pages/Download';
import { downloadService } from '../../services/downloadService';
import { useDownload, useDownloadStatus, useDownloadLogs } from '../../hooks/useDownload';

// Mock services
jest.mock('../../services/downloadService');
jest.mock('../../hooks/useDownload');

const mockDownloadService = downloadService as jest.Mocked<typeof downloadService>;
const mockUseDownload = useDownload as jest.MockedFunction<typeof useDownload>;
const mockUseDownloadStatus = useDownloadStatus as jest.MockedFunction<typeof useDownloadStatus>;
const mockUseDownloadLogs = useDownloadLogs as jest.MockedFunction<typeof useDownloadLogs>;

describe('Download Management Integration Flow', () => {
  let queryClient: QueryClient;
  const mockStart = jest.fn();
  const mockStop = jest.fn();
  const mockRefetch = jest.fn();

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
      stop: mockStop,
      isStarting: false,
      isStopping: false,
      error: null,
    });

    mockUseDownloadStatus.mockReturnValue({
      status: {
        hasActiveTask: false,
        activeTask: undefined,
        allTasks: [],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
      hasActiveTask: false,
      activeTask: undefined,
      allTasks: [],
    });

    mockUseDownloadLogs.mockReturnValue({
      logs: [],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
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

  it('should complete full download flow', async () => {
    const user = userEvent.setup();

    // Step 1: Render download page
    renderWithProviders(<Download />);
    expect(screen.getByText(/download/i)).toBeInTheDocument();

    // Step 2: Start download
    mockStart.mockResolvedValueOnce({});
    mockUseDownloadStatus.mockReturnValueOnce({
      status: {
        hasActiveTask: true,
        activeTask: {
          taskId: 'test-task-id',
          status: 'running',
          progress: 0,
        },
        allTasks: [],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
      hasActiveTask: true,
      activeTask: {
        taskId: 'test-task-id',
        status: 'running',
        progress: 0,
      },
      allTasks: [],
    });

    const startButton = screen.getByRole('button', { name: /start/i });
    if (startButton) {
      await user.click(startButton);
      await waitFor(() => {
        expect(mockStart).toHaveBeenCalled();
      });
    }

    // Step 3: Check download status
    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });

    // Step 4: Stop download
    mockStop.mockResolvedValueOnce({});
    const stopButton = screen.getByRole('button', { name: /stop/i });
    if (stopButton) {
      await user.click(stopButton);
      await waitFor(() => {
        expect(mockStop).toHaveBeenCalled();
      });
    }
  }, 10000);

  it('should handle download logs flow', async () => {
    const user = userEvent.setup();

    mockUseDownloadLogs.mockReturnValue({
      logs: [
        { timestamp: new Date().toISOString(), level: 'info', message: 'Test log' },
      ],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<Download />);

    // View logs
    const logsTab = screen.getByRole('tab', { name: /logs/i });
    if (logsTab) {
      await user.click(logsTab);
      await waitFor(() => {
        expect(screen.getByText(/test log/i)).toBeInTheDocument();
      });
    }
  }, 10000);
});

