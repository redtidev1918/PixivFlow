import { Card, Row, Col, Statistic } from 'antd';
import { PictureOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface HistoryStatisticsProps {
  total: number;
  illustrations: number;
  novels: number;
  uniqueAuthors: number;
}

export function HistoryStatistics({
  total,
  illustrations,
  novels,
  uniqueAuthors,
}: HistoryStatisticsProps) {
  const { t } = useTranslation();

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic
            title={t('history.totalRecords')}
            value={total}
            valueStyle={{ color: '#1890ff' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic
            title={t('history.illustrations')}
            value={illustrations}
            prefix={<PictureOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic
            title={t('history.novels')}
            value={novels}
            prefix={<FileTextOutlined />}
            valueStyle={{ color: '#faad14' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic
            title={t('history.authors')}
            value={uniqueAuthors}
            valueStyle={{ color: '#722ed1' }}
          />
        </Card>
      </Col>
    </Row>
  );
}

