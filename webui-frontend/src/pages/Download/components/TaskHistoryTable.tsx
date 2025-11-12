import React from 'react';
import { Card, Table, Tag, Space, Typography, Spin } from 'antd';
import {
  InfoCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../utils/dateUtils';

const { Text } = Typography;

interface Task {
  taskId: string;
  status: string;
  startTime: string;
  endTime?: string;
  error?: string;
}

interface TaskHistoryTableProps {
  tasks: Task[];
  isLoading: boolean;
  calculateDuration: (startTime: Date, endTime?: Date) => string;
}

export const TaskHistoryTable: React.FC<TaskHistoryTableProps> = ({
  tasks,
  isLoading,
  calculateDuration,
}) => {
  const { t } = useTranslation();

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
      running: {
        color: 'processing',
        icon: <ClockCircleOutlined />,
        text: t('download.statusRunning'),
      },
      completed: {
        color: 'success',
        icon: <CheckCircleOutlined />,
        text: t('download.statusCompleted'),
      },
      failed: {
        color: 'error',
        icon: <CloseCircleOutlined />,
        text: t('download.statusFailed'),
      },
      stopped: {
        color: 'default',
        icon: <StopOutlined />,
        text: t('download.statusStopped'),
      },
    };
    const statusInfo = statusMap[status] || statusMap.running;
    if (!statusInfo) return null;
    return (
      <Tag color={statusInfo.color} icon={statusInfo.icon}>
        {statusInfo.text}
      </Tag>
    );
  };

  const columns = [
    {
      title: t('download.taskId'),
      dataIndex: 'taskId',
      key: 'taskId',
      width: 120,
      render: (taskId: string) => <Text code>{taskId.slice(0, 8)}...</Text>,
    },
    {
      title: t('download.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: t('download.duration'),
      key: 'duration',
      width: 120,
      render: (_: any, record: Task) => {
        return calculateDuration(
          new Date(record.startTime),
          record.endTime ? new Date(record.endTime) : undefined
        );
      },
    },
    {
      title: t('download.startTime'),
      dataIndex: 'startTime',
      key: 'startTime',
      width: 180,
      render: (time: string) => formatDate(time),
    },
    {
      title: t('download.endTime'),
      dataIndex: 'endTime',
      key: 'endTime',
      width: 180,
      render: (time: string | undefined) => formatDate(time),
    },
    {
      title: t('download.errorInfo'),
      dataIndex: 'error',
      key: 'error',
      ellipsis: true,
      render: (error: string | undefined) =>
        error ? (
          <Text type="danger" ellipsis={{ tooltip: error }}>
            {error}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <InfoCircleOutlined />
          <span>{t('download.taskHistory')}</span>
        </Space>
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">{t('download.loadingHistory')}</Text>
          </div>
        </div>
      ) : tasks && tasks.length > 0 ? (
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="taskId"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => t('download.taskRecords', { total }),
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          size="middle"
          scroll={{ x: 1000 }}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">{t('download.noHistory')}</Text>
        </div>
      )}
    </Card>
  );
};

