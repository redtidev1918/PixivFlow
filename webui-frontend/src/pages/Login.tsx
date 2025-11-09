import { useMutation, useQuery } from '@tanstack/react-query';
import { Form, Input, Button, Card, message, Typography, Alert, Space, Radio, Spin, Modal, Divider, Steps } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined, ToolOutlined, CheckCircleOutlined, RocketOutlined, SafetyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { translateErrorCode, extractErrorInfo } from '../utils/errorCodeTranslator';

const { Title, Text, Paragraph } = Typography;

export default function Login() {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loginMode, setLoginMode] = useState<'headless' | 'interactive'>('interactive');
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [loginStep, setLoginStep] = useState(0);
  const navigate = useNavigate();

  // Check if already logged in
  const { data: authStatus, isLoading: authStatusLoading } = useQuery({
    queryKey: ['authStatus'],
    queryFn: () => api.getAuthStatus(),
    retry: false,
  });

  // Get config to read proxy settings
  const { data: configData } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  });

  const diagnoseMutation = useMutation({
    mutationFn: () => api.diagnoseLogin(),
    onSuccess: () => {
      setDiagnosticsVisible(true);
    },
    onError: (error: any) => {
      message.error('诊断失败: ' + (error.response?.data?.message || error.message));
    },
  });

  const loginMutation = useMutation({
    mutationFn: ({ username, password, headless, proxy }: { username: string; password: string; headless: boolean; proxy?: any }) =>
      api.login(username, password, headless, proxy),
    onSuccess: () => {
      setLoginStep(2);
      message.success(t('AUTH_LOGIN_SUCCESS'));
      // 登录成功后，刷新页面或跳转到仪表盘
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500);
    },
    onError: (error: any) => {
      setLoginStep(0);
      const { errorCode, message: errorMessage } = extractErrorInfo(error);
      if (errorCode) {
        message.error(translateErrorCode(errorCode, t, undefined, errorMessage || t('AUTH_LOGIN_FAILED')));
      } else {
        message.error(errorMessage || t('AUTH_LOGIN_FAILED'));
      }
    },
  });

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!authStatusLoading && authStatus?.data?.authenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [authStatusLoading, authStatus, navigate]);

  const handleLogin = (values?: { username?: string; password?: string }) => {
    setLoginStep(1);
    const headless = loginMode === 'headless';
    // 交互模式不需要用户名和密码，使用空字符串
    const username = headless ? (values?.username || '') : '';
    const password = headless ? (values?.password || '') : '';
    
    // Get proxy configuration from config if available
    const proxy = configData?.data?.network?.proxy?.enabled 
      ? configData.data.network.proxy 
      : undefined;
    
    loginMutation.mutate({ username, password, headless, proxy });
  };

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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-5%',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
        filter: 'blur(60px)',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-5%',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
        filter: 'blur(60px)',
      }} />

      <Card
        style={{
          width: '100%',
          maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          borderRadius: '16px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 头部 */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 16px rgba(102, 126, 234, 0.4)',
            }}>
              <RocketOutlined style={{ fontSize: '40px', color: 'white' }} />
            </div>
            <Title level={2} style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 700 }}>
              PixivFlow
            </Title>
            <Text type="secondary" style={{ fontSize: '15px' }}>
              {t('login.subtitle')}
            </Text>
          </div>

          {/* 登录步骤指示器 */}
          {loginMutation.isPending && (
            <Steps
              current={loginStep}
              size="small"
              items={[
                { title: '选择模式', icon: <SafetyOutlined /> },
                { title: '认证中', icon: <ThunderboltOutlined /> },
                { title: '完成', icon: <CheckCircleOutlined /> },
              ]}
              style={{ marginBottom: 8 }}
            />
          )}

          {/* 功能特点 */}
          {!loginMutation.isPending && (
            <div style={{
              background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
              padding: '16px',
              borderRadius: '12px',
              marginBottom: 8,
            }}>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '16px' }} />
                  <Text style={{ fontSize: '13px' }}>安全的 OAuth 认证流程</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '16px' }} />
                  <Text style={{ fontSize: '13px' }}>自动保存登录凭证</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '16px' }} />
                  <Text style={{ fontSize: '13px' }}>支持多种登录方式</Text>
                </div>
              </Space>
            </div>
          )}

          <Divider style={{ margin: '8px 0' }} />

          <Form
            form={form}
            name="login"
            onFinish={handleLogin}
            layout="vertical"
            size="large"
            autoComplete="off"
          >
            <Form.Item
              label={
                <span style={{ fontSize: '15px', fontWeight: 600 }}>
                  {t('login.loginMode')}
                </span>
              }
              style={{ marginBottom: 20 }}
            >
              <Radio.Group
                value={loginMode}
                onChange={(e) => {
                  setLoginMode(e.target.value);
                  form.resetFields(['username', 'password']);
                }}
                buttonStyle="solid"
                style={{ width: '100%', display: 'flex' }}
              >
                <Radio.Button 
                  value="interactive" 
                  style={{ 
                    flex: 1, 
                    textAlign: 'center',
                    height: '48px',
                    lineHeight: '48px',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  <SafetyOutlined /> {t('login.loginModeInteractive')}
                </Radio.Button>
                <Radio.Button 
                  value="headless" 
                  style={{ 
                    flex: 1, 
                    textAlign: 'center',
                    height: '48px',
                    lineHeight: '48px',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  <ThunderboltOutlined /> {t('login.loginModeHeadless')}
                </Radio.Button>
              </Radio.Group>
            </Form.Item>

            {loginMode === 'interactive' && (
              <Alert
                message={
                  <span style={{ fontWeight: 600 }}>
                    {t('login.loginModeInteractive')}
                  </span>
                }
                description={
                  <div style={{ fontSize: '13px' }}>
                    <div style={{ marginBottom: 8 }}>{t('login.loginModeInteractiveDesc')}</div>
                    <div style={{ 
                      padding: '8px 12px', 
                      background: 'rgba(24, 144, 255, 0.1)', 
                      borderRadius: '6px',
                      borderLeft: '3px solid #1890ff',
                    }}>
                      {t('login.browserWindowNote')}
                    </div>
                  </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: 20 }}
              />
            )}

            {loginMode === 'headless' && (
              <>
                <Alert
                  message={
                    <span style={{ fontWeight: 600 }}>
                      {t('login.loginModeHeadless')}
                    </span>
                  }
                  description={
                    <div style={{ fontSize: '13px' }}>
                      {t('login.loginModeHeadlessDesc')}
                    </div>
                  }
                  type="warning"
                  showIcon
                  style={{ marginBottom: 20 }}
                />
                
                <Form.Item
                  name="username"
                  label={
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>
                      {t('login.username')}
                    </span>
                  }
                  rules={[
                    { required: true, message: t('login.usernameRequired') },
                  ]}
                >
                  <Input
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder={t('login.usernamePlaceholder')}
                    autoComplete="username"
                    style={{ height: '44px', fontSize: '14px' }}
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  label={
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>
                      {t('login.password')}
                    </span>
                  }
                  rules={[
                    { required: true, message: t('login.passwordRequired') },
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#bfbfbfbf' }} />}
                    placeholder={t('login.passwordPlaceholder')}
                    autoComplete="current-password"
                    style={{ height: '44px', fontSize: '14px' }}
                  />
                </Form.Item>
              </>
            )}

            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType={loginMode === 'interactive' ? 'button' : 'submit'}
                block
                icon={<LoginOutlined />}
                loading={loginMutation.isPending}
                size="large"
                onClick={loginMode === 'interactive' ? () => handleLogin() : undefined}
                style={{
                  height: '48px',
                  fontSize: '16px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
                }}
              >
                {loginMutation.isPending ? t('login.loggingIn') : t('login.loginButton')}
              </Button>
            </Form.Item>

            {loginMutation.isPending && (
              <Alert
                message={
                  <span style={{ fontWeight: 600 }}>
                    {t('login.processing')}
                  </span>
                }
                description={
                  <div style={{ fontSize: '13px' }}>
                    {loginMode === 'interactive'
                      ? t('login.processingInteractiveDesc')
                      : t('login.processingDesc')}
                  </div>
                }
                type="info"
                showIcon
                style={{ marginTop: 0 }}
              />
            )}
          </Form>

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
            
            <Button
              type="link"
              icon={<ToolOutlined />}
              onClick={() => diagnoseMutation.mutate()}
              loading={diagnoseMutation.isPending}
              style={{ fontSize: '13px' }}
            >
              诊断登录环境
            </Button>
          </div>
        </Space>
      </Card>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ToolOutlined style={{ color: '#1890ff' }} />
            <span style={{ fontSize: '18px', fontWeight: 600 }}>登录环境诊断</span>
          </div>
        }
        open={diagnosticsVisible}
        onCancel={() => setDiagnosticsVisible(false)}
        footer={[
          <Button 
            key="close" 
            type="primary"
            onClick={() => setDiagnosticsVisible(false)}
            style={{
              borderRadius: '6px',
              fontWeight: 500,
            }}
          >
            关闭
          </Button>,
        ]}
        width={800}
        style={{ top: 40 }}
      >
        {diagnoseMutation.data && (() => {
          const diagnostics = diagnoseMutation.data.data.diagnostics;
          const puppeteerAvailable = diagnostics?.puppeteer?.available;
          const gpptAvailable = diagnostics?.pythonGppt?.available;
          const recommendation = diagnostics?.recommendation;
          
          // 判断是否有可用的登录方式
          const hasLoginMethod = puppeteerAvailable || gpptAvailable;
          
          return (
            <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
              <Alert
                message={
                  <span style={{ fontSize: '15px', fontWeight: 600 }}>
                    {hasLoginMethod ? '✅ 登录环境正常' : '❌ 登录环境异常'}
                  </span>
                }
                description={
                  <span style={{ fontSize: '13px' }}>
                    {hasLoginMethod
                      ? recommendation || '至少有一种登录方式可用。'
                      : '未找到可用的登录方式，请检查依赖安装。'}
                  </span>
                }
                type={hasLoginMethod ? 'success' : 'error'}
                showIcon
                style={{ 
                  marginBottom: 20,
                  borderRadius: '8px',
                  border: hasLoginMethod ? '1px solid #b7eb8f' : '1px solid #ffccc7',
                }}
              />
              
              {/* 显示各个登录方式的状态 */}
              {diagnostics && (
                <div style={{ marginBottom: 20 }}>
                  <Title level={5} style={{ marginBottom: 12, fontSize: '15px' }}>
                    可用的登录方式
                  </Title>
                  {diagnostics.puppeteer && (
                    <Card
                      size="small"
                      style={{ 
                        marginBottom: 12,
                        borderRadius: '8px',
                        border: diagnostics.puppeteer.available 
                          ? '1px solid #b7eb8f' 
                          : '1px solid #ffe58f',
                        background: diagnostics.puppeteer.available 
                          ? '#f6ffed' 
                          : '#fffbe6',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ 
                          fontSize: '24px',
                          marginTop: '4px',
                        }}>
                          {diagnostics.puppeteer.available ? '✅' : '⚠️'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontSize: '14px', 
                            fontWeight: 600,
                            marginBottom: '4px',
                            color: diagnostics.puppeteer.available ? '#52c41a' : '#faad14',
                          }}>
                            Puppeteer (交互模式)
                            {diagnostics.puppeteer.recommended && (
                              <span style={{
                                marginLeft: '8px',
                                padding: '2px 8px',
                                background: '#1890ff',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 500,
                              }}>
                                推荐
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '13px', color: '#666' }}>
                            {diagnostics.puppeteer.description}
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}
                  {diagnostics.pythonGppt && (
                    <Card
                      size="small"
                      style={{ 
                        borderRadius: '8px',
                        border: diagnostics.pythonGppt.available 
                          ? '1px solid #b7eb8f' 
                          : '1px solid #ffe58f',
                        background: diagnostics.pythonGppt.available 
                          ? '#f6ffed' 
                          : '#fffbe6',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ 
                          fontSize: '24px',
                          marginTop: '4px',
                        }}>
                          {diagnostics.pythonGppt.available ? '✅' : '⚠️'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontSize: '14px', 
                            fontWeight: 600,
                            marginBottom: '4px',
                            color: diagnostics.pythonGppt.available ? '#52c41a' : '#faad14',
                          }}>
                            Python gppt (无头模式)
                          </div>
                          <div style={{ fontSize: '13px', color: '#666' }}>
                            {diagnostics.pythonGppt.description}
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              )}
              
              <Divider style={{ margin: '20px 0' }} />
              
              <div style={{ marginBottom: 16 }}>
                <Title level={5} style={{ marginBottom: 12, fontSize: '15px' }}>
                  详细诊断信息
                </Title>
                <div style={{ 
                  background: '#f5f5f5', 
                  padding: 16, 
                  borderRadius: 8, 
                  fontFamily: 'Monaco, Consolas, monospace', 
                  fontSize: 12,
                  maxHeight: '300px',
                  overflow: 'auto',
                }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(diagnoseMutation.data.data, null, 2)}
                  </pre>
                </div>
              </div>

              {!hasLoginMethod && (
                <>
                  <Divider style={{ margin: '20px 0' }} />
                  <Alert
                    message={
                      <span style={{ fontSize: '15px', fontWeight: 600 }}>
                        💡 解决方案
                      </span>
                    }
                    description={
                      <div style={{ fontSize: '13px' }}>
                        <div style={{ 
                          padding: '12px', 
                          background: '#e6f7ff',
                          borderRadius: '6px',
                          marginBottom: '12px',
                          borderLeft: '3px solid #1890ff',
                        }}>
                          <p style={{ margin: '0 0 8px 0' }}>
                            <strong>推荐方案（无需 Python）：</strong>
                          </p>
                          <p style={{ margin: '0 0 8px 0' }}>
                            Puppeteer 应该已经随项目安装。如果不可用，请尝试：
                          </p>
                          <ol style={{ margin: 0, paddingLeft: '20px' }}>
                            <li>在项目目录运行: <code style={{ 
                              background: '#fff',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              border: '1px solid #d9d9d9',
                            }}>npm install</code></li>
                            <li>重启应用后重试</li>
                          </ol>
                        </div>
                        
                        <div style={{ 
                          padding: '12px', 
                          background: '#fff7e6',
                          borderRadius: '6px',
                          borderLeft: '3px solid #faad14',
                        }}>
                          <p style={{ margin: '0 0 8px 0' }}>
                            <strong>备选方案（使用 Python）：</strong>
                          </p>
                          <ol style={{ margin: 0, paddingLeft: '20px' }}>
                            <li>安装 Python 3.9+: <a href="https://www.python.org/downloads/" target="_blank" rel="noopener noreferrer">https://www.python.org/downloads/</a></li>
                            <li>安装 gppt: 在终端运行 <code style={{ 
                              background: '#fff',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              border: '1px solid #d9d9d9',
                            }}>pip install gppt</code></li>
                            <li>重启应用后重试</li>
                          </ol>
                        </div>
                      </div>
                    }
                    type="info"
                    showIcon
                    style={{ 
                      borderRadius: '8px',
                      border: '1px solid #91d5ff',
                    }}
                  />
                </>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

