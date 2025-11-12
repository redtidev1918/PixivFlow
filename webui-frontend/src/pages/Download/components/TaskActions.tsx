import React from 'react';
import { Card, Button, Space, Alert, Typography, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../hooks/useAuth';

const { Text } = Typography;

interface TaskActionsProps {
  hasActiveTask: boolean;
  onStartClick: () => void;
  onRunAllClick: () => void;
  onStopClick: () => void;
  isStarting: boolean;
  isRunningAll: boolean;
  isStopping: boolean;
  storage?: {
    illustrationDirectory?: string;
    novelDirectory?: string;
    downloadDirectory?: string;
  };
  onRefreshConfig?: () => void;
}

export const TaskActions: React.FC<TaskActionsProps> = ({
  hasActiveTask,
  onStartClick,
  onRunAllClick,
  onStopClick,
  isStarting,
  isRunningAll,
  isStopping,
  storage,
  onRefreshConfig,
}) => {
  const { t } = useTranslation();
  const { authenticated } = useAuth();
  
  // Buttons that require authentication
  const requiresAuth = !authenticated;
  const loginTip = t('common.loginRequired');

  const illustrationPath =
    storage?.illustrationDirectory ||
    (storage?.downloadDirectory
      ? `${storage.downloadDirectory}/illustrations`
      : './downloads/illustrations');
  const novelPath =
    storage?.novelDirectory ||
    (storage?.downloadDirectory
      ? `${storage.downloadDirectory}/novels`
      : './downloads/novels');

  return (
    <Card
      title={
        <Space>
          <InfoCircleOutlined />
          <span>{t('download.taskOperations')}</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Space wrap>
        <Tooltip title={requiresAuth ? loginTip : undefined}>
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleOutlined />}
            onClick={onStartClick}
            disabled={hasActiveTask || requiresAuth}
            loading={isStarting}
          >
            {t('download.startDownload')}
          </Button>
        </Tooltip>
        <Tooltip title={requiresAuth ? loginTip : undefined}>
          <Button
            size="large"
            icon={<ReloadOutlined />}
            onClick={onRunAllClick}
            disabled={hasActiveTask || requiresAuth}
            loading={isRunningAll}
          >
            {t('download.downloadAll')}
          </Button>
        </Tooltip>
        <Button
          danger
          size="large"
          icon={<StopOutlined />}
          onClick={onStopClick}
          disabled={!hasActiveTask}
          loading={isStopping}
        >
          {t('download.stopCurrent')}
        </Button>
      </Space>
      {hasActiveTask && (
        <Alert
          message={t('download.hasActiveTask')}
          description={t('download.hasActiveTaskDesc')}
          type="info"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}
      {storage && (
        <Alert
          message={
            <Space>
              <span>{t('download.fileSavePath')}</span>
              {onRefreshConfig && (
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={onRefreshConfig}
                  title={t('download.refreshPath')}
                />
              )}
            </Space>
          }
          description={
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text>
                <Text strong>{t('download.illustrationPath')}</Text>
                {illustrationPath}
              </Text>
              <Text>
                <Text strong>{t('download.novelPath')}</Text>
                {novelPath}
              </Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {t('download.pathTip')}
              </Text>
            </Space>
          }
          type="info"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}
    </Card>
  );
};

