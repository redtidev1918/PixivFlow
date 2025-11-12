import React from 'react';
import { Form, InputNumber } from 'antd';
import { useTranslation } from 'react-i18next';
import { FormSection } from '../../../components/forms/FormSection';

export const DownloadConfigForm: React.FC = () => {
  const { t } = useTranslation();

  return (
    <FormSection title={t('config.tabDownload')}>
      <Form.Item label={t('config.downloadConcurrency')} name={['download', 'concurrency']}>
        <InputNumber min={1} max={10} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label={t('config.downloadMaxRetries')} name={['download', 'maxRetries']}>
        <InputNumber min={0} max={10} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label={t('config.downloadRetryDelay')} name={['download', 'retryDelay']}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label={t('config.downloadTimeout')} name={['download', 'timeout']}>
        <InputNumber min={1000} style={{ width: '100%' }} />
      </Form.Item>
    </FormSection>
  );
};

