import { useCallback, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { QUERY_KEYS } from '../constants';
import type { ElectronLoginSuccessData, ElectronLoginError } from '../types/electron';

export function useLogin() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Helper to check if authenticated from API response
  const isAuthenticated = useCallback((response: unknown): boolean => {
    if (!response) return false;
    let responseData: Record<string, unknown> | undefined;
    if (typeof response === 'object' && response !== null) {
      if ('data' in response && response.data) {
        const data = response.data as Record<string, unknown>;
        if ('data' in data && data.data) {
          responseData = data.data as Record<string, unknown>;
        } else {
          responseData = data;
        }
      } else {
        responseData = response as Record<string, unknown>;
      }
    }
    return responseData?.authenticated === true 
      || responseData?.isAuthenticated === true 
      || responseData?.hasToken === true;
  }, []);

  // Handle login success from Electron
  const handleElectronLoginSuccess = useCallback(async (data: ElectronLoginSuccessData) => {
    console.log('[useLogin] Received login-success event from Electron:', data);
    
    try {
      setIsLoggingIn(false);
      
      if (data.refreshToken) {
        message.loading({ content: t('dashboard.gettingAuthCode'), key: 'login-progress', duration: 0 });
        
        // Wait for backend to save token
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        message.loading({ content: t('dashboard.tokenRefreshing'), key: 'login-progress', duration: 0 });
      }
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.AUTH_STATUS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STATS_OVERVIEW });
      
      // Wait for backend config to refresh
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Check auth status
      try {
        const result = await api.getAuthStatus();
        if (isAuthenticated(result)) {
          message.destroy('login-progress');
          message.success(t('dashboard.tokenRefreshSuccess'));
        } else {
          message.destroy('login-progress');
          message.warning(t('dashboard.tokenRefreshedButVerifyFailed'));
        }
      } catch (error) {
        console.error('[useLogin] Error checking auth status:', error);
        message.destroy('login-progress');
        message.success(t('dashboard.tokenRefreshed'));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknown');
      console.error('[useLogin] Error handling login-success event:', error);
      message.destroy('login-progress');
      message.error(t('dashboard.loginSuccessEventError', { error: errorMessage }));
      setIsLoggingIn(false);
    }
  }, [queryClient, isAuthenticated, t]);

  // Handle login error from Electron
  const handleElectronLoginError = useCallback((error: ElectronLoginError) => {
    console.error('[useLogin] Received login-error event from Electron:', error);
    setIsLoggingIn(false);
    message.error(t('dashboard.loginFailed', { error: error.message || t('common.unknown') }));
  }, [t]);

  // Register IPC event listeners for Electron login
  useEffect(() => {
    // Check if we're in Electron
    const isElectron = typeof window !== 'undefined' && window.electron;
    if (!isElectron || !window.electron?.onLoginSuccess) {
      return;
    }

    console.log('[useLogin] Registering IPC event listeners for Electron login...');

    // Register event listeners and get cleanup functions
    const cleanupLoginSuccess = window.electron.onLoginSuccess(handleElectronLoginSuccess);
    const cleanupLoginError = window.electron.onLoginError(handleElectronLoginError);

    // Cleanup: Remove event listeners on unmount
    return () => {
      console.log('[useLogin] Cleaning up IPC event listeners...');
      if (cleanupLoginSuccess && typeof cleanupLoginSuccess === 'function') {
        cleanupLoginSuccess();
      }
      if (cleanupLoginError && typeof cleanupLoginError === 'function') {
        cleanupLoginError();
      }
    };
  }, [handleElectronLoginSuccess, handleElectronLoginError]);

  // Handle login button click
  const handleLogin = useCallback(async () => {
    // Check if we're in Electron
    const isElectron = typeof window !== 'undefined' && window.electron;
    
    if (isElectron && window.electron?.openLoginWindow) {
      // Use Electron system browser login
      console.log('[useLogin] Using Electron system browser login...');
      
      try {
        setIsLoggingIn(true);
        message.info(t('dashboard.openingBrowser'), 3);
        
        // Open login window
        const result = await window.electron.openLoginWindow();
        if (!result.success) {
          if (result.cancelled) {
            // User cancelled, don't show error
            setIsLoggingIn(false);
            return;
          }
          throw new Error(result.error || t('dashboard.cannotOpenLoginWindow'));
        }
        
        // The login-success or login-error event will be handled by the listeners
        console.log('[useLogin] Login window opened, waiting for login-success or login-error event...');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : t('common.unknown');
        console.error('[useLogin] Failed to open Electron login window:', error);
        message.error(t('dashboard.cannotOpenLoginWindowError', { error: errorMessage }));
        setIsLoggingIn(false);
      }
    } else {
      // Fallback: navigate to login page
      message.info(t('dashboard.redirectingToLogin'));
      window.location.href = '/login';
    }
  }, [t]);

  return {
    isLoggingIn,
    handleLogin,
  };
}

