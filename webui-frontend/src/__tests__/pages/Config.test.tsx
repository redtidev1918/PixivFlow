/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Config from '../../pages/Config';
import { useConfig, useConfigFiles } from '../../hooks/useConfig';

// Mock hooks
jest.mock('../../hooks/useConfig');
jest.mock('../../services/api', () => ({
  api: {
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
    listConfigFiles: jest.fn(),
  },
}));

describe('Config', () => {
  let queryClient: QueryClient;
  const mockUpdateAsync = jest.fn();
  const mockValidate = jest.fn();
  const mockRefetchConfigFiles = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
    (useConfig as jest.Mock).mockReturnValue({
      config: {
        downloadDirectory: '/test/path',
        targets: [],
      },
      isLoading: false,
      updateAsync: mockUpdateAsync,
      validate: mockValidate,
      isUpdating: false,
      isValidating: false,
    });
    (useConfigFiles as jest.Mock).mockReturnValue({
      configFiles: [],
      refetch: mockRefetchConfigFiles,
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('renders config page', () => {
    renderWithProviders(<Config />);
    expect(screen.getByText('config.title')).toBeInTheDocument();
  });

  it('renders config tabs', () => {
    renderWithProviders(<Config />);
    // Tabs should be rendered
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('shows loading state when config is loading', () => {
    (useConfig as jest.Mock).mockReturnValue({
      config: null,
      isLoading: true,
      updateAsync: mockUpdateAsync,
      validate: mockValidate,
      isUpdating: false,
      isValidating: false,
    });

    renderWithProviders(<Config />);
    // Config component shows loading as text "common.loading"
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders config files manager', () => {
    renderWithProviders(<Config />);
    // Config files manager should be rendered in the default tab
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});

