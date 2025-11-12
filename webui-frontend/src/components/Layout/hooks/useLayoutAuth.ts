import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../../services/api';
import { QUERY_KEYS } from '../../../constants';

/**
 * Hook for managing authentication in Layout
 */
export function useLayoutAuth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);

  // Check authentication status
  const { data: authStatus } = useQuery({
    queryKey: QUERY_KEYS.AUTH_STATUS,
    queryFn: () => api.getAuthStatus(),
    retry: false,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Helper to check if authenticated
  const isAuthenticated = (): boolean => {
    if (!authStatus) return false;
    const responseData = (authStatus as any)?.data?.data || (authStatus as any)?.data;
    return (
      responseData?.authenticated === true ||
      responseData?.isAuthenticated === true ||
      responseData?.hasToken === true
    );
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);

      // Call logout API to clear token
      await api.logout();

      // Clear all query cache
      queryClient.clear();

      // Show success message
      message.success(t('layout.logoutSuccess'));

      // Navigate to login page
      navigate('/login', { replace: true });

      // Force page reload to ensure clean state
      setTimeout(() => {
        window.location.href = '/login';
      }, 500);
    } catch (error: any) {
      console.error('Logout failed:', error);
      message.error(t('layout.logoutFailed'));
      setIsLoggingOut(false);
    }
  };

  const handleRefreshToken = async () => {
    try {
      setIsRefreshingToken(true);
      message.loading(t('layout.refreshingToken'), 0);

      await api.refreshToken();

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.AUTH_STATUS });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG });

      message.destroy();
      message.success(t('layout.tokenRefreshed'));
    } catch (error: any) {
      console.error('Token refresh failed:', error);
      message.destroy();
      message.error(t('layout.tokenRefreshFailed'));
    } finally {
      setIsRefreshingToken(false);
    }
  };

  const handleLogin = () => {
    navigate('/login', { replace: true });
  };

  return {
    isAuthenticated: isAuthenticated(),
    isLoggingOut,
    isRefreshingToken,
    handleLogin,
    handleLogout,
    handleRefreshToken,
  };
}

