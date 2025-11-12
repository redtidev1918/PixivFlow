import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import {
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface TaskStatisticsProps {
  total: number;
  completed: number;
  failed: number;
  stopped: number;
}

export const TaskStatistics: React.FC<TaskStatisticsProps> = ({
  total,
  completed,
  failed,
  stopped,
}) => {
  const { t } = useTranslation();

  return (
    <Card style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={6}>
          <Statistic
            title={t('download.totalTasks')}
            value={total}
            prefix={<DownloadOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('download.completed')}
            value={completed}
            valueStyle={{ color: '#3f8600' }}
            prefix={<CheckCircleOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('download.failed')}
            value={failed}
            valueStyle={{ color: '#cf1322' }}
            prefix={<CloseCircleOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('download.stopped')}
            value={stopped}
            valueStyle={{ color: '#8c8c8c' }}
            prefix={<StopOutlined />}
          />
        </Col>
      </Row>
    </Card>
  );
};

