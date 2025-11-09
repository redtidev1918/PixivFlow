import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Form, Input, Button, Card, message, Typography, Alert, Space, Radio, Spin, Modal, Divider, Steps } from 'antd';
import { LoginOutlined, ToolOutlined, CheckCircleOutlined, RocketOutlined, SafetyOutlined, ThunderboltOutlined, ReloadOutlined, KeyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { translateErrorCode, extractErrorInfo } from '../utils/errorCodeTranslator';

const { Title, Text, Paragraph } = Typography;

export default function Login() {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loginMode, setLoginMode] = useState<'interactive' | 'token'>('interactive');
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [loginStep, setLoginStep] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInteractiveLoginActiveRef = useRef<boolean>(false); // Track if interactive login is in progress
  const pollingStartTimeRef = useRef<number | null>(null); // Track when polling started
  const MAX_POLLING_DURATION = 10 * 60 * 1000; // 10 minutes max polling time

  // Check if already logged in
  const { data: authStatus, isLoading: authStatusLoading, refetch: refetchAuthStatus } = useQuery({
    queryKey: ['authStatus'],
    queryFn: () => api.getAuthStatus(),
    retry: false,
    refetchInterval: false, // We'll handle polling manually
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
    onSuccess: (data) => {
      console.log('[Login] Login API success:', data);
      // For interactive mode, verify auth status before redirecting
      // Give backend a moment to update config, then check status
      setTimeout(async () => {
        try {
          const result = await refetchAuthStatus();
          if (isAuthenticated(result)) {
            handleLoginSuccess();
          } else {
            // If API says success but status check fails, continue polling
            console.log('[Login] API success but status check failed, continuing to poll...');
            isInteractiveLoginActiveRef.current = true;
          }
        } catch (error) {
          console.error('[Login] Status check after API success failed:', error);
          // Continue polling as fallback
          isInteractiveLoginActiveRef.current = true;
        }
      }, 1000);
    },
    onError: (error: any) => {
      console.error('[Login] Login API error:', error);
      const { errorCode, message: errorMessage } = extractErrorInfo(error);
      const isTimeout = error?.code === 'ECONNABORTED' || error?.message?.includes('timeout');
      
      // For interactive mode, if it's a timeout, continue polling instead of showing error
      if (loginMode === 'interactive' && isTimeout) {
        console.log('[Login] Interactive login API timeout, but continuing to poll for status...');
        console.log('[Login] This is normal - user may still be completing login in browser');
        // Don't reset login step or show error - let polling handle it
        // Keep isInteractiveLoginActiveRef.current = true so polling continues
        // Show info message instead of error
        message.info('正在等待浏览器登录完成，系统会自动检测登录状态...');
        return;
      }
      
      // For other errors, show error
      stopPolling();
      setLoginStep(0);
      if (errorCode) {
        message.error(translateErrorCode(errorCode, t, undefined, errorMessage || t('AUTH_LOGIN_FAILED')));
      } else {
        message.error(errorMessage || t('AUTH_LOGIN_FAILED'));
      }
    },
  });

  const loginWithTokenMutation = useMutation({
    mutationFn: (refreshToken: string) => api.loginWithToken(refreshToken),
    onSuccess: (data) => {
      console.log('[Login] Login with token API success:', data);
      // Token login is straightforward - just handle success
      handleLoginSuccess();
    },
    onError: (error: any) => {
      console.error('[Login] Login with token API error:', error);
      const { errorCode, message: errorMessage } = extractErrorInfo(error);
      setLoginStep(0);
      if (errorCode) {
        message.error(translateErrorCode(errorCode, t, undefined, errorMessage || t('AUTH_LOGIN_FAILED')));
      } else {
        message.error(errorMessage || t('AUTH_LOGIN_FAILED'));
      }
    },
  });

  // Helper to check if authenticated from API response
  const isAuthenticated = useCallback((response: any): boolean => {
    if (!response) return false;
    // API response structure: response.data.data.authenticated or response.data.authenticated
    const data = response?.data?.data || response?.data;
    const authenticated = data?.authenticated === true || data?.isAuthenticated === true || data?.hasToken === true;
    console.log('[Login] Auth check:', { authenticated, data });
    return authenticated;
  }, []);

  // Stop polling and cleanup
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    isInteractiveLoginActiveRef.current = false;
    pollingStartTimeRef.current = null;
  }, []);

  // Handle successful login
  const handleLoginSuccess = useCallback(() => {
    stopPolling();
    setLoginStep(2);
    message.success('登录成功！正在跳转...');
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['authStatus'] });
    queryClient.invalidateQueries({ queryKey: ['config'] });
    setTimeout(() => {
      navigate('/dashboard', { replace: true });
    }, 1000);
  }, [stopPolling, queryClient, navigate]);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!authStatusLoading && isAuthenticated(authStatus)) {
      navigate('/dashboard', { replace: true });
    }
  }, [authStatusLoading, authStatus, navigate]);

  // Poll authentication status during interactive login
  useEffect(() => {
    // Start polling if:
    // 1. Login mutation is pending (API call in progress), OR
    // 2. Interactive login is active (even if API timed out)
    const shouldPoll = loginMode === 'interactive' && (loginMutation.isPending || isInteractiveLoginActiveRef.current);
    
    if (shouldPoll) {
      // Initialize polling start time if not set
      if (!pollingStartTimeRef.current) {
        pollingStartTimeRef.current = Date.now();
        console.log('[Login] Starting polling for interactive login...');
      }

      // Start polling every 2 seconds
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(async () => {
          try {
            // Check if we've exceeded max polling duration
            if (pollingStartTimeRef.current && Date.now() - pollingStartTimeRef.current > MAX_POLLING_DURATION) {
              console.log('[Login] Polling timeout reached, stopping...');
              stopPolling();
              setLoginStep(0);
              message.warning('登录超时，请重试');
              return;
            }

            console.log('[Login] Polling auth status...');
            const result = await refetchAuthStatus();
            
            if (isAuthenticated(result)) {
              console.log('[Login] Authentication detected via polling!');
              handleLoginSuccess();
            }
          } catch (error) {
            console.error('[Login] Polling error:', error);
            // Continue polling even on error
          }
        }, 2000);
      }
    } else {
      // Stop polling when login is not pending and not in interactive mode
      stopPolling();
    }

    // Cleanup on unmount
    return () => {
      stopPolling();
    };
  }, [loginMutation.isPending, loginMode, refetchAuthStatus, isAuthenticated, handleLoginSuccess, stopPolling]);

  // Manual check login status handler
  const handleCheckStatus = async () => {
    try {
      message.loading({ content: '正在检查登录状态...', key: 'checkStatus', duration: 0 });
      const result = await refetchAuthStatus();
      message.destroy('checkStatus');
      
      if (isAuthenticated(result)) {
        handleLoginSuccess();
      } else {
        message.info('尚未登录，请完成浏览器中的登录流程。系统会自动检测登录状态。');
        // If not authenticated but we're in interactive mode, ensure polling continues
        if (loginMode === 'interactive' && !isInteractiveLoginActiveRef.current) {
          isInteractiveLoginActiveRef.current = true;
          if (!pollingStartTimeRef.current) {
            pollingStartTimeRef.current = Date.now();
          }
        }
      }
    } catch (error) {
      message.destroy('checkStatus');
      message.error('检查登录状态失败');
      console.error('[Login] Manual status check error:', error);
    }
  };

  const handleLogin = (values?: { username?: string; password?: string; refreshToken?: string }) => {
    setLoginStep(1);
    
    // Handle token login mode
    if (loginMode === 'token') {
      const refreshToken = values?.refreshToken || form.getFieldValue('refreshToken');
      if (!refreshToken || refreshToken.trim() === '') {
        message.error('请输入 refreshToken');
        setLoginStep(0);
        return;
      }
      loginWithTokenMutation.mutate(refreshToken.trim());
      return;
    }
    
    // Interactive mode: no username/password needed
    const username = '';
    const password = '';
    
    // Get proxy configuration from config if available
    const proxy = configData?.data?.data?.network?.proxy?.enabled 
      ? configData.data.data.network.proxy 
      : undefined;
    
    // Reset polling state
    stopPolling();
    
    // Mark interactive login as active before starting
    isInteractiveLoginActiveRef.current = true;
    pollingStartTimeRef.current = Date.now();
    console.log('[Login] Starting interactive login, polling will begin...');
    
    loginMutation.mutate({ username, password, headless: false, proxy });
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
          {(loginMutation.isPending || loginWithTokenMutation.isPending) && (
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
          {!loginMutation.isPending && !loginWithTokenMutation.isPending && (
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
                  form.resetFields(['username', 'password', 'refreshToken']);
                }}
                buttonStyle="solid"
                style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: '8px' }}
              >
                <Radio.Button 
                  value="interactive" 
                  style={{ 
                    flex: 1, 
                    minWidth: '120px',
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
                  value="token" 
                  style={{ 
                    flex: 1, 
                    minWidth: '120px',
                    textAlign: 'center',
                    height: '48px',
                    lineHeight: '48px',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  <KeyOutlined /> Token 登录
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

            {loginMode === 'token' && (
              <>
                <Alert
                  message={
                    <span style={{ fontWeight: 600 }}>
                      Token 登录
                    </span>
                  }
                  description={
                    <div style={{ fontSize: '13px' }}>
                      <div style={{ marginBottom: 8 }}>
                        如果您已经有 Pixiv 的 refreshToken，可以直接粘贴使用。系统会自动验证并保存。
                      </div>
                      <div style={{ 
                        padding: '8px 12px', 
                        background: 'rgba(82, 196, 26, 0.1)', 
                        borderRadius: '6px',
                        borderLeft: '3px solid #52c41a',
                      }}>
                        <strong>提示：</strong>refreshToken 可以从浏览器开发者工具中获取，或从其他已登录的配置文件中复制。
                      </div>
                    </div>
                  }
                  type="success"
                  showIcon
                  style={{ marginBottom: 20 }}
                />
                
                <Form.Item
                  name="refreshToken"
                  label={
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>
                      <KeyOutlined style={{ marginRight: 8 }} /> Refresh Token
                    </span>
                  }
                  rules={[
                    { required: true, message: '请输入 refreshToken' },
                    { min: 10, message: 'refreshToken 格式不正确' },
                  ]}
                >
                  <Input.TextArea
                    placeholder="粘贴您的 refreshToken  here..."
                    autoSize={{ minRows: 3, maxRows: 6 }}
                    style={{ fontSize: '14px', fontFamily: 'monospace' }}
                  />
                </Form.Item>
              </>
            )}

            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType={loginMode === 'interactive' || loginMode === 'token' ? 'button' : 'submit'}
                block
                icon={<LoginOutlined />}
                loading={loginMutation.isPending || loginWithTokenMutation.isPending}
                size="large"
                onClick={loginMode === 'interactive' || loginMode === 'token' ? () => handleLogin() : undefined}
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
                {(loginMutation.isPending || loginWithTokenMutation.isPending) ? t('login.loggingIn') : t('login.loginButton')}
              </Button>
            </Form.Item>

            {(loginMutation.isPending || loginWithTokenMutation.isPending) && (
              <Alert
                message={
                  <span style={{ fontWeight: 600 }}>
                    {t('login.processing')}
                  </span>
                }
                description={
                  <div style={{ fontSize: '13px' }}>
                    {loginMode === 'interactive' ? (
                      <div>
                        <div style={{ marginBottom: 8 }}>{t('login.processingInteractiveDesc')}</div>
                        <div style={{ 
                          padding: '8px 12px', 
                          background: 'rgba(24, 144, 255, 0.1)', 
                          borderRadius: '6px',
                          borderLeft: '3px solid #1890ff',
                          marginTop: 8,
                        }}>
                          <div style={{ marginBottom: 8 }}>
                            <strong>提示：</strong>如果您已经在浏览器中完成登录，请点击下方按钮检查登录状态。
                          </div>
                          <Button
                            type="primary"
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={handleCheckStatus}
                            style={{ width: '100%' }}
                          >
                            检查登录状态
                          </Button>
                        </div>
                      </div>
                    ) : loginMode === 'token' ? (
                      '正在验证 refreshToken 并保存到配置文件...'
                    ) : null}
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
          // API response structure: Axios wraps response in .data
          // Backend returns: { success: true, diagnostics: {...}, environment: {...} }
          // Axios response: diagnoseMutation.data.data = { success: true, diagnostics: {...}, ... }
          // TypeScript types expect ApiResponse<T> which has a .data property, but backend returns directly
          // So we access the actual data: if wrapped in ApiResponse, use .data, otherwise use directly
          const apiResponse = diagnoseMutation.data.data as any;
          const responseData = apiResponse?.data || apiResponse;
          const diagnostics = responseData?.diagnostics;
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
                    {JSON.stringify(responseData, null, 2)}
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

