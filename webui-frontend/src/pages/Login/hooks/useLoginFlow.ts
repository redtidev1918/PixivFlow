import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../../services/api';
import { translateErrorCode, extractErrorInfo } from '../../../utils/errorCodeTranslator';
import { QUERY_KEYS } from '../../../constants';
import { useAuth } from '../../../hooks/useAuth';
import { useLoginPolling } from '../../../hooks/useLoginPolling';
import { useInteractiveLogin } from '../../../hooks/useInteractiveLogin';

/**
 * Hook for managing login flow
 * Handles login mode selection, login steps, polling, and navigation
 */
export function useLoginFlow() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loginMode, setLoginMode] = useState<'interactive' | 'token'>('interactive');
  const [loginStep, setLoginStep] = useState(0);
  const [pollingEnabled, setPollingEnabled] = useState(false);

  // Check if already logged in
  const { data: authStatus, isLoading: authStatusLoading, refetch: refetchAuthStatus } = useQuery({
    queryKey: QUERY_KEYS.AUTH_STATUS,
    queryFn: () => api.getAuthStatus(),
    retry: false,
    refetchInterval: false,
  });

  // Get config to read proxy settings
  const { data: configData } = useQuery({
    queryKey: QUERY_KEYS.CONFIG,
    queryFn: () => api.getConfig(),
  });

  // Use auth hook
  const {
    loginWithTokenAsync,
    isLoggingInWithToken,
  } = useAuth();

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
    const authenticated = responseData?.authenticated === true || responseData?.isAuthenticated === true || responseData?.hasToken === true;
    console.log('[Login] Auth check:', { authenticated, data: responseData });
    return authenticated;
  }, []);

  // Handle successful login
  const handleLoginSuccess = useCallback(async () => {
    setPollingEnabled(false);
    setLoginStep(2);
    
    message.loading({ content: '✅ 登录成功，正在验证登录状态...', key: 'login-success', duration: 0 });
    
    // Wait for backend config to refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      const result = await refetchAuthStatus();
      console.log('[Login] Auth status after invalidate:', result);
      
      message.destroy('login-success');
      
      if (isAuthenticated(result)) {
        console.log('[Login] Authentication confirmed, navigating to dashboard...');
        message.success('✅ 登录成功！正在跳转到 Dashboard...');
        
        await new Promise(resolve => setTimeout(resolve, 800));
        window.location.href = '/dashboard';
      } else {
        console.warn('[Login] Auth status not confirmed, but attempting navigation anyway...');
        message.warning('状态验证失败，但将尝试跳转...');
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        window.location.href = '/dashboard';
      }
    } catch (error) {
      console.error('[Login] Error checking auth status before navigation:', error);
      message.destroy('login-success');
      message.warning('状态检查出错，但将尝试跳转...');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      window.location.href = '/dashboard';
    }
  }, [refetchAuthStatus, isAuthenticated]);

  // Start/stop polling helpers
  const startPolling = useCallback(() => {
    setPollingEnabled(true);
  }, []);

  const stopPolling = useCallback(() => {
    setPollingEnabled(false);
  }, []);

  // Wrapper for refetchAuthStatus to match expected type
  const refetchAuthStatusWrapper = useCallback(async (): Promise<unknown> => {
    const result = await refetchAuthStatus();
    return result;
  }, [refetchAuthStatus]);

  // Use login polling hook
  useLoginPolling({
    enabled: pollingEnabled,
    onAuthenticated: () => {
      handleLoginSuccess();
    },
    refetchAuthStatus: refetchAuthStatusWrapper,
    isAuthenticated,
  });

  // Use interactive login hook
  const { handleInteractiveLogin, handleCheckStatus } = useInteractiveLogin({
    onLoginSuccess: () => setLoginStep(2),
    refetchAuthStatus: refetchAuthStatusWrapper,
    isAuthenticated,
    startPolling,
    stopPolling,
  });

  // Handle login
  const handleLogin = useCallback(async (values?: { refreshToken?: string }) => {
    setLoginStep(1);
    
    // Handle token login mode
    if (loginMode === 'token') {
      const refreshToken = values?.refreshToken;
      
      if (!refreshToken || refreshToken.trim() === '') {
        message.error('请输入 refreshToken');
        setLoginStep(0);
        return;
      }
      
      try {
        await loginWithTokenAsync(refreshToken.trim());
        handleLoginSuccess();
      } catch (error: any) {
        const { errorCode, message: errorMessage } = extractErrorInfo(error);
        setLoginStep(0);
        if (errorCode) {
          message.error(translateErrorCode(errorCode, t, undefined, errorMessage || t('AUTH_LOGIN_FAILED')));
        } else {
          message.error(errorMessage || t('AUTH_LOGIN_FAILED'));
        }
      }
      return;
    }
    
    // Interactive mode
    try {
      await handleInteractiveLogin(configData);
    } catch (error: any) {
      const { errorCode, message: errorMessage } = extractErrorInfo(error);
      setLoginStep(0);
      if (errorCode) {
        message.error(translateErrorCode(errorCode, t, undefined, errorMessage || t('AUTH_LOGIN_FAILED')));
      } else {
        message.error(errorMessage || t('AUTH_LOGIN_FAILED'));
      }
    }
  }, [loginMode, loginWithTokenAsync, handleLoginSuccess, handleInteractiveLogin, configData, t]);

  const isLoggingIn = pollingEnabled || loginStep === 1;

  return {
    // State
    loginMode,
    loginStep,
    isLoggingIn,
    isLoggingInWithToken,
    authStatusLoading,
    authStatus,
    isAuthenticated,
    
    // Actions
    setLoginMode,
    handleLogin,
    handleCheckStatus,
    
    // Navigation
    navigate,
  };
}

