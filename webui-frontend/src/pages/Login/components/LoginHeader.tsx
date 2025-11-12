import { Typography } from 'antd';
import { RocketOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

/**
 * Login page header component
 */
export function LoginHeader() {
  const { t } = useTranslation();

  return (
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
  );
}

