import React from 'react';
import { Card, Button, Space, Descriptions, Progress, Alert, Typography, Tag } from 'antd';
import {
  ClockCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../utils/dateUtils';
import { TaskLogsViewer } from './TaskLogsViewer';

const { Text } = Typography;

interface TaskProgress {
  current: number;
  total: number;
  message?: string;
}

interface ActiveTask {
  taskId: string;
  status: string;
  startTime: string;
  endTime?: string;
  progress?: TaskProgress;
  error?: string;
}

interface ActiveTaskCardProps {
  task: ActiveTask;
  logs?: Array<{ timestamp: string; level: string; message: string }>;
  onStop: () => void;
  isStopping: boolean;
}

export const ActiveTaskCard: React.FC<ActiveTaskCardProps> = ({
  task,
  logs,
  onStop,
  isStopping,
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

  const calculateDuration = (startTime: Date, endTime?: Date) => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000); // seconds

    if (duration < 60) {
      return `${duration} ${t('download.seconds')}`;
    } else if (duration < 3600) {
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      return `${minutes} ${t('download.minutes')} ${seconds} ${t('download.seconds')}`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return `${hours} ${t('download.hours')} ${minutes} ${t('download.minutes')}`;
    }
  };

  return (
    <Card
      title={
        <Space>
          <ClockCircleOutlined />
          <span>{t('download.currentTask')}</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
      extra={
        <Button danger icon={<StopOutlined />} onClick={onStop} loading={isStopping}>
          {t('download.stopTask')}
        </Button>
      }
    >
      <Descriptions column={2} bordered>
        <Descriptions.Item label={t('download.taskId')} span={1}>
          <Text code>{task.taskId}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={t('download.status')} span={1}>
          {getStatusTag(task.status)}
        </Descriptions.Item>
        <Descriptions.Item label={t('download.startTime')} span={1}>
          {formatDate(task.startTime)}
        </Descriptions.Item>
        <Descriptions.Item label={t('download.duration')} span={1}>
          <Text strong>
            {calculateDuration(
              new Date(task.startTime),
              task.endTime ? new Date(task.endTime) : undefined
            )}
          </Text>
        </Descriptions.Item>
        {task.progress && (
          <Descriptions.Item label={t('download.progress')} span={2}>
            <Progress
              percent={Math.round((task.progress.current / task.progress.total) * 100)}
              status={task.status === 'running' ? 'active' : 'success'}
              format={() => `${task.progress?.current || 0} / ${task.progress?.total || 0}`}
            />
            {task.progress.message && (
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                {task.progress.message}
              </Text>
            )}
          </Descriptions.Item>
        )}
        {task.endTime && (
          <Descriptions.Item label={t('download.endTime')} span={2}>
            {formatDate(task.endTime)}
          </Descriptions.Item>
        )}
        {task.error && (
          <Descriptions.Item label={t('download.errorInfo')} span={2}>
            <Alert message={task.error} type="error" showIcon />
          </Descriptions.Item>
        )}
      </Descriptions>

      {logs && logs.length > 0 && (
        <TaskLogsViewer logs={logs} isRunning={task.status === 'running'} />
      )}
    </Card>
  );
};

