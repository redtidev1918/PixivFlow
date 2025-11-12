import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';

// Mock the auth service
jest.mock('../../services/authService', () => ({
  authService: {
    getAuthStatus: jest.fn(),
    login: jest.fn(),
    loginWithToken: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
  },
}));

// Mock useErrorHandler
jest.mock('../../hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

describe('useAuth', () => {
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

  describe('authentication status', () => {
    it('should fetch auth status successfully', async () => {
      const mockAuthStatus = {
        isAuthenticated: true,
        user: { username: 'testuser', pixivId: '12345' },
      };

      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockAuthStatus.user);
      expect(authService.getAuthStatus).toHaveBeenCalledTimes(1);
    });

    it('should handle unauthenticated status', async () => {
      const mockAuthStatus = {
        isAuthenticated: false,
        user: null,
      };

      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('should handle auth status error', async () => {
      const error = new Error('Failed to fetch auth status');
      (authService.getAuthStatus as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe('login', () => {
    it('should login successfully with username and password', async () => {
      const mockAuthStatus = {
        isAuthenticated: true,
        user: { username: 'testuser', pixivId: '12345' },
      };

      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);
      (authService.login as jest.Mock).mockResolvedValue(mockAuthStatus);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.loginAsync({
        username: 'testuser',
        password: 'password123',
        headless: true,
      });

      expect(authService.login).toHaveBeenCalledWith('testuser', 'password123', true, undefined);
    });

    it('should login with token', async () => {
      const mockAuthStatus = {
        isAuthenticated: true,
        user: { username: 'testuser', pixivId: '12345' },
      };

      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);
      (authService.loginWithToken as jest.Mock).mockResolvedValue(mockAuthStatus);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.loginWithTokenAsync('refresh_token_123');

      expect(authService.loginWithToken).toHaveBeenCalledWith('refresh_token_123');
    });

    it('should handle login error', async () => {
      const mockAuthStatus = {
        isAuthenticated: false,
        user: null,
      };

      const error = new Error('Login failed');
      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);
      (authService.login as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.loginAsync({
          username: 'testuser',
          password: 'wrongpassword',
        })
      ).rejects.toThrow('Login failed');
    });
  });

  describe('refresh token', () => {
    it('should refresh token successfully', async () => {
      const mockAuthStatus = {
        isAuthenticated: true,
        user: { username: 'testuser', pixivId: '12345' },
      };

      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);
      (authService.refreshToken as jest.Mock).mockResolvedValue(mockAuthStatus);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.refreshTokenAsync('refresh_token_123');

      expect(authService.refreshToken).toHaveBeenCalledWith('refresh_token_123');
    });

    it('should refresh token without parameter', async () => {
      const mockAuthStatus = {
        isAuthenticated: true,
        user: { username: 'testuser', pixivId: '12345' },
      };

      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);
      (authService.refreshToken as jest.Mock).mockResolvedValue(mockAuthStatus);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.refreshTokenAsync();

      expect(authService.refreshToken).toHaveBeenCalledWith(undefined);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const mockAuthStatus = {
        isAuthenticated: true,
        user: { username: 'testuser', pixivId: '12345' },
      };

      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);
      (authService.logout as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.logoutAsync();

      expect(authService.logout).toHaveBeenCalledTimes(1);
    });

    it('should handle logout error', async () => {
      const mockAuthStatus = {
        isAuthenticated: true,
        user: { username: 'testuser', pixivId: '12345' },
      };

      const error = new Error('Logout failed');
      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);
      (authService.logout as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(result.current.logoutAsync()).rejects.toThrow('Logout failed');
    });
  });

  describe('loading states', () => {
    it('should track login loading state', async () => {
      const mockAuthStatus = {
        isAuthenticated: false,
        user: null,
      };

      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);
      (authService.login as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockAuthStatus), 100))
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const loginPromise = result.current.loginAsync({
        username: 'testuser',
        password: 'password123',
      });

      expect(result.current.isLoggingIn).toBe(true);

      await loginPromise;

      await waitFor(() => {
        expect(result.current.isLoggingIn).toBe(false);
      });
    });

    it('should track refresh token loading state', async () => {
      const mockAuthStatus = {
        isAuthenticated: true,
        user: { username: 'testuser', pixivId: '12345' },
      };

      (authService.getAuthStatus as jest.Mock).mockResolvedValue(mockAuthStatus);
      (authService.refreshToken as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockAuthStatus), 100))
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const refreshPromise = result.current.refreshTokenAsync();

      expect(result.current.isRefreshing).toBe(true);

      await refreshPromise;

      await waitFor(() => {
        expect(result.current.isRefreshing).toBe(false);
      });
    });
  });
});

