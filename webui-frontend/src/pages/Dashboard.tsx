import { Card, Row, Col, Statistic, Spin, Button, message } from 'antd';
import { DownloadOutlined, PictureOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import { useStatsOverview } from '../hooks/useStats';

export default function Dashboard() {
  const { t } = useTranslation();
  const { stats, isLoading, refetch: refetchStats } = useStatsOverview();

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

  // Extract stats data from API response structure
  const statsData = stats && typeof stats === 'object' && 'data' in stats && stats.data && typeof stats.data === 'object' && 'data' in stats.data
    ? (stats.data as { data?: Record<string, unknown> }).data || {}
    : (stats as Record<string, unknown>) || {};

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
              value={statsData.totalDownloads || 0}
              prefix={<DownloadOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title={t('dashboard.illustrations')}
              value={statsData.illustrations || 0}
              prefix={<PictureOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title={t('dashboard.novels')}
              value={statsData.novels || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title={t('dashboard.recentDownloads')}>
            <p>{t('dashboard.recentDownloadsDesc', { count: statsData.recentDownloads || 0 })}</p>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

