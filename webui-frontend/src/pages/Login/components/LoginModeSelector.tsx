import { Form, Radio, Alert } from 'antd';
import { SafetyOutlined, KeyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface LoginModeSelectorProps {
  value: 'interactive' | 'token';
  onChange: (mode: 'interactive' | 'token') => void;
  onResetFields: () => void;
}

/**
 * Login mode selector component
 */
export function LoginModeSelector({ value, onChange, onResetFields }: LoginModeSelectorProps) {
  const { t } = useTranslation();

  return (
    <>
      <Form.Item
        label={
          <span style={{ fontSize: '15px', fontWeight: 600 }}>
            {t('login.loginMode')}
          </span>
        }
        style={{ marginBottom: 20 }}
      >
        <Radio.Group
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setTimeout(() => {
              onResetFields();
            }, 0);
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

      {value === 'interactive' && (
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

      {value === 'token' && (
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
      )}
    </>
  );
}

