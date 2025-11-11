import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/authService';
import { useErrorHandler } from './useErrorHandler';

/**
 * Hook for managing authentication
 */
export function useAuth() {
  const queryClient = useQueryClient();
  const { handleError } = useErrorHandler();

  const {
    data: authStatus,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['auth', 'status'],
    queryFn: () => authService.getAuthStatus(),
  });

  const loginMutation = useMutation({
    mutationFn: ({
      username,
      password,
      headless = true,
      proxy,
    }: {
      username: string;
      password: string;
      headless?: boolean;
      proxy?: any;
    }) => authService.login(username, password, headless, proxy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (error) => handleError(error),
  });

  const loginWithTokenMutation = useMutation({
    mutationFn: (refreshToken: string) => authService.loginWithToken(refreshToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (error) => handleError(error),
  });

  const refreshTokenMutation = useMutation({
    mutationFn: (refreshToken?: string) => authService.refreshToken(refreshToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (error) => handleError(error),
  });

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (error) => handleError(error),
  });

  return {
    isAuthenticated: authStatus?.isAuthenticated ?? false,
    user: authStatus?.user,
    isLoading,
    error,
    refetch,
    login: loginMutation.mutate,
    loginAsync: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginWithToken: loginWithTokenMutation.mutate,
    loginWithTokenAsync: loginWithTokenMutation.mutateAsync,
    isLoggingInWithToken: loginWithTokenMutation.isPending,
    refreshToken: refreshTokenMutation.mutate,
    refreshTokenAsync: refreshTokenMutation.mutateAsync,
    isRefreshing: refreshTokenMutation.isPending,
    logout: logoutMutation.mutate,
    logoutAsync: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}

