import { useState } from 'react';
import { Card, Button, Space, Select, Row, Col, Typography } from 'antd';
import {
  PictureOutlined,
  FileTextOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useFiles } from '../../hooks/useFiles';
import { FileBrowser } from './components/FileBrowser';
import { FileFilters } from './components/FileFilters';
import { FileStatistics } from './components/FileStatistics';
import { FileList } from './components/FileList';
import { FilePreview } from './components/FilePreview';
import { NormalizeFilesModal } from './components/NormalizeFilesModal';
import {
  useFileBrowser,
  useFileOperations,
  useFileFilters,
  useFileStatistics,
} from './hooks';

const { Title } = Typography;
const { Option } = Select;

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  downloadedAt?: string | null;
  extension?: string;
}

/**
 * Files page component - manages file browsing, preview, and normalization
 */
export default function Files() {
  const { t } = useTranslation();
  const [fileType, setFileType] = useState<'illustration' | 'novel'>('illustration');
  const [normalizeModalVisible, setNormalizeModalVisible] = useState(false);

  // File browser navigation
  const { currentPath, handleNavigate, handleGoBack, resetPath } = useFileBrowser();

  // File filters state
  const [sortBy, setSortBy] = useState<'name' | 'time' | 'size' | 'type' | 'downloadedAt'>('type');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchText, setSearchText] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'>('all');

  // File data fetching
  const { files, directories, isLoading, deleteFileAsync } = useFiles({
    path: currentPath,
    type: fileType,
    sort: sortBy,
    order: sortOrder,
    dateFilter: dateFilter === 'all' ? undefined : dateFilter,
  });

  // Apply client-side filtering (search and date filter)
  const fileFilters = useFileFilters(files, directories, searchText, dateFilter);

  // File operations
  const {
    previewVisible,
    previewFile,
    handlePreview,
    handleDelete,
    closePreview,
  } = useFileOperations(deleteFileAsync, fileType, handleNavigate);

  // Statistics
  const stats = useFileStatistics(files, directories);

  // Handle file type change
  const handleFileTypeChange = (value: 'illustration' | 'novel') => {
    setFileType(value);
    resetPath();
    setSearchText('');
  };

  // Handle sort
  const handleSort = (column: 'name' | 'time' | 'size' | 'type' | 'downloadedAt') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t('files.title')}
          </Title>
        </Col>
        <Col>
          <Space>
            <Select
              value={fileType}
              onChange={handleFileTypeChange}
              style={{ width: 150 }}
            >
              <Option value="illustration">
                <PictureOutlined /> {t('dashboard.illustrations')}
              </Option>
              <Option value="novel">
                <FileTextOutlined /> {t('dashboard.novels')}
              </Option>
            </Select>
            <Button
              type="primary"
              icon={<ToolOutlined />}
              onClick={() => setNormalizeModalVisible(true)}
            >
              {t('files.normalizeFiles')}
            </Button>
          </Space>
        </Col>
      </Row>

      <FileStatistics
        directories={stats.directories}
        files={stats.files}
        images={stats.images}
        totalSize={stats.totalSize}
      />

      <Card style={{ overflow: 'hidden' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <FileFilters
            searchText={searchText}
            onSearchChange={setSearchText}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
          />

          <FileBrowser
            currentPath={currentPath}
            onNavigate={handleNavigate}
            onGoBack={handleGoBack}
          />

          <FileList
            files={fileFilters.filteredFiles}
            directories={fileFilters.filteredDirectories}
            loading={isLoading}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            onPreview={handlePreview}
            onDelete={handleDelete}
            onNavigate={handleNavigate}
            fileType={fileType}
          />
        </Space>
      </Card>

      <FilePreview
        visible={previewVisible}
        file={previewFile}
        fileType={fileType}
        onClose={closePreview}
      />

      <NormalizeFilesModal
        visible={normalizeModalVisible}
        onClose={() => setNormalizeModalVisible(false)}
      />
    </div>
  );
}

