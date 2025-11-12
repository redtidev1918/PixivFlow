import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  SettingOutlined,
  DownloadOutlined,
  HistoryOutlined,
  FileTextOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

const { Sider } = Layout;

interface LayoutSiderProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}

/**
 * Layout sidebar component
 */
export default function LayoutSider({ collapsed, onCollapse }: LayoutSiderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

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

  return (
    <Sider collapsible collapsed={collapsed} onCollapse={onCollapse} theme="dark">
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
  );
}

