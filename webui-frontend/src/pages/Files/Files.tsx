import { useState, useMemo } from 'react';
import { Card, Button, Space, Select, Row, Col, Typography } from 'antd';
import {
  PictureOutlined,
  FileTextOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useFiles } from '../../hooks/useFiles';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { FileBrowser } from './components/FileBrowser';
import { FileFilters } from './components/FileFilters';
import { FileStatistics } from './components/FileStatistics';
import { FileList } from './components/FileList';
import { FilePreview } from './components/FilePreview';
import { NormalizeFilesModal } from './components/NormalizeFilesModal';
import { getLocale } from '../../utils/dateUtils';
import { message } from 'antd';

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

const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

/**
 * Files page component - manages file browsing, preview, and normalization
 */
export default function Files() {
  const { t } = useTranslation();
  const { handleError } = useErrorHandler();
  
  const [currentPath, setCurrentPath] = useState<string>('');
  const [fileType, setFileType] = useState<'illustration' | 'novel'>('illustration');
  const [sortBy, setSortBy] = useState<'name' | 'time' | 'size' | 'type' | 'downloadedAt'>('type');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchText, setSearchText] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'>('all');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [normalizeModalVisible, setNormalizeModalVisible] = useState(false);

  const { files, directories, isLoading, deleteFileAsync } = useFiles({
    path: currentPath,
    type: fileType,
    sort: sortBy,
    order: sortOrder,
    dateFilter: dateFilter === 'all' ? undefined : dateFilter,
  });

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
  };

  const handleGoBack = () => {
    const parts = currentPath.split('/');
    parts.pop();
    handleNavigate(parts.join('/'));
  };

  const handlePreview = (file: FileItem) => {
    if (file.type === 'directory') {
      handleNavigate(file.path);
      return;
    }

    const ext = file.extension?.toLowerCase() || '';
    const isImage = imageExtensions.includes(ext);
    const isText = ['.txt', '.md', '.text'].includes(ext);

    if (isImage || isText) {
      setPreviewFile(file);
      setPreviewVisible(true);
    } else {
      message.info(t('files.previewNotSupported'));
    }
  };

  const handleDelete = async (file: FileItem) => {
    try {
      await deleteFileAsync({ id: file.name, path: file.path, type: fileType });
      message.success(t('files.fileDeleted'));
    } catch (error) {
      handleError(error);
    }
  };

  const handleSort = (column: 'name' | 'time' | 'size' | 'type' | 'downloadedAt') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    let items = [...directories, ...files];

    // Apply search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      items = items.filter((item) =>
        item.name.toLowerCase().includes(searchLower)
      );
    }

    // Apply date filter (only for files with downloadedAt)
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      let endDate: Date | null = null;

      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
          endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
          break;
        case 'thisWeek':
          const dayOfWeek = now.getDay();
          startDate = new Date(now);
          startDate.setDate(now.getDate() - dayOfWeek);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'lastWeek':
          const lastWeekStart = new Date(now);
          lastWeekStart.setDate(now.getDate() - now.getDay() - 7);
          lastWeekStart.setHours(0, 0, 0, 0);
          startDate = lastWeekStart;
          const lastWeekEnd = new Date(lastWeekStart);
          lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
          lastWeekEnd.setHours(23, 59, 59, 999);
          endDate = lastWeekEnd;
          break;
        case 'thisMonth':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'lastMonth':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
          break;
        default:
          startDate = new Date(0);
      }

      items = items.filter((item) => {
        if (item.type === 'directory') return true;
        if (!item.downloadedAt) return false;
        
        const downloadDate = new Date(item.downloadedAt);
        const isAfterStart = downloadDate >= startDate;
        const isBeforeEnd = endDate ? downloadDate <= endDate : true;
        return isAfterStart && isBeforeEnd;
      });
    }

    // Apply sorting
    items = [...items].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }

      let comparison = 0;
      const locale = getLocale();
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: 'base' });
          break;
        case 'time':
          const timeA = a.modified ? new Date(a.modified).getTime() : 0;
          const timeB = b.modified ? new Date(b.modified).getTime() : 0;
          comparison = timeA - timeB;
          break;
        case 'downloadedAt':
          if (!a.downloadedAt && !b.downloadedAt) {
            comparison = 0;
          } else if (!a.downloadedAt) {
            comparison = 1;
          } else if (!b.downloadedAt) {
            comparison = -1;
          } else {
            const downloadTimeA = new Date(a.downloadedAt).getTime();
            const downloadTimeB = new Date(b.downloadedAt).getTime();
            comparison = downloadTimeA - downloadTimeB;
          }
          break;
        case 'size':
          const sizeA = a.type === 'directory' ? 0 : (a.size || 0);
          const sizeB = b.type === 'directory' ? 0 : (b.size || 0);
          comparison = sizeA - sizeB;
          break;
        case 'type':
          comparison = a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: 'base' });
          break;
        default:
          comparison = a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: 'base' });
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return items;
  }, [directories, files, searchText, sortBy, sortOrder, dateFilter]);

  // Separate directories and files for FileList component
  const { filteredDirectories, filteredFiles } = useMemo(() => {
    const dirs = filteredAndSortedItems.filter((item) => item.type === 'directory');
    const fileItems = filteredAndSortedItems.filter((item) => item.type === 'file');
    return { filteredDirectories: dirs, filteredFiles: fileItems };
  }, [filteredAndSortedItems]);

  // Calculate statistics
  const stats = useMemo(() => {
    const all = [...directories, ...files];
    const directoriesCount = all.filter((item) => item.type === 'directory').length;
    const filesCount = all.filter((item) => item.type === 'file').length;
    const totalSize = all
      .filter((item) => item.type === 'file' && item.size)
      .reduce((sum, item) => sum + (item.size || 0), 0);
    const images = all.filter(
      (item) =>
        item.type === 'file' &&
        imageExtensions.includes(item.extension?.toLowerCase() || '')
    ).length;

    const formatFileSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    return {
      directories: directoriesCount,
      files: filesCount,
      totalSize: formatFileSize(totalSize),
      images,
    };
  }, [directories, files]);

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
              onChange={(value) => {
                setFileType(value);
                setCurrentPath('');
                setSearchText('');
              }}
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
            files={filteredFiles}
            directories={filteredDirectories}
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
        onClose={() => {
          setPreviewVisible(false);
          setPreviewFile(null);
        }}
      />

      <NormalizeFilesModal
        visible={normalizeModalVisible}
        onClose={() => setNormalizeModalVisible(false)}
      />
    </div>
  );
}

