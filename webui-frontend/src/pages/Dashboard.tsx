import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Statistic, Spin, Button, message } from 'antd';
import { DownloadOutlined, PictureOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import { api } from '../services/api';

export default function Dashboard() {
  const { t } = useTranslation();
  
  const { data, isLoading, refetch: refetchStats } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => api.getStatsOverview(),
  });

  // Handle refresh stats
  const handleRefreshStats = useCallback(async () => {
    message.loading({ content: t('dashboard.refreshingStats'), key: 'refresh-stats' });
    try {
      await refetchStats();
      message.success({ content: t('dashboard.statsRefreshed'), key: 'refresh-stats', duration: 2 });
    } catch (error) {
      message.error({ content: t('dashboard.refreshStatsFailed'), key: 'refresh-stats', duration: 2 });
    }
  }, [refetchStats, t]);

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: 50 }} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t('dashboard.title')}</h2>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={handleRefreshStats}
          loading={isLoading}
        >
          {t('dashboard.refreshStats')}
        </Button>
      </div>
      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title={t('dashboard.totalDownloads')}
              value={data?.data?.data?.totalDownloads || 0}
              prefix={<DownloadOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title={t('dashboard.illustrations')}
              value={data?.data?.data?.illustrations || 0}
              prefix={<PictureOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title={t('dashboard.novels')}
              value={data?.data?.data?.novels || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title={t('dashboard.recentDownloads')}>
            <p>{t('dashboard.recentDownloadsDesc', { count: data?.data?.data?.recentDownloads || 0 })}</p>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

