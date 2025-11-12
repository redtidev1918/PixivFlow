import React from 'react';
import { Modal, Form, Select, Alert, Space, Tag, Typography } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface ConfigFile {
  filename: string;
  path: string;
  isActive: boolean;
}

interface Target {
  type: 'illustration' | 'novel';
  tag?: string;
  limit?: number;
  [key: string]: any;
}

interface StartDownloadModalProps {
  open: boolean;
  onCancel: () => void;
  onFinish: (values: { targetId?: string; configPaths?: string[] }) => void;
  isSubmitting: boolean;
  configFiles?: ConfigFile[];
  targets?: Target[];
}

export const StartDownloadModal: React.FC<StartDownloadModalProps> = ({
  open,
  onCancel,
  onFinish,
  isSubmitting,
  configFiles = [],
  targets = [],
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title={
        <Space>
          <PlayCircleOutlined />
          <span>{t('download.startDownloadModal')}</span>
        </Space>
      }
      open={open}
      onCancel={handleCancel}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      okText={t('common.start')}
      cancelText={t('common.cancel')}
      width={600}
    >
      <Alert
        message={t('download.startDownloadTip')}
        description={t('download.startDownloadTipDesc')}
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />
      <Form form={form} onFinish={onFinish} layout="vertical">
        <Form.Item
          name="configPaths"
          label={t('download.selectConfigFiles')}
          tooltip={t('download.selectConfigFilesTooltip')}
          extra={t('download.selectConfigFilesExtra')}
        >
          <Select
            mode="multiple"
            placeholder={t('download.selectConfigFilesPlaceholder')}
            allowClear
            size="large"
            showSearch
            filterOption={(input, option) => {
              const label = option?.label as string;
              return label?.toLowerCase().includes(input.toLowerCase()) || false;
            }}
            options={configFiles.map((file) => ({
              label: `${file.filename}${file.isActive ? ` (${t('config.activeConfig')})` : ''}`,
              value: file.path,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="targetId"
          label={t('download.selectTarget')}
          tooltip={t('download.selectTargetTooltip')}
          extra={t('download.selectTargetExtra')}
        >
          <Select
            placeholder={t('download.selectTargetPlaceholder')}
            allowClear
            size="large"
            showSearch
            filterOption={(input, option) => {
              const children = option?.children as any;
              const text = typeof children === 'string' ? children : String(children || '');
              return text.toLowerCase().includes(input.toLowerCase());
            }}
          >
            {targets.map((target, index) => (
              <Select.Option key={index} value={index.toString()}>
                <Space>
                  <Tag color={target.type === 'illustration' ? 'blue' : 'purple'}>
                    {target.type === 'illustration'
                      ? t('download.typeIllustration')
                      : t('download.typeNovel')}
                  </Tag>
                  <Text strong>{target.tag || `Target ${index + 1}`}</Text>
                  {target.limit && (
                    <Text type="secondary">
                      ({t('download.limit')}: {target.limit} {t('download.entries')})
                    </Text>
                  )}
                </Space>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        {targets.length === 0 && (
          <Alert
            message={t('download.noTargetsFound')}
            description={t('download.noTargetsFoundDesc')}
            type="warning"
            showIcon
          />
        )}
      </Form>
    </Modal>
  );
};

