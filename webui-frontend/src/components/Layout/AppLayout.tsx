import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, theme, Select } from 'antd';
import {
  DashboardOutlined,
  SettingOutlined,
  DownloadOutlined,
  HistoryOutlined,
  FileTextOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Header, Sider, Content } = Layout;

export default function AppLayout() {
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer },
  } = theme.useToken();

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
            <Select
              value={i18n.language}
              onChange={handleLanguageChange}
              style={{ width: 120 }}
              options={[
                { label: '中文', value: 'zh-CN' },
                { label: 'English', value: 'en-US' },
              ]}
            />
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

