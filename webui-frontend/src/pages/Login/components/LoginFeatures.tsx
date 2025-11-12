import { Space, Typography } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * Login features showcase component
 */
export function LoginFeatures() {
  return (
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
  );
}

