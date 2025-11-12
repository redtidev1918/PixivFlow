import React from 'react';
import { Form, Switch, Input, InputNumber } from 'antd';
import { useTranslation } from 'react-i18next';
import { FormSection } from '../../../components/forms/FormSection';

export const SchedulerConfigForm: React.FC = () => {
  const { t } = useTranslation();

  return (
    <FormSection title={t('config.tabScheduler')}>
      <Form.Item label={t('config.schedulerEnabled')} name={['scheduler', 'enabled']} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Form.Item label={t('config.schedulerCron')} name={['scheduler', 'cron']}>
        <Input placeholder={t('config.schedulerCronPlaceholder')} />
      </Form.Item>

      <Form.Item label={t('config.schedulerTimezone')} name={['scheduler', 'timezone']}>
        <Input placeholder={t('config.schedulerTimezonePlaceholder')} />
      </Form.Item>

      <Form.Item label={t('config.schedulerMaxExecutions')} name={['scheduler', 'maxExecutions']}>
        <InputNumber min={1} style={{ width: '100%' }} placeholder={t('config.schedulerMaxExecutionsPlaceholder')} />
      </Form.Item>

      <Form.Item label={t('config.schedulerMinInterval')} name={['scheduler', 'minInterval']}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label={t('config.schedulerTimeout')} name={['scheduler', 'timeout']}>
        <InputNumber min={1000} style={{ width: '100%' }} placeholder={t('config.schedulerTimeoutPlaceholder')} />
      </Form.Item>
    </FormSection>
  );
};

