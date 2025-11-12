import React from 'react';
import { Form, InputNumber, Select, Tooltip, Space } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { FormSection } from '../../../components/forms/FormSection';

const { Option } = Select;

export const BasicConfigForm: React.FC = () => {
  const { t } = useTranslation();

  return (
    <FormSection title={t('config.tabBasic')}>
      <Form.Item
        label={
          <Space>
            {t('config.logLevel')}
            <Tooltip title={t('config.logLevelTooltip')}>
              <QuestionCircleOutlined style={{ color: '#999' }} />
            </Tooltip>
          </Space>
        }
        name="logLevel"
      >
        <Select>
          <Option value="debug">{t('config.logLevelDebug')}</Option>
          <Option value="info">{t('config.logLevelInfo')}</Option>
          <Option value="warn">{t('config.logLevelWarn')}</Option>
          <Option value="error">{t('config.logLevelError')}</Option>
        </Select>
      </Form.Item>

      <Form.Item
        label={
          <Space>
            {t('config.initialDelay')}
            <Tooltip title={t('config.initialDelayTooltip')}>
              <QuestionCircleOutlined style={{ color: '#999' }} />
            </Tooltip>
          </Space>
        }
        name="initialDelay"
      >
        <InputNumber min={0} style={{ width: '100%' }} placeholder={t('config.initialDelayPlaceholder')} />
      </Form.Item>
    </FormSection>
  );
};

