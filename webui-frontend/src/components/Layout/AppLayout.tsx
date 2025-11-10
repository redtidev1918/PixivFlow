import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, theme, Select, Button, Space, message } from 'antd';
import {
  DashboardOutlined,
  SettingOutlined,
  DownloadOutlined,
  HistoryOutlined,
  FileTextOutlined,
  FolderOutlined,
  LoginOutlined,
  LogoutOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';

const { Header, Sider, Content } = Layout;

export default function AppLayout() {
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  // Check authentication status
  const { data: authStatus } = useQuery({
    queryKey: ['authStatus'],
    queryFn: () => api.getAuthStatus(),
    retry: false,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Helper to check if authenticated
  const isAuthenticated = (): boolean => {
    if (!authStatus) return false;
    const responseData = (authStatus as any)?.data?.data || (authStatus as any)?.data;
    return responseData?.authenticated === true 
      || responseData?.isAuthenticated === true 
      || responseData?.hasToken === true;
  };

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: t('layout.dashboard'),
    },
    {
      key: '/config',
      icon: <SettingOutlined />,
      label: t('layout.config'),
    },
    {
      key: '/download',
      icon: <DownloadOutlined />,
      label: t('layout.download'),
    },
    {
      key: '/history',
      icon: <HistoryOutlined />,
      label: t('layout.history'),
    },
    {
      key: '/logs',
      icon: <FileTextOutlined />,
      label: t('layout.logs'),
    },
    {
      key: '/files',
      icon: <FolderOutlined />,
      label: t('layout.files'),
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const handleLanguageChange = (value: string) => {
    i18n.changeLanguage(value);
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
      await queryClient.invalidateQueries({ queryKey: ['authStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['config'] });
      
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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
      >
        <div
          style={{
            height: 32,
            margin: 16,
            background: 'rgba(255, 255, 255, 0.3)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
          }}
        >
          {collapsed ? 'PF' : 'PixivFlow'}
        </div>
        <Menu
          theme="dark"
          selectedKeys={[location.pathname]}
          mode="inline"
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }}>
          <div style={{ padding: '0 24px', lineHeight: '64px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ margin: 0, fontSize: '20px' }}>{t('layout.title')}</h1>
            <Space>
              {isAuthenticated() ? (
                <>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleRefreshToken}
                    loading={isRefreshingToken}
                  >
                    {t('layout.refreshToken')}
                  </Button>
                  <Button
                    danger
                    icon={<LogoutOutlined />}
                    onClick={handleLogout}
                    loading={isLoggingOut}
                  >
                    {t('layout.logout')}
                  </Button>
                </>
              ) : (
                <Button
                  type="primary"
                  icon={<LoginOutlined />}
                  onClick={handleLogin}
                >
                  {t('layout.login')}
                </Button>
              )}
              <Select
                value={i18n.language}
                onChange={handleLanguageChange}
                style={{ width: 120 }}
                options={[
                  { label: t('layout.languageZh'), value: 'zh-CN' },
                  { label: t('layout.languageEn'), value: 'en-US' },
                ]}
              />
            </Space>
          </div>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

