import { Outlet } from 'react-router-dom';
import { Layout, theme } from 'antd';
import { useState } from 'react';
import { LayoutHeader, LayoutSider } from './components';
import { useLayoutAuth } from './hooks';

const { Content } = Layout;

/**
 * Main application layout component
 */
export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const {
    isAuthenticated,
    isLoggingOut,
    isRefreshingToken,
    handleLogin,
    handleLogout,
    handleRefreshToken,
  } = useLayoutAuth();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <LayoutSider collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout>
        <LayoutHeader
          isAuthenticated={isAuthenticated}
          isLoggingOut={isLoggingOut}
          isRefreshingToken={isRefreshingToken}
          onLogin={handleLogin}
          onLogout={handleLogout}
          onRefreshToken={handleRefreshToken}
          colorBgContainer={colorBgContainer}
        />
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

