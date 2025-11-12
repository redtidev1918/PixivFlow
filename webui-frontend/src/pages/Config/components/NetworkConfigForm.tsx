import React from 'react';
import { Form, InputNumber, Input, Select, Switch, Divider } from 'antd';
import { useTranslation } from 'react-i18next';
import { FormSection } from '../../../components/forms/FormSection';

const { Option } = Select;

export const NetworkConfigForm: React.FC = () => {
  const { t } = useTranslation();

  return (
    <FormSection title={t('config.tabNetwork')}>
      <Form.Item label={t('config.networkTimeout')} name={['network', 'timeoutMs']}>
        <InputNumber min={1000} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label={t('config.networkRetries')} name={['network', 'retries']}>
        <InputNumber min={0} max={10} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label={t('config.networkRetryDelay')} name={['network', 'retryDelay']}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>

      <Divider>{t('config.proxySettings')}</Divider>

      <Form.Item label={t('config.proxyEnabled')} name={['network', 'proxy', 'enabled']} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item
        noStyle
        shouldUpdate={(prevValues, currentValues) =>
          prevValues.network?.proxy?.enabled !== currentValues.network?.proxy?.enabled
        }
      >
        {({ getFieldValue }) =>
          getFieldValue(['network', 'proxy', 'enabled']) ? (
            <>
              <Form.Item label={t('config.proxyHost')} name={['network', 'proxy', 'host']}>
                <Input />
              </Form.Item>
              <Form.Item label={t('config.proxyPort')} name={['network', 'proxy', 'port']}>
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label={t('config.proxyProtocol')} name={['network', 'proxy', 'protocol']}>
                <Select>
                  <Option value="http">HTTP</Option>
                  <Option value="https">HTTPS</Option>
                  <Option value="socks4">SOCKS4</Option>
                  <Option value="socks5">SOCKS5</Option>
                </Select>
              </Form.Item>
              <Form.Item label={t('config.proxyUsername')} name={['network', 'proxy', 'username']}>
                <Input />
              </Form.Item>
              <Form.Item label={t('config.proxyPassword')} name={['network', 'proxy', 'password']}>
                <Input.Password />
              </Form.Item>
            </>
          ) : null
        }
      </Form.Item>
    </FormSection>
  );
};

