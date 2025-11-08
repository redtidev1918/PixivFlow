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
} from '@ant-design/icons';
import { api } from '../services/api';

const { Title } = Typography;
const { Option } = Select;
const { Search } = Input;

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
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
  const queryClient = useQueryClient();
  const [currentPath, setCurrentPath] = useState<string>('');
  const [fileType, setFileType] = useState<'illustration' | 'novel'>('illustration');
  const [sortBy, setSortBy] = useState<'name' | 'time' | 'size' | 'type'>('type');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchText, setSearchText] = useState<string>('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { data, isLoading } = useQuery<{ data: FilesResponse }>({
    queryKey: ['files', currentPath, fileType, sortBy, sortOrder],
    queryFn: () => api.listFiles({ path: currentPath, type: fileType, sort: sortBy, order: sortOrder }),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (file: FileItem) =>
      api.deleteFile(file.name, { path: file.path, type: fileType }),
    onSuccess: () => {
      message.success('文件删除成功');
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || '删除文件失败');
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
          message.error('无法加载文件内容');
          setPreviewVisible(false);
        }
      } catch (error) {
        message.error('加载文件内容失败');
        setPreviewVisible(false);
      } finally {
        setLoadingPreview(false);
      }
    } else {
      message.info('该文件类型不支持预览');
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
          根目录
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

  const getSortIcon = (column: 'name' | 'time' | 'size' | 'type') => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />;
  };

  const handleSort = (column: 'name' | 'time' | 'size' | 'type') => {
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
          名称 {getSortIcon('name')}
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
          类型 {getSortIcon('type')}
        </span>
      ),
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string, record: FileItem) => {
        if (type === 'directory') {
          return <Tag color="blue" icon={<FolderOutlined />}>目录</Tag>;
        }
        const ext = record.extension?.toLowerCase() || '';
        if (imageExtensions.includes(ext)) {
          return <Tag color="green" icon={<PictureOutlined />}>图片</Tag>;
        }
        if (textExtensions.includes(ext)) {
          return <Tag color="orange" icon={<FileTextOutlined />}>文本</Tag>;
        }
        return <Tag icon={<FileOutlined />}>文件</Tag>;
      },
    },
    {
      title: (
        <span
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => handleSort('size')}
        >
          大小 {getSortIcon('size')}
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
          修改时间 {getSortIcon('time')}
        </span>
      ),
      dataIndex: 'modified',
      key: 'modified',
      width: 180,
      render: (time: string) => (time ? new Date(time).toLocaleString() : '-'),
    },
    {
      title: '操作',
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
                预览
              </Button>
            )}
          {record.type === 'file' && (
            <Popconfirm
              title="确定要删除这个文件吗？"
              onConfirm={() => handleDelete(record)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" danger icon={<DeleteOutlined />} size="small">
                删除
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
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
          break;
        case 'time':
          const timeA = a.modified ? new Date(a.modified).getTime() : 0;
          const timeB = b.modified ? new Date(b.modified).getTime() : 0;
          comparison = timeA - timeB;
          break;
        case 'size':
          // For directories, use 0 as size for consistent sorting
          const sizeA = a.type === 'directory' ? 0 : (a.size || 0);
          const sizeB = b.type === 'directory' ? 0 : (b.size || 0);
          comparison = sizeA - sizeB;
          break;
        case 'type':
          // Already grouped by type, so just sort by name within each group
          comparison = a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
          break;
        default:
          comparison = a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return items;
  }, [data?.data?.directories, data?.data?.files, searchText, sortBy, sortOrder]);

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
            文件浏览
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
                <PictureOutlined /> 插画
              </Option>
              <Option value="novel">
                <FileTextOutlined /> 小说
              </Option>
            </Select>
          </Space>
        </Col>
      </Row>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="目录"
              value={stats.directories}
              prefix={<FolderOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="文件"
              value={stats.files}
              prefix={<FileOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="图片"
              value={stats.images}
              prefix={<PictureOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="总大小"
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
                placeholder="搜索文件名..."
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
                  value={sortBy}
                  onChange={(value) => setSortBy(value)}
                  style={{ width: 130 }}
                >
                  <Option value="name">按名称</Option>
                  <Option value="time">按时间</Option>
                  <Option value="size">按大小</Option>
                  <Option value="type">按类型</Option>
                </Select>
                <Button
                  icon={sortOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  {sortOrder === 'asc' ? '升序' : '降序'}
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
              返回上级
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
                  `显示 ${range[0]}-${range[1]} 项，共 ${total} 项${searchText ? ` (已筛选)` : ''}`,
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
                  {previewContent || (loadingPreview ? '加载中...' : '')}
                </div>
              </Spin>
            ) : null}
          </>
        )}
      </Modal>
    </div>
  );
}
