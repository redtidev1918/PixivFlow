import { Layout, Space, Button, Select } from 'antd';

const { Header } = Layout;
import {
  LoginOutlined,
  LogoutOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface LayoutHeaderProps {
  isAuthenticated: boolean;
  isLoggingOut: boolean;
  isRefreshingToken: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onRefreshToken: () => void;
  colorBgContainer: string;
}

/**
 * Layout header component
 */
export default function LayoutHeader({
  isAuthenticated,
  isLoggingOut,
  isRefreshingToken,
  onLogin,
  onLogout,
  onRefreshToken,
  colorBgContainer,
}: LayoutHeaderProps) {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (value: string) => {
    i18n.changeLanguage(value);
  };

  return (
    <Header style={{ padding: 0, background: colorBgContainer }}>
      <div
        style={{
          padding: '0 24px',
          lineHeight: '64px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '20px' }}>{t('layout.title')}</h1>
        <Space>
          {isAuthenticated ? (
            <>
              <Button
                icon={<ReloadOutlined />}
                onClick={onRefreshToken}
                loading={isRefreshingToken}
              >
                {t('layout.refreshToken')}
              </Button>
              <Button
                danger
                icon={<LogoutOutlined />}
                onClick={onLogout}
                loading={isLoggingOut}
              >
                {t('layout.logout')}
              </Button>
            </>
          ) : (
            <Button
              type="primary"
              icon={<LoginOutlined />}
              onClick={onLogin}
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
  );
}

