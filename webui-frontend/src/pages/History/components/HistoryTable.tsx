import { Table, Tag, Button, Space, Tooltip } from 'antd';
import { PictureOutlined, FileTextOutlined, FolderOpenOutlined, SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../utils/dateUtils';
import { DownloadHistoryItem } from '../../../services/api';

interface HistoryTableProps {
  items: DownloadHistoryItem[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  titleFilter: string;
  sortBy: 'downloadedAt' | 'title' | 'author' | 'pixivId';
  sortOrder: 'asc' | 'desc';
  onPageChange: (page: number, pageSize: number) => void;
  onSort: (column: 'downloadedAt' | 'title' | 'author' | 'pixivId') => void;
}

export function HistoryTable({
  items,
  loading,
  page,
  pageSize,
  total,
  titleFilter,
  sortBy,
  sortOrder,
  onPageChange,
  onSort,
}: HistoryTableProps) {
  const { t } = useTranslation();

  const getSortIcon = (column: 'downloadedAt' | 'title' | 'author' | 'pixivId') => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />;
  };

  const handleOpenFile = (filePath: string) => {
    window.open(`/api/files/preview?path=${encodeURIComponent(filePath)}`, '_blank');
  };

  const columns = [
    {
      title: (
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('pixivId')}>
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
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('title')}>
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
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('author')}>
          {t('history.author')} {getSortIcon('author')}
        </span>
      ),
      dataIndex: 'author',
      key: 'author',
      width: 150,
      render: (author?: string) => author || '-',
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
        <span style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('downloadedAt')}>
          {t('history.downloadedAt')} {getSortIcon('downloadedAt')}
        </span>
      ),
      dataIndex: 'downloadedAt',
      key: 'downloadedAt',
      width: 180,
      render: (time: string) => formatDate(time),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={items}
      rowKey={(record) => record.id.toString()}
      loading={loading}
      pagination={{
        current: page,
        pageSize: pageSize,
        total: titleFilter ? items.length : total,
        showSizeChanger: true,
        showTotal: (total, range) =>
          t('history.displaying', { start: range[0], end: range[1], total }) + (titleFilter ? t('history.filtered') : ''),
        pageSizeOptions: ['20', '50', '100', '200'],
        onChange: onPageChange,
      }}
      scroll={{ x: 1200 }}
    />
  );
}

