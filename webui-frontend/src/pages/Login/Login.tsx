import { useEffect } from 'react';
import { Space, Spin, Divider, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useLoginFlow } from './hooks';
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
 * Simplified version that uses useLoginFlow hook for all login logic
 */
export default function Login() {
  const { t } = useTranslation();
  const {
    loginMode,
    loginStep,
    isLoggingIn,
    isLoggingInWithToken,
    authStatusLoading,
    authStatus,
    isAuthenticated,
    setLoginMode,
    handleLogin,
    handleCheckStatus,
    navigate,
  } = useLoginFlow();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!authStatusLoading && isAuthenticated(authStatus)) {
      navigate('/dashboard', { replace: true });
    }
  }, [authStatusLoading, authStatus, navigate, isAuthenticated]);

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

