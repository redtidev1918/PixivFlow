import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Table, Tag, Input, Select, Space, Typography, Alert, Button, DatePicker, Tooltip, Row, Col, Statistic, Dropdown, Menu } from 'antd';
import { PictureOutlined, FileTextOutlined, FolderOpenOutlined, SortAscendingOutlined, SortDescendingOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

export default function History() {
  const { t } = useTranslation();
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
    return data.data.items.filter((item: any) =>
      item.title.toLowerCase().includes(searchLower)
    );
  }, [data?.data?.items, titleFilter]);

  // Calculate statistics from current data
  const stats = useMemo(() => {
    const items = filteredItems;
    const total = items.length;
    const illustrations = items.filter((item: any) => item.type === 'illustration').length;
    const novels = items.filter((item: any) => item.type === 'novel').length;
    const uniqueAuthors = new Set(items.filter((item: any) => item.author).map((item: any) => item.author)).size;
    const uniqueTags = new Set(items.map((item: any) => item.tag)).size;

    return { total, illustrations, novels, uniqueAuthors, uniqueTags };
  }, [filteredItems]);

  // Export functions
  const exportToCSV = () => {
    if (!filteredItems.length) return;
    
    const headers = [t('history.pixivId'), t('history.type'), t('history.workTitle'), t('history.tag'), t('history.author'), t('history.filePath'), t('history.downloadedAt')];
    const rows = filteredItems.map((item: any) => [
      item.pixivId,
      item.type === 'illustration' ? t('history.typeIllustration') : t('history.typeNovel'),
      item.title,
      item.tag,
      item.author || '',
      item.filePath,
      new Date(item.downloadedAt).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${t('history.title')}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.csv`;
    link.click();
  };

  const exportToJSON = () => {
    if (!filteredItems.length) return;
    
    const jsonContent = JSON.stringify(filteredItems, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${t('history.title')}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.json`;
    link.click();
  };

  const exportMenu = (
    <Menu>
      <Menu.Item key="csv" icon={<DownloadOutlined />} onClick={exportToCSV}>
        {t('history.exportCSV')}
      </Menu.Item>
      <Menu.Item key="json" icon={<DownloadOutlined />} onClick={exportToJSON}>
        {t('history.exportJSON')}
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
          {t('history.pixivId')} {getSortIcon('pixivId')}
        </span>
      ),
      dataIndex: 'pixivId',
      key: 'pixivId',
      width: 120,
    },
    {
      title: t('history.type'),
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag
          color={type === 'illustration' ? 'blue' : 'green'}
          icon={type === 'illustration' ? <PictureOutlined /> : <FileTextOutlined />}
        >
          {type === 'illustration' ? t('history.typeIllustration') : t('history.typeNovel')}
        </Tag>
      ),
    },
    {
      title: (
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('title')}>
          {t('history.workTitle')} {getSortIcon('title')}
        </span>
      ),
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: t('history.tag'),
      dataIndex: 'tag',
      key: 'tag',
      width: 150,
      render: (tag: string) => <Tag>{tag}</Tag>,
    },
    {
      title: (
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('author')}>
          {t('history.author')} {getSortIcon('author')}
        </span>
      ),
      dataIndex: 'author',
      key: 'author',
      width: 150,
      render: (author: string | null) => author || '-',
    },
    {
      title: t('history.filePath'),
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
              {t('history.open')}
            </Button>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: (
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('downloadedAt')}>
          {t('history.downloadedAt')} {getSortIcon('downloadedAt')}
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
          <Title level={2} style={{ margin: 0 }}>{t('history.title')}</Title>
        </Col>
        <Col>
          <Dropdown overlay={exportMenu} trigger={['click']}>
            <Button type="primary" icon={<DownloadOutlined />}>
              {t('history.exportData')}
            </Button>
          </Dropdown>
        </Col>
      </Row>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('history.totalRecords')}
              value={stats.total}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('history.illustrations')}
              value={stats.illustrations}
              prefix={<PictureOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('history.novels')}
              value={stats.novels}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('history.authors')}
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
              placeholder={t('history.filterType')}
              allowClear
              style={{ width: 150 }}
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
            >
              <Select.Option value="illustration">{t('history.typeIllustration')}</Select.Option>
              <Select.Option value="novel">{t('history.typeNovel')}</Select.Option>
            </Select>
            <Search
              placeholder={t('history.searchTitle')}
              allowClear
              prefix={<SearchOutlined />}
              style={{ width: 200 }}
              value={titleFilter}
              onChange={(e) => setTitleFilter(e.target.value)}
            />
            <Search
              placeholder={t('history.searchTag')}
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
              placeholder={t('history.searchAuthor')}
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
              placeholder={[t('history.startDate'), t('history.endDate')]}
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
              {t('history.resetFilters')}
            </Button>
          </Space>
          <Space>
            <span>{t('history.sortBy')}</span>
            <Select
              value={sortBy}
              onChange={(value) => {
                setSortBy(value);
                setPage(1);
              }}
              style={{ width: 150 }}
            >
              <Select.Option value="downloadedAt">{t('history.sortDownloadTime')}</Select.Option>
              <Select.Option value="title">{t('history.sortTitle')}</Select.Option>
              <Select.Option value="author">{t('history.sortAuthor')}</Select.Option>
              <Select.Option value="pixivId">{t('history.sortPixivId')}</Select.Option>
            </Select>
            <Select
              value={sortOrder}
              onChange={(value) => {
                setSortOrder(value);
                setPage(1);
              }}
              style={{ width: 100 }}
            >
              <Select.Option value="desc">{t('history.sortOrderDesc')}</Select.Option>
              <Select.Option value="asc">{t('history.sortOrderAsc')}</Select.Option>
            </Select>
          </Space>
        </Space>
      </Card>

      <Card>
        {error && (
          <Alert
            message={t('history.loadFailed')}
            description={error instanceof Error ? error.message : t('history.loadFailedDesc')}
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
              t('history.displaying', { start: range[0], end: range[1], total }) + (titleFilter ? t('history.filtered') : ''),
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

