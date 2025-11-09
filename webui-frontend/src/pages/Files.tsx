import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Breadcrumb,
  Image,
  Modal,
  message,
  Select,
  Typography,
  Popconfirm,
  Row,
  Col,
  Spin,
  Input,
  Statistic,
  Checkbox,
  Alert,
  Descriptions,
} from 'antd';
import {
  FolderOutlined,
  DeleteOutlined,
  EyeOutlined,
  HomeOutlined,
  LeftOutlined,
  PictureOutlined,
  FileTextOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  FileOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { translateErrorCode, extractErrorInfo } from '../utils/errorCodeTranslator';
import { formatDate, getLocale } from '../utils/dateUtils';

const { Title } = Typography;
const { Option } = Select;
const { Search } = Input;

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  downloadedAt?: string | null;
  extension?: string;
}

interface FilesResponse {
  files: FileItem[];
  directories: FileItem[];
  currentPath: string;
}

const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
const textExtensions = ['.txt', '.md', '.text'];

export default function Files() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [currentPath, setCurrentPath] = useState<string>('');
  const [fileType, setFileType] = useState<'illustration' | 'novel'>('illustration');
  const [sortBy, setSortBy] = useState<'name' | 'time' | 'size' | 'type' | 'downloadedAt'>('type');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchText, setSearchText] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'>('all');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [normalizeModalVisible, setNormalizeModalVisible] = useState(false);
  const [normalizeOptions, setNormalizeOptions] = useState({
    dryRun: true,
    normalizeNames: true,
    reorganize: true,
    updateDatabase: true,
    type: 'all' as 'illustration' | 'novel' | 'all',
  });
  const [normalizeResult, setNormalizeResult] = useState<any>(null);

  const { data, isLoading } = useQuery<{ data: FilesResponse }>({
    queryKey: ['files', currentPath, fileType, sortBy, sortOrder, dateFilter],
    queryFn: () => api.listFiles({ 
      path: currentPath, 
      type: fileType, 
      sort: sortBy, 
      order: sortOrder,
      dateFilter: dateFilter === 'all' ? undefined : dateFilter,
    }),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (file: FileItem) =>
      api.deleteFile(file.name, { path: file.path, type: fileType }),
    onSuccess: () => {
      message.success(t('files.fileDeleted'));
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (error: any) => {
      const { errorCode, message: errorMessage } = extractErrorInfo(error);
      message.error(translateErrorCode(errorCode, t, undefined, errorMessage || t('files.deleteFailed')));
    },
  });

  const normalizeFilesMutation = useMutation({
    mutationFn: (options: typeof normalizeOptions) => api.normalizeFiles(options),
    onSuccess: (response) => {
      const result = response.data.result;
      setNormalizeResult(result);
      if (!normalizeOptions.dryRun) {
        message.success(t('files.normalizeCompleted'));
        queryClient.invalidateQueries({ queryKey: ['files'] });
      } else {
        message.success(t('files.previewCompleted'));
      }
    },
    onError: (error: any) => {
      const { errorCode, message: errorMessage } = extractErrorInfo(error);
      message.error(translateErrorCode(errorCode, t, undefined, errorMessage || t('files.normalizeFailed')));
    },
  });

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
  };

  const handlePreview = async (file: FileItem) => {
    if (file.type === 'directory') {
      handleNavigate(file.path);
      return;
    }

    const ext = file.extension?.toLowerCase() || '';
    const isImage = imageExtensions.includes(ext);
    const isText = textExtensions.includes(ext);

    if (isImage) {
      setPreviewFile(file);
      setPreviewContent('');
      setPreviewVisible(true);
    } else if (isText) {
      setPreviewFile(file);
      setPreviewContent('');
      setLoadingPreview(true);
      setPreviewVisible(true);
      
      try {
        const previewUrl = getPreviewUrl(file);
        const response = await fetch(previewUrl);
        if (response.ok) {
          const text = await response.text();
          setPreviewContent(text);
        } else {
          message.error(t('files.loadContentFailed'));
          setPreviewVisible(false);
        }
      } catch (error) {
        message.error(t('files.loadContentFailed'));
        setPreviewVisible(false);
      } finally {
        setLoadingPreview(false);
      }
    } else {
      message.info(t('files.previewNotSupported'));
    }
  };

  const handleDelete = (file: FileItem) => {
    deleteFileMutation.mutate(file);
  };

  const getPreviewUrl = (file: FileItem) => {
    return `/api/files/preview?path=${encodeURIComponent(file.path)}&type=${fileType}`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const breadcrumbItems = [
    {
      title: (
        <Button
          type="link"
          icon={<HomeOutlined />}
          onClick={() => handleNavigate('')}
          style={{ padding: 0 }}
        >
          {t('files.root')}
        </Button>
      ),
    },
    ...(currentPath
      ? currentPath.split('/').map((segment, index, arr) => {
          const path = arr.slice(0, index + 1).join('/');
          return {
            title: (
              <Button
                type="link"
                onClick={() => handleNavigate(path)}
                style={{ padding: 0 }}
              >
                {segment}
              </Button>
            ),
          };
        })
      : []),
  ];

  const getSortIcon = (column: 'name' | 'time' | 'size' | 'type' | 'downloadedAt') => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />;
  };

  const handleSort = (column: 'name' | 'time' | 'size' | 'type' | 'downloadedAt') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const columns = [
    {
      title: (
        <span
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => handleSort('name')}
        >
          {t('files.name')} {getSortIcon('name')}
        </span>
      ),
      dataIndex: 'name',
      key: 'name',
      width: 300,
      ellipsis: {
        showTitle: true,
      },
      render: (name: string, record: FileItem) => (
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
          <span style={{ flexShrink: 0, marginRight: 8 }}>
            {record.type === 'directory' ? (
              <FolderOutlined style={{ color: '#1890ff', fontSize: 16 }} />
            ) : imageExtensions.includes(record.extension?.toLowerCase() || '') ? (
              <PictureOutlined style={{ color: '#52c41a', fontSize: 16 }} />
            ) : (
              <FileTextOutlined style={{ fontSize: 16 }} />
            )}
          </span>
          <Button
            type="link"
            onClick={() => handlePreview(record)}
            style={{
              padding: 0,
              height: 'auto',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'left',
            }}
            title={name}
          >
            {name}
          </Button>
        </div>
      ),
    },
    {
      title: (
        <span
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => handleSort('type')}
        >
          {t('files.type')} {getSortIcon('type')}
        </span>
      ),
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string, record: FileItem) => {
        if (type === 'directory') {
          return <Tag color="blue" icon={<FolderOutlined />}>{t('files.typeDirectory')}</Tag>;
        }
        const ext = record.extension?.toLowerCase() || '';
        if (imageExtensions.includes(ext)) {
          return <Tag color="green" icon={<PictureOutlined />}>{t('files.typeImage')}</Tag>;
        }
        if (textExtensions.includes(ext)) {
          return <Tag color="orange" icon={<FileTextOutlined />}>{t('files.typeText')}</Tag>;
        }
        return <Tag icon={<FileOutlined />}>{t('files.typeFile')}</Tag>;
      },
    },
    {
      title: (
        <span
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => handleSort('size')}
        >
          {t('files.size')} {getSortIcon('size')}
        </span>
      ),
      dataIndex: 'size',
      key: 'size',
      width: 120,
      sorter: false, // We handle sorting manually
      render: (size: number) => formatFileSize(size),
    },
    {
      title: (
        <span
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => handleSort('time')}
        >
          {t('files.modified')} {getSortIcon('time')}
        </span>
      ),
      dataIndex: 'modified',
      key: 'modified',
      width: 180,
      render: (time: string) => formatDate(time),
    },
    {
      title: (
        <span
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => handleSort('downloadedAt')}
        >
          {t('files.downloadedAt')} {getSortIcon('downloadedAt')}
        </span>
      ),
      dataIndex: 'downloadedAt',
      key: 'downloadedAt',
      width: 180,
      render: (time: string | null | undefined, record: FileItem) => {
        if (record.type === 'directory') return '-';
        if (!time) return <span style={{ color: '#999' }}>{t('files.unknown')}</span>;
        return formatDate(time);
      },
    },
    {
      title: t('files.actions'),
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: FileItem) => (
        <Space>
          {record.type === 'file' &&
            (imageExtensions.includes(record.extension?.toLowerCase() || '') ||
              textExtensions.includes(record.extension?.toLowerCase() || '')) && (
              <Button
                type="link"
                icon={<EyeOutlined />}
                onClick={() => handlePreview(record)}
                size="small"
              >
                {t('files.preview')}
              </Button>
            )}
          {record.type === 'file' && (
            <Popconfirm
              title={t('files.confirmDelete')}
              onConfirm={() => handleDelete(record)}
              okText={t('common.ok')}
              cancelText={t('common.cancel')}
            >
              <Button type="link" danger icon={<DeleteOutlined />} size="small">
                {t('files.delete')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // Filter and sort items
  const allItems = useMemo(() => {
    let items = [
      ...(data?.data?.directories || []),
      ...(data?.data?.files || []),
    ];

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
        // Directories are always included
        if (item.type === 'directory') return true;
        // Files without download time are excluded when filtering
        if (!item.downloadedAt) return false;
        
        const downloadDate = new Date(item.downloadedAt);
        const isAfterStart = downloadDate >= startDate;
        const isBeforeEnd = endDate ? downloadDate <= endDate : true;
        return isAfterStart && isBeforeEnd;
      });
    }

    // Apply sorting
    // Always group by type first (directories before files), then sort by selected field
    items = [...items].sort((a, b) => {
      // First, separate directories and files
      if (a.type !== b.type) {
        // Directories always come before files
        return a.type === 'directory' ? -1 : 1;
      }

      // Within the same type, sort by the selected field
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
          // Sort by download time, files without download time go to the end
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
          // For directories, use 0 as size for consistent sorting
          const sizeA = a.type === 'directory' ? 0 : (a.size || 0);
          const sizeB = b.type === 'directory' ? 0 : (b.size || 0);
          comparison = sizeA - sizeB;
          break;
        case 'type':
          // Already grouped by type, so just sort by name within each group
          comparison = a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: 'base' });
          break;
        default:
          comparison = a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: 'base' });
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return items;
  }, [data?.data?.directories, data?.data?.files, searchText, sortBy, sortOrder, dateFilter]);

  // Calculate statistics
  const stats = useMemo(() => {
    const all = [
      ...(data?.data?.directories || []),
      ...(data?.data?.files || []),
    ];
    const directories = all.filter((item) => item.type === 'directory').length;
    const files = all.filter((item) => item.type === 'file').length;
    const totalSize = all
      .filter((item) => item.type === 'file' && item.size)
      .reduce((sum, item) => sum + (item.size || 0), 0);
    const images = all.filter(
      (item) =>
        item.type === 'file' &&
        imageExtensions.includes(item.extension?.toLowerCase() || '')
    ).length;

    return { directories, files, totalSize, images };
  }, [data?.data]);

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
              onClick={() => {
                setNormalizeModalVisible(true);
                setNormalizeResult(null);
              }}
            >
              {t('files.normalizeFiles')}
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('files.directories')}
              value={stats.directories}
              prefix={<FolderOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('files.files')}
              value={stats.files}
              prefix={<FileOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('files.images')}
              value={stats.images}
              prefix={<PictureOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('files.totalSize')}
              value={formatFileSize(stats.totalSize)}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ overflow: 'hidden' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <Search
                placeholder={t('files.searchPlaceholder')}
                allowClear
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: '100%' }}
              />
            </Col>
            <Col>
              <Space>
                <Select
                  value={dateFilter}
                  onChange={(value) => setDateFilter(value)}
                  style={{ width: 140 }}
                >
                  <Option value="all">{t('files.filterAll')}</Option>
                  <Option value="today">{t('files.filterToday')}</Option>
                  <Option value="yesterday">{t('files.filterYesterday')}</Option>
                  <Option value="thisWeek">{t('files.filterThisWeek')}</Option>
                  <Option value="lastWeek">{t('files.filterLastWeek')}</Option>
                  <Option value="thisMonth">{t('files.filterThisMonth')}</Option>
                  <Option value="lastMonth">{t('files.filterLastMonth')}</Option>
                </Select>
                <Select
                  value={sortBy}
                  onChange={(value) => setSortBy(value)}
                  style={{ width: 150 }}
                >
                  <Option value="name">{t('files.sortByName')}</Option>
                  <Option value="time">{t('files.sortByTime')}</Option>
                  <Option value="downloadedAt">{t('files.sortByDownloadTime')}</Option>
                  <Option value="size">{t('files.sortBySize')}</Option>
                  <Option value="type">{t('files.sortByType')}</Option>
                </Select>
                <Button
                  icon={sortOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  {sortOrder === 'asc' ? t('files.ascending') : t('files.descending')}
                </Button>
              </Space>
            </Col>
          </Row>

          <Breadcrumb items={breadcrumbItems} />

          {currentPath && (
            <Button
              icon={<LeftOutlined />}
              onClick={() => {
                const parts = currentPath.split('/');
                parts.pop();
                handleNavigate(parts.join('/'));
              }}
            >
              {t('files.goBack')}
            </Button>
          )}

          <div style={{ overflowX: 'auto' }}>
            <Table
              columns={columns}
              dataSource={allItems}
              rowKey="path"
              loading={isLoading}
              scroll={{ x: 900 }}
                pagination={{
                pageSize: 50,
                showSizeChanger: true,
                showTotal: (total, range) =>
                  t('files.displaying', { start: range[0], end: range[1], total }) + (searchText ? t('files.filtered') : ''),
                pageSizeOptions: ['20', '50', '100', '200'],
              }}
            />
          </div>
        </Space>
      </Card>

      <Modal
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={800}
        centered
        title={previewFile?.name}
      >
        {previewFile && (
          <>
            {imageExtensions.includes(previewFile.extension?.toLowerCase() || '') ? (
              <Image
                src={getPreviewUrl(previewFile)}
                alt={previewFile.name}
                style={{ width: '100%' }}
                preview={false}
              />
            ) : textExtensions.includes(previewFile.extension?.toLowerCase() || '') ? (
              <Spin spinning={loadingPreview}>
                <div
                  style={{
                    maxHeight: '70vh',
                    overflow: 'auto',
                    padding: '16px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    lineHeight: '1.6',
                  }}
                >
                  {previewContent || (loadingPreview ? t('files.loadingContent') : '')}
                </div>
              </Spin>
            ) : null}
          </>
        )}
      </Modal>

      {/* File Normalization Modal */}
      <Modal
        open={normalizeModalVisible}
        onCancel={() => {
          setNormalizeModalVisible(false);
          setNormalizeResult(null);
        }}
        title={t('files.normalizeTitle')}
        width={700}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setNormalizeModalVisible(false);
              setNormalizeResult(null);
            }}
          >
            {t('common.cancel')}
          </Button>,
          <Button
            key="preview"
            onClick={() => {
              normalizeFilesMutation.mutate({ ...normalizeOptions, dryRun: true });
            }}
            loading={normalizeFilesMutation.isPending}
          >
            {t('files.previewButton')}
          </Button>,
          <Button
            key="execute"
            type="primary"
            onClick={() => {
              normalizeFilesMutation.mutate({ ...normalizeOptions, dryRun: false });
            }}
            loading={normalizeFilesMutation.isPending}
            danger={!normalizeOptions.dryRun}
          >
            {t('files.executeNormalize')}
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Alert
            message={t('files.normalizeTitle')}
            description={t('files.normalizeDescription')}
            type="info"
            showIcon
          />

          <div>
            <Typography.Text strong>{t('files.normalizeOptions')}</Typography.Text>
            <Space direction="vertical" style={{ marginTop: 8, width: '100%' }}>
              <Checkbox
                checked={normalizeOptions.normalizeNames}
                onChange={(e) =>
                  setNormalizeOptions({ ...normalizeOptions, normalizeNames: e.target.checked })
                }
              >
                {t('files.normalizeNames')}
              </Checkbox>
              <Checkbox
                checked={normalizeOptions.reorganize}
                onChange={(e) =>
                  setNormalizeOptions({ ...normalizeOptions, reorganize: e.target.checked })
                }
              >
                {t('files.reorganize')}
              </Checkbox>
              <Checkbox
                checked={normalizeOptions.updateDatabase}
                onChange={(e) =>
                  setNormalizeOptions({ ...normalizeOptions, updateDatabase: e.target.checked })
                }
              >
                {t('files.updateDatabase')}
              </Checkbox>
            </Space>
          </div>

          <div>
            <Typography.Text strong>{t('files.fileType')}</Typography.Text>
            <Select
              value={normalizeOptions.type}
              onChange={(value) =>
                setNormalizeOptions({ ...normalizeOptions, type: value })
              }
              style={{ width: '100%', marginTop: 8 }}
            >
              <Option value="all">{t('files.allTypes')}</Option>
              <Option value="illustration">{t('files.illustrationOnly')}</Option>
              <Option value="novel">{t('files.novelOnly')}</Option>
            </Select>
          </div>

          {normalizeFilesMutation.isPending && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Typography.Text>{t('files.processing')}</Typography.Text>
              </div>
            </div>
          )}

          {normalizeResult && (
            <div>
              <Typography.Text strong>{t('files.normalizeResult')}</Typography.Text>
              <Descriptions
                bordered
                column={1}
                size="small"
                style={{ marginTop: 8 }}
              >
                <Descriptions.Item label={t('files.totalFiles')}>
                  {normalizeResult.totalFiles}
                </Descriptions.Item>
                <Descriptions.Item label={t('files.processedFiles')}>
                  {normalizeResult.processedFiles}
                </Descriptions.Item>
                <Descriptions.Item label={t('files.movedFiles')}>
                  <Typography.Text type="success">
                    {normalizeResult.movedFiles}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('files.renamedFiles')}>
                  <Typography.Text type="success">
                    {normalizeResult.renamedFiles}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('files.updatedDatabase')}>
                  <Typography.Text type="success">
                    {normalizeResult.updatedDatabase}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('files.skippedFiles')}>
                  {normalizeResult.skippedFiles}
                </Descriptions.Item>
                <Descriptions.Item label={t('files.errors')}>
                  {normalizeResult.errors.length > 0 ? (
                    <Typography.Text type="danger">
                      {normalizeResult.errors.length}
                    </Typography.Text>
                  ) : (
                    <Typography.Text type="success">0</Typography.Text>
                  )}
                </Descriptions.Item>
              </Descriptions>

              {normalizeResult.errors.length > 0 && (
                <Alert
                  message={t('files.processingErrors')}
                  description={
                    <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                      {normalizeResult.errors.map((error: any, index: number) => (
                        <div key={index} style={{ marginBottom: 8 }}>
                          <Typography.Text type="danger" strong>
                            {error.file}:
                          </Typography.Text>
                          <Typography.Text type="danger" style={{ marginLeft: 8 }}>
                            {error.error}
                          </Typography.Text>
                        </div>
                      ))}
                    </div>
                  }
                  type="error"
                  style={{ marginTop: 16 }}
                />
              )}

              {normalizeOptions.dryRun && (
                <Alert
                  message={t('files.previewMode')}
                  description={t('files.previewModeDesc')}
                  type="warning"
                  style={{ marginTop: 16 }}
                />
              )}
            </div>
          )}
        </Space>
      </Modal>
    </div>
  );
}
