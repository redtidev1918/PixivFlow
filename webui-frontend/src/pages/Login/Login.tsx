import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Space, Spin, Divider, Typography, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { translateErrorCode, extractErrorInfo } from '../../utils/errorCodeTranslator';
import { QUERY_KEYS } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import { useLoginPolling } from '../../hooks/useLoginPolling';
import { useInteractiveLogin } from '../../hooks/useInteractiveLogin';
import {
  LoginCard,
  LoginHeader,
  LoginFeatures,
  LoginSteps,
  LoginModeSelector,
  LoginForm,
} from './components';

const { Paragraph } = Typography;

/**
 * Login page component
 */
export default function Login() {
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
  const isAuthenticated = useCallback((response: any): boolean => {
    if (!response) return false;
    const data = response?.data?.data || response?.data;
    const authenticated = data?.authenticated === true || data?.isAuthenticated === true || data?.hasToken === true;
    console.log('[Login] Auth check:', { authenticated, data });
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

  // Use login polling hook
  useLoginPolling({
    enabled: pollingEnabled,
    onAuthenticated: () => {
      handleLoginSuccess();
    },
    refetchAuthStatus,
    isAuthenticated,
  });


  // Use interactive login hook
  const { handleInteractiveLogin, handleCheckStatus } = useInteractiveLogin({
    onLoginSuccess: () => setLoginStep(2),
    refetchAuthStatus,
    isAuthenticated,
    startPolling,
    stopPolling,
  });

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!authStatusLoading && isAuthenticated(authStatus)) {
      navigate('/dashboard', { replace: true });
    }
  }, [authStatusLoading, authStatus, navigate, isAuthenticated]);

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

  // Show loading while checking auth status
  if (authStatusLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  const isLoggingIn = pollingEnabled || loginStep === 1;

  return (
    <LoginCard>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <LoginHeader />

        {(isLoggingIn || isLoggingInWithToken) && (
          <LoginSteps current={loginStep} />
        )}

        {!isLoggingIn && !isLoggingInWithToken && (
          <LoginFeatures />
        )}

        <Divider style={{ margin: '8px 0' }} />

        <LoginModeSelector
          value={loginMode}
          onChange={setLoginMode}
          onResetFields={() => {
            const form = document.querySelector('form[name="login"]') as HTMLFormElement;
            if (form) {
              form.reset();
            }
          }}
        />

        <LoginForm
          loginMode={loginMode}
          isLoggingIn={isLoggingIn}
          isLoggingInWithToken={isLoggingInWithToken}
          onLogin={handleLogin}
          onCheckStatus={handleCheckStatus}
        />

        <Divider style={{ margin: '8px 0' }} />

        <div style={{ textAlign: 'center' }}>
          <Paragraph 
            type="secondary" 
            style={{ 
              fontSize: '12px', 
              margin: '0 0 12px 0',
              lineHeight: '1.6',
            }}
          >
            {t('login.note')}
          </Paragraph>
        </div>
      </Space>
    </LoginCard>
  );
}

