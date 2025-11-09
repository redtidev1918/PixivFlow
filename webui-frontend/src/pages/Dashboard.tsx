import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Statistic, Spin } from 'antd';
import { DownloadOutlined, PictureOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';

export default function Dashboard() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => api.getStatsOverview(),
  });

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: 50 }} />;
  }

  return (
    <div>
      <h2>{t('dashboard.title')}</h2>
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

