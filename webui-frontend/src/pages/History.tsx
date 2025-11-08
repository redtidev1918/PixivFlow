import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Table, Tag, Input, Select, Space, Typography, Alert, Button, DatePicker, Tooltip, Row, Col, Statistic, Dropdown, Menu } from 'antd';
import { PictureOutlined, FileTextOutlined, FolderOpenOutlined, SortAscendingOutlined, SortDescendingOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '../services/api';
import { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

export default function History() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [tagFilter, setTagFilter] = useState<string | undefined>();
  const [authorFilter, setAuthorFilter] = useState<string | undefined>();
  const [titleFilter, setTitleFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [sortBy, setSortBy] = useState<'downloadedAt' | 'title' | 'author' | 'pixivId'>('downloadedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, error } = useQuery({
    queryKey: ['download', 'history', page, pageSize, typeFilter, tagFilter, authorFilter, dateRange, sortBy, sortOrder],
    queryFn: () =>
      api.getDownloadHistory({
        page,
        limit: pageSize,
        type: typeFilter,
        tag: tagFilter,
        author: authorFilter,
        startDate: dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined,
        endDate: dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined,
        sortBy,
        sortOrder,
      }),
  });

  // Filter items by title (client-side filtering)
  const filteredItems = useMemo(() => {
    if (!data?.data?.items) return [];
    if (!titleFilter) return data.data.items;
    
    const searchLower = titleFilter.toLowerCase();
    return data.data.items.filter((item) =>
      item.title.toLowerCase().includes(searchLower)
    );
  }, [data?.data?.items, titleFilter]);

  // Calculate statistics from current data
  const stats = useMemo(() => {
    const items = filteredItems;
    const total = items.length;
    const illustrations = items.filter((item) => item.type === 'illustration').length;
    const novels = items.filter((item) => item.type === 'novel').length;
    const uniqueAuthors = new Set(items.filter((item) => item.author).map((item) => item.author)).size;
    const uniqueTags = new Set(items.map((item) => item.tag)).size;

    return { total, illustrations, novels, uniqueAuthors, uniqueTags };
  }, [filteredItems]);

  // Export functions
  const exportToCSV = () => {
    if (!filteredItems.length) return;
    
    const headers = ['Pixiv ID', '类型', '标题', '标签', '作者', '文件路径', '下载时间'];
    const rows = filteredItems.map((item) => [
      item.pixivId,
      item.type === 'illustration' ? '插画' : '小说',
      item.title,
      item.tag,
      item.author || '',
      item.filePath,
      new Date(item.downloadedAt).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `下载历史_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.csv`;
    link.click();
  };

  const exportToJSON = () => {
    if (!filteredItems.length) return;
    
    const jsonContent = JSON.stringify(filteredItems, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `下载历史_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.json`;
    link.click();
  };

  const exportMenu = (
    <Menu>
      <Menu.Item key="csv" icon={<DownloadOutlined />} onClick={exportToCSV}>
        导出为 CSV
      </Menu.Item>
      <Menu.Item key="json" icon={<DownloadOutlined />} onClick={exportToJSON}>
        导出为 JSON
      </Menu.Item>
    </Menu>
  );

  // Debug: Log data to console
  if (data) {
    console.log('History data:', data);
    console.log('History items:', data?.data?.items);
    console.log('History total:', data?.data?.total);
  }
  if (error) {
    console.error('History error:', error);
  }

  const handleSort = (column: 'downloadedAt' | 'title' | 'author' | 'pixivId') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1); // Reset to first page when sorting changes
  };

  const getSortIcon = (column: 'downloadedAt' | 'title' | 'author' | 'pixivId') => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />;
  };

  const handleOpenFile = (filePath: string) => {
    // Try to open file via API
    window.open(`/api/files/preview?path=${encodeURIComponent(filePath)}`, '_blank');
  };

  const columns = [
    {
      title: (
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('pixivId')}>
          Pixiv ID {getSortIcon('pixivId')}
        </span>
      ),
      dataIndex: 'pixivId',
      key: 'pixivId',
      width: 120,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag
          color={type === 'illustration' ? 'blue' : 'green'}
          icon={type === 'illustration' ? <PictureOutlined /> : <FileTextOutlined />}
        >
          {type === 'illustration' ? '插画' : '小说'}
        </Tag>
      ),
    },
    {
      title: (
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('title')}>
          标题 {getSortIcon('title')}
        </span>
      ),
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '标签',
      dataIndex: 'tag',
      key: 'tag',
      width: 150,
      render: (tag: string) => <Tag>{tag}</Tag>,
    },
    {
      title: (
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('author')}>
          作者 {getSortIcon('author')}
        </span>
      ),
      dataIndex: 'author',
      key: 'author',
      width: 150,
      render: (author: string | null) => author || '-',
    },
    {
      title: '文件路径',
      dataIndex: 'filePath',
      key: 'filePath',
      width: 300,
      ellipsis: true,
      render: (filePath: string) => (
        <Tooltip title={filePath}>
          <Space>
            <span style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>{filePath}</span>
            <Button
              type="link"
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => handleOpenFile(filePath)}
            >
              打开
            </Button>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: (
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('downloadedAt')}>
          下载时间 {getSortIcon('downloadedAt')}
        </span>
      ),
      dataIndex: 'downloadedAt',
      key: 'downloadedAt',
      width: 180,
      render: (time: string) => new Date(time).toLocaleString(),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>下载历史</Title>
        </Col>
        <Col>
          <Dropdown overlay={exportMenu} trigger={['click']}>
            <Button type="primary" icon={<DownloadOutlined />}>
              导出数据
            </Button>
          </Dropdown>
        </Col>
      </Row>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="总记录数"
              value={stats.total}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="插画"
              value={stats.illustrations}
              prefix={<PictureOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="小说"
              value={stats.novels}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="作者数"
              value={stats.uniqueAuthors}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap>
            <Select
              placeholder="筛选类型"
              allowClear
              style={{ width: 150 }}
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
            >
              <Select.Option value="illustration">插画</Select.Option>
              <Select.Option value="novel">小说</Select.Option>
            </Select>
            <Search
              placeholder="搜索标题"
              allowClear
              prefix={<SearchOutlined />}
              style={{ width: 200 }}
              value={titleFilter}
              onChange={(e) => setTitleFilter(e.target.value)}
            />
            <Search
              placeholder="搜索标签"
              allowClear
              style={{ width: 200 }}
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value || undefined)}
              onSearch={(value) => {
                setTagFilter(value || undefined);
                setPage(1);
              }}
            />
            <Search
              placeholder="搜索作者"
              allowClear
              style={{ width: 200 }}
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value || undefined)}
              onSearch={(value) => {
                setAuthorFilter(value || undefined);
                setPage(1);
              }}
            />
            <RangePicker
              placeholder={['开始日期', '结束日期']}
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates as [Dayjs | null, Dayjs | null] | null);
                setPage(1);
              }}
              allowClear
            />
            <Button
              onClick={() => {
                setTypeFilter(undefined);
                setTagFilter(undefined);
                setAuthorFilter(undefined);
                setTitleFilter('');
                setDateRange(null);
                setSortBy('downloadedAt');
                setSortOrder('desc');
                setPage(1);
              }}
            >
              重置筛选
            </Button>
          </Space>
          <Space>
            <span>排序方式：</span>
            <Select
              value={sortBy}
              onChange={(value) => {
                setSortBy(value);
                setPage(1);
              }}
              style={{ width: 150 }}
            >
              <Select.Option value="downloadedAt">下载时间</Select.Option>
              <Select.Option value="title">标题</Select.Option>
              <Select.Option value="author">作者</Select.Option>
              <Select.Option value="pixivId">Pixiv ID</Select.Option>
            </Select>
            <Select
              value={sortOrder}
              onChange={(value) => {
                setSortOrder(value);
                setPage(1);
              }}
              style={{ width: 100 }}
            >
              <Select.Option value="desc">降序</Select.Option>
              <Select.Option value="asc">升序</Select.Option>
            </Select>
          </Space>
        </Space>
      </Card>

      <Card>
        {error && (
          <Alert
            message="加载失败"
            description={error instanceof Error ? error.message : '无法加载下载历史'}
            type="error"
            style={{ marginBottom: 16 }}
          />
        )}
        <Table
          columns={columns}
          dataSource={filteredItems}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: titleFilter ? filteredItems.length : (data?.data?.total || 0),
            showSizeChanger: true,
            showTotal: (total, range) =>
              `显示 ${range[0]}-${range[1]} 条，共 ${total} 条记录${titleFilter ? ` (已筛选)` : ''}`,
            pageSizeOptions: ['20', '50', '100', '200'],
            onChange: (newPage, newPageSize) => {
              setPage(newPage);
              setPageSize(newPageSize);
            },
          }}
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
}

