import { useMutation, useQuery } from '@tanstack/react-query';
import { Form, Input, Button, Card, message, Typography, Alert, Space, Radio, Spin } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { translateErrorCode, extractErrorInfo } from '../utils/errorCodeTranslator';

const { Title, Text, Paragraph } = Typography;

export default function Login() {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loginMode, setLoginMode] = useState<'headless' | 'interactive'>('interactive');
  const navigate = useNavigate();

  // Check if already logged in
  const { data: authStatus, isLoading: authStatusLoading } = useQuery({
    queryKey: ['authStatus'],
    queryFn: () => api.getAuthStatus(),
    retry: false,
  });

  // If already authenticated, redirect to dashboard
  if (!authStatusLoading && authStatus?.data?.authenticated) {
    navigate('/dashboard', { replace: true });
    return null;
  }

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

  // Get config to read proxy settings
  const { data: configData } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  });

  const loginMutation = useMutation({
    mutationFn: ({ username, password, headless, proxy }: { username: string; password: string; headless: boolean; proxy?: any }) =>
      api.login(username, password, headless, proxy),
    onSuccess: () => {
      message.success(t('AUTH_LOGIN_SUCCESS'));
      // 登录成功后，刷新页面或跳转到仪表盘
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
    },
    onError: (error: any) => {
      const { errorCode, message: errorMessage } = extractErrorInfo(error);
      if (errorCode) {
        message.error(translateErrorCode(errorCode, t, undefined, errorMessage || t('AUTH_LOGIN_FAILED')));
      } else {
        message.error(errorMessage || t('AUTH_LOGIN_FAILED'));
      }
    },
  });

  const handleLogin = (values: { username: string; password: string }) => {
    const headless = loginMode === 'headless';
    // 交互模式不需要用户名和密码，使用空字符串
    const username = headless ? values.username : '';
    const password = headless ? values.password : '';
    
    // Get proxy configuration from config if available
    const proxy = configData?.data?.network?.proxy?.enabled 
      ? configData.data.network.proxy 
      : undefined;
    
    loginMutation.mutate({ username, password, headless, proxy });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
              PixivFlow
            </Title>
            <Text type="secondary">{t('login.subtitle')}</Text>
          </div>

          <Alert
            message={t('login.requirements')}
            description={t('login.requirementsDesc')}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form
            form={form}
            name="login"
            onFinish={handleLogin}
            layout="vertical"
            size="large"
            autoComplete="off"
          >
            <Form.Item
              label={t('login.loginMode')}
              style={{ marginBottom: 16 }}
            >
              <Radio.Group
                value={loginMode}
                onChange={(e) => {
                  setLoginMode(e.target.value);
                  form.resetFields(['username', 'password']);
                }}
                buttonStyle="solid"
                style={{ width: '100%' }}
              >
                <Radio.Button value="interactive" style={{ flex: 1, textAlign: 'center' }}>
                  {t('login.loginModeInteractive')}
                </Radio.Button>
                <Radio.Button value="headless" style={{ flex: 1, textAlign: 'center' }}>
                  {t('login.loginModeHeadless')}
                </Radio.Button>
              </Radio.Group>
            </Form.Item>

            {loginMode === 'interactive' && (
              <Alert
                message={t('login.loginModeInteractive')}
                description={
                  <>
                    <div>{t('login.loginModeInteractiveDesc')}</div>
                    <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                      {t('login.browserWindowNote')}
                    </div>
                  </>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            {loginMode === 'headless' && (
              <>
                <Form.Item
                  name="username"
                  label={t('login.username')}
                  rules={[
                    { required: true, message: t('login.usernameRequired') },
                  ]}
                >
                  <Input
                    prefix={<UserOutlined />}
                    placeholder={t('login.usernamePlaceholder')}
                    autoComplete="username"
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  label={t('login.password')}
                  rules={[
                    { required: true, message: t('login.passwordRequired') },
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder={t('login.passwordPlaceholder')}
                    autoComplete="current-password"
                  />
                </Form.Item>
              </>
            )}

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                icon={<LoginOutlined />}
                loading={loginMutation.isPending}
                size="large"
              >
                {loginMutation.isPending ? t('login.loggingIn') : t('login.loginButton')}
              </Button>
            </Form.Item>
            {loginMutation.isPending && (
              <Alert
                message={t('login.processing')}
                description={
                  loginMode === 'interactive'
                    ? t('login.processingInteractiveDesc')
                    : t('login.processingDesc')
                }
                type="info"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}
          </Form>

          <div style={{ textAlign: 'center' }}>
            <Paragraph type="secondary" style={{ fontSize: '12px', margin: 0 }}>
              {t('login.note')}
            </Paragraph>
          </div>
        </Space>
      </Card>
    </div>
  );
}

