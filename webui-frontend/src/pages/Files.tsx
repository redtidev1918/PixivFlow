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

  const normalizeFilesMutation = useMutation({
    mutationFn: (options: typeof normalizeOptions) => api.normalizeFiles(options),
    onSuccess: (response) => {
      const result = response.data.result;
      setNormalizeResult(result);
      if (!normalizeOptions.dryRun) {
        message.success('文件规范化完成');
        queryClient.invalidateQueries({ queryKey: ['files'] });
      } else {
        message.success('预览完成，请查看结果');
      }
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || error.response?.data?.message || '文件规范化失败');
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
            <Button
              type="primary"
              icon={<ToolOutlined />}
              onClick={() => {
                setNormalizeModalVisible(true);
                setNormalizeResult(null);
              }}
            >
              规范化文件
            </Button>
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

      {/* File Normalization Modal */}
      <Modal
        open={normalizeModalVisible}
        onCancel={() => {
          setNormalizeModalVisible(false);
          setNormalizeResult(null);
        }}
        title="规范化文件"
        width={700}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setNormalizeModalVisible(false);
              setNormalizeResult(null);
            }}
          >
            取消
          </Button>,
          <Button
            key="preview"
            onClick={() => {
              normalizeFilesMutation.mutate({ ...normalizeOptions, dryRun: true });
            }}
            loading={normalizeFilesMutation.isPending}
          >
            预览（不执行）
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
            执行规范化
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Alert
            message="文件规范化功能"
            description="此功能将根据当前配置重新组织文件结构，规范化文件名，并更新数据库记录。建议先使用预览模式查看将要执行的操作。"
            type="info"
            showIcon
          />

          <div>
            <Typography.Text strong>规范化选项：</Typography.Text>
            <Space direction="vertical" style={{ marginTop: 8, width: '100%' }}>
              <Checkbox
                checked={normalizeOptions.normalizeNames}
                onChange={(e) =>
                  setNormalizeOptions({ ...normalizeOptions, normalizeNames: e.target.checked })
                }
              >
                规范化文件名（清理特殊字符，统一格式）
              </Checkbox>
              <Checkbox
                checked={normalizeOptions.reorganize}
                onChange={(e) =>
                  setNormalizeOptions({ ...normalizeOptions, reorganize: e.target.checked })
                }
              >
                重新组织文件结构（根据当前配置的组织模式）
              </Checkbox>
              <Checkbox
                checked={normalizeOptions.updateDatabase}
                onChange={(e) =>
                  setNormalizeOptions({ ...normalizeOptions, updateDatabase: e.target.checked })
                }
              >
                更新数据库记录（更新文件路径）
              </Checkbox>
            </Space>
          </div>

          <div>
            <Typography.Text strong>文件类型：</Typography.Text>
            <Select
              value={normalizeOptions.type}
              onChange={(value) =>
                setNormalizeOptions({ ...normalizeOptions, type: value })
              }
              style={{ width: '100%', marginTop: 8 }}
            >
              <Option value="all">全部（插画和小说）</Option>
              <Option value="illustration">仅插画</Option>
              <Option value="novel">仅小说</Option>
            </Select>
          </div>

          {normalizeFilesMutation.isPending && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Typography.Text>正在处理文件，请稍候...</Typography.Text>
              </div>
            </div>
          )}

          {normalizeResult && (
            <div>
              <Typography.Text strong>规范化结果：</Typography.Text>
              <Descriptions
                bordered
                column={1}
                size="small"
                style={{ marginTop: 8 }}
              >
                <Descriptions.Item label="总文件数">
                  {normalizeResult.totalFiles}
                </Descriptions.Item>
                <Descriptions.Item label="已处理">
                  {normalizeResult.processedFiles}
                </Descriptions.Item>
                <Descriptions.Item label="已移动">
                  <Typography.Text type="success">
                    {normalizeResult.movedFiles}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="已重命名">
                  <Typography.Text type="success">
                    {normalizeResult.renamedFiles}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="数据库已更新">
                  <Typography.Text type="success">
                    {normalizeResult.updatedDatabase}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="已跳过">
                  {normalizeResult.skippedFiles}
                </Descriptions.Item>
                <Descriptions.Item label="错误数">
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
                  message="处理错误"
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
                  message="预览模式"
                  description="这是预览结果，文件尚未实际修改。要执行规范化，请点击执行规范化按钮。"
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
