import React from 'react';
import { Card, Table, Button, Space, Tag, Typography, Alert, Popconfirm } from 'antd';
import { PlayCircleOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConfigHistory } from '../../../hooks/useConfig';
import { useErrorHandler } from '../../../hooks/useErrorHandler';
import { message } from 'antd';

const { Text } = Typography;

interface ConfigHistoryItem {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  is_active: number;
}

interface ConfigHistoryManagerProps {
  onConfigApplied?: () => void;
}

export const ConfigHistoryManager: React.FC<ConfigHistoryManagerProps> = ({
  onConfigApplied,
}) => {
  const { t } = useTranslation();
  const { history, isLoading, refetch, applyAsync, deleteAsync } = useConfigHistory();
  const { handleError } = useErrorHandler();

  const handleApply = async (id: number) => {
    try {
      await applyAsync(id);
      message.success(t('config.configApplied'));
      if (onConfigApplied) {
        onConfigApplied();
      }
    } catch (error: any) {
      handleError(error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAsync(id);
      message.success(t('config.historyDeleted'));
      refetch();
    } catch (error: any) {
      handleError(error);
    }
  };

  const columns = [
    {
      title: t('config.historyName'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ConfigHistoryItem) => (
        <Space>
          <Text strong={record.is_active === 1}>{name}</Text>
          {record.is_active === 1 && (
            <Tag color="green">{t('config.activeConfig')}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('config.historyDescription'),
      dataIndex: 'description',
      key: 'description',
      render: (desc: string | null) => desc || <Text type="secondary">-</Text>,
    },
    {
      title: t('config.historyCreatedAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('config.historyUpdatedAt'),
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 200,
      render: (_: any, record: ConfigHistoryItem) => (
        <Space>
          <Button
            type="link"
            icon={<PlayCircleOutlined />}
            onClick={() => handleApply(record.id)}
            size="small"
          >
            {t('config.apply')}
          </Button>
          <Popconfirm
            title={t('config.deleteHistoryConfirm')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.ok')}
            cancelText={t('common.cancel')}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={t('config.configHistory')}
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
          {t('common.refresh')}
        </Button>
      }
    >
      {history && history.length > 0 ? (
        <Table
          columns={columns}
          dataSource={history}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: t('config.historyEmpty') }}
        />
      ) : (
        <Alert
          message={t('config.historyEmpty')}
          description={t('config.historyEmptyDesc')}
          type="info"
          showIcon
        />
      )}
    </Card>
  );
};

