import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

jest.mock('../../services/api', () => ({
  api: {
    getAuthStatus: jest.fn(),
    logout: jest.fn(),
    refreshToken: jest.fn(),
  },
}));

import { api } from '../../services/api';
import { useLayoutAuth } from '../../components/Layout/hooks/useLayoutAuth';

describe('useLayoutAuth', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    (api.getAuthStatus as jest.Mock).mockResolvedValue({
      data: {
        data: {
          authenticated: true,
        },
      },
    });
    (api.logout as jest.Mock).mockResolvedValue({});
    (api.refreshToken as jest.Mock).mockResolvedValue({});
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );

  it('should check authentication status', async () => {
    const { result } = renderHook(() => useLayoutAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBeDefined();
    });
  });

  it('should provide logout handler', () => {
    const { result } = renderHook(() => useLayoutAuth(), { wrapper });

    expect(result.current.handleLogout).toBeDefined();
    expect(typeof result.current.handleLogout).toBe('function');
  });

  it('should provide refresh token handler', () => {
    const { result } = renderHook(() => useLayoutAuth(), { wrapper });

    expect(result.current.handleRefreshToken).toBeDefined();
    expect(typeof result.current.handleRefreshToken).toBe('function');
  });

  it('should provide login handler', () => {
    const { result } = renderHook(() => useLayoutAuth(), { wrapper });

    expect(result.current.handleLogin).toBeDefined();
    expect(typeof result.current.handleLogin).toBe('function');
  });
});

