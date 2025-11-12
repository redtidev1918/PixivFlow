import { useState, useMemo } from 'react';
import { Row, Col, Typography, Button, Dropdown, Card, Alert } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Dayjs } from 'dayjs';
import { useDownloadHistory } from '../../hooks/useDownload';
import {
  HistoryStatistics,
  HistoryFilters,
  HistoryTable,
  HistoryExportMenu,
} from './components';

const { Title } = Typography;

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

  const { items, total, isLoading, error } = useDownloadHistory({
    page,
    limit: pageSize,
    type: typeFilter,
    tag: tagFilter,
    author: authorFilter,
    startDate: dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined,
    endDate: dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined,
    sortBy,
    sortOrder,
  });

  // Filter items by title (client-side filtering)
  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (!titleFilter) return items;
    
    const searchLower = titleFilter.toLowerCase();
    return items.filter((item) =>
      item.title.toLowerCase().includes(searchLower)
    );
  }, [items, titleFilter]);

  // Calculate statistics from current data
  const stats = useMemo(() => {
    const filtered = filteredItems;
    const totalCount = filtered.length;
    const illustrations = filtered.filter((item) => item.type === 'illustration').length;
    const novels = filtered.filter((item) => item.type === 'novel').length;
    const uniqueAuthors = new Set(filtered.filter((item) => item.author).map((item) => item.author)).size;

    return { total: totalCount, illustrations, novels, uniqueAuthors };
  }, [filteredItems]);

  const handleSort = (column: 'downloadedAt' | 'title' | 'author' | 'pixivId') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleReset = () => {
    setTypeFilter(undefined);
    setTagFilter(undefined);
    setAuthorFilter(undefined);
    setTitleFilter('');
    setDateRange(null);
    setSortBy('downloadedAt');
    setSortOrder('desc');
    setPage(1);
  };

  const handlePageChange = (newPage: number, newPageSize: number) => {
    setPage(newPage);
    setPageSize(newPageSize);
  };

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>{t('history.title')}</Title>
        </Col>
        <Col>
          <Dropdown overlay={<HistoryExportMenu items={filteredItems} />} trigger={['click']}>
            <Button type="primary" icon={<DownloadOutlined />}>
              {t('history.exportData')}
            </Button>
          </Dropdown>
        </Col>
      </Row>

      <HistoryStatistics
        total={stats.total}
        illustrations={stats.illustrations}
        novels={stats.novels}
        uniqueAuthors={stats.uniqueAuthors}
      />

      <HistoryFilters
        typeFilter={typeFilter}
        tagFilter={tagFilter}
        authorFilter={authorFilter}
        titleFilter={titleFilter}
        dateRange={dateRange}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onTypeFilterChange={(value) => {
          setTypeFilter(value);
          setPage(1);
        }}
        onTagFilterChange={(value) => {
          setTagFilter(value);
          setPage(1);
        }}
        onAuthorFilterChange={(value) => {
          setAuthorFilter(value);
          setPage(1);
        }}
        onTitleFilterChange={setTitleFilter}
        onDateRangeChange={(dates) => {
          setDateRange(dates);
          setPage(1);
        }}
        onSortByChange={(value) => {
          setSortBy(value);
          setPage(1);
        }}
        onSortOrderChange={(value) => {
          setSortOrder(value);
          setPage(1);
        }}
        onReset={handleReset}
      />

      <Card>
        {error && (
          <Alert
            message={t('history.loadFailed')}
            description={error instanceof Error ? error.message : t('history.loadFailedDesc')}
            type="error"
            style={{ marginBottom: 16 }}
          />
        )}
        <HistoryTable
          items={filteredItems}
          loading={isLoading}
          page={page}
          pageSize={pageSize}
          total={titleFilter ? filteredItems.length : total}
          titleFilter={titleFilter}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onPageChange={handlePageChange}
          onSort={handleSort}
        />
      </Card>
    </div>
  );
}

