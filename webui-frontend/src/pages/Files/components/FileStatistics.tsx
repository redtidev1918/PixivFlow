import { Card, Statistic, Row, Col } from 'antd';
import {
  FolderOutlined,
  FileOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export interface FileStatisticsProps {
  directories: number;
  files: number;
  images: number;
  totalSize: string;
}

/**
 * File statistics component displaying directories, files, images, and total size
 */
export function FileStatistics({
  directories,
  files,
  images,
  totalSize,
}: FileStatisticsProps) {
  const { t } = useTranslation();

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic
            title={t('files.directories')}
            value={directories}
            prefix={<FolderOutlined />}
            valueStyle={{ color: '#1890ff' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic
            title={t('files.files')}
            value={files}
            prefix={<FileOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic
            title={t('files.images')}
            value={images}
            prefix={<PictureOutlined />}
            valueStyle={{ color: '#faad14' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card>
          <Statistic
            title={t('files.totalSize')}
            value={totalSize}
            valueStyle={{ color: '#722ed1' }}
          />
        </Card>
      </Col>
    </Row>
  );
}

