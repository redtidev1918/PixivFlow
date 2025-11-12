import React from 'react';
import { Card, Table, Tag, Button, Space, Alert, Typography, Modal } from 'antd';
import {
  InfoCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../utils/dateUtils';

const { Text } = Typography;

interface IncompleteTask {
  id: number;
  tag: string;
  type: 'illustration' | 'novel';
  status: string;
  message: string | null;
  executedAt: string;
}

interface IncompleteTasksTableProps {
  tasks: IncompleteTask[];
  hasActiveTask: boolean;
  onRefresh: () => void;
  onResume: (tag: string, type: 'illustration' | 'novel') => void;
  onDelete: (id: number) => void;
  onDeleteAll: () => void;
  isResuming: boolean;
  isDeleting: boolean;
  isDeletingAll: boolean;
}

export const IncompleteTasksTable: React.FC<IncompleteTasksTableProps> = ({
  tasks,
  hasActiveTask,
  onRefresh,
  onResume,
  onDelete,
  onDeleteAll,
  isResuming,
  isDeleting,
  isDeletingAll,
}) => {
  const { t } = useTranslation();

  if (!tasks || tasks.length === 0) {
    return null;
  }

  const columns = [
    {
      title: t('download.tag'),
      dataIndex: 'tag',
      key: 'tag',
      width: 150,
      render: (tag: string) => <Text strong>{tag}</Text>,
    },
    {
      title: t('download.type'),
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'illustration' ? 'blue' : 'purple'}>
          {type === 'illustration' ? t('download.typeIllustration') : t('download.typeNovel')}
        </Tag>
      ),
    },
    {
      title: t('download.incompleteStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          failed: { color: 'error', text: t('download.statusFailed') },
          partial: { color: 'warning', text: t('download.statusPartial') },
        };
        const statusInfo = statusMap[status] || { color: 'default', text: status };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: t('download.errorMessage'),
      dataIndex: 'message',
      key: 'message',
      ellipsis: { showTitle: false },
      width: 300,
      render: (message: string | null) => {
        if (!message) {
          return <Text type="secondary">-</Text>;
        }

        // Check for common error patterns and provide suggestions
        const msgLower = message.toLowerCase();
        let suggestion: string | null = null;

        if (msgLower.includes('401') || msgLower.includes('unauthorized')) {
          suggestion = t('download.error401');
        } else if (msgLower.includes('403') || msgLower.includes('forbidden')) {
          suggestion = t('download.error403');
        } else if (msgLower.includes('timeout') || msgLower.includes('timed out')) {
          suggestion = t('download.errorTimeout');
        } else if (msgLower.includes('failed after')) {
          suggestion = t('download.errorRetries');
        }

        return (
          <div>
            <Text type="danger" ellipsis={{ tooltip: message }}>
              {message}
            </Text>
            {suggestion && (
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  💡 {suggestion}
                </Text>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: t('download.executedAt'),
      dataIndex: 'executedAt',
      key: 'executedAt',
      width: 180,
      render: (time: string) => formatDate(time),
    },
    {
      title: t('download.actions'),
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: IncompleteTask) => (
        <Space>
          <Button
            type="link"
            icon={<RedoOutlined />}
            onClick={() => onResume(record.tag, record.type)}
            disabled={hasActiveTask || isResuming}
            loading={isResuming}
          >
            {t('download.resumeDownload')}
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: t('download.confirmDelete'),
                content: t('download.confirmDeleteDesc', {
                  tag: record.tag,
                  type:
                    record.type === 'illustration'
                      ? t('download.typeIllustration')
                      : t('download.typeNovel'),
                }),
                okText: t('common.delete'),
                okType: 'danger',
                cancelText: t('common.cancel'),
                onOk: () => onDelete(record.id),
              });
            }}
            disabled={isDeleting}
            loading={isDeleting}
          >
            {t('download.deleteTask')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <InfoCircleOutlined />
          <span>{t('download.incompleteTasks')}</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
      extra={
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>
            {t('download.refreshList')}
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: t('download.confirmDeleteAll'),
                content: t('download.confirmDeleteAllDesc', { count: tasks.length }),
                okText: t('common.delete'),
                okType: 'danger',
                cancelText: t('common.cancel'),
                onOk: onDeleteAll,
              });
            }}
            loading={isDeletingAll}
            disabled={isDeletingAll}
          >
            {t('download.deleteAll')}
          </Button>
        </Space>
      }
    >
      <Alert
        message={t('download.incompleteTasksFound', { count: tasks.length })}
        description={t('download.incompleteTasksDesc')}
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => t('download.totalEntries', { total }),
        }}
        size="small"
        scroll={{ x: 800 }}
      />
    </Card>
  );
};

