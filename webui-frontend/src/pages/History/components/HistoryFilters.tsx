import { Card, Space, Select, Input, Button, DatePicker } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Dayjs } from 'dayjs';

const { Search } = Input;
const { RangePicker } = DatePicker;

interface HistoryFiltersProps {
  typeFilter?: string;
  tagFilter?: string;
  authorFilter?: string;
  titleFilter: string;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  sortBy: 'downloadedAt' | 'title' | 'author' | 'pixivId';
  sortOrder: 'asc' | 'desc';
  onTypeFilterChange: (value?: string) => void;
  onTagFilterChange: (value?: string) => void;
  onAuthorFilterChange: (value?: string) => void;
  onTitleFilterChange: (value: string) => void;
  onDateRangeChange: (dates: [Dayjs | null, Dayjs | null] | null) => void;
  onSortByChange: (value: 'downloadedAt' | 'title' | 'author' | 'pixivId') => void;
  onSortOrderChange: (value: 'asc' | 'desc') => void;
  onReset: () => void;
}

export function HistoryFilters({
  typeFilter,
  tagFilter,
  authorFilter,
  titleFilter,
  dateRange,
  sortBy,
  sortOrder,
  onTypeFilterChange,
  onTagFilterChange,
  onAuthorFilterChange,
  onTitleFilterChange,
  onDateRangeChange,
  onSortByChange,
  onSortOrderChange,
  onReset,
}: HistoryFiltersProps) {
  const { t } = useTranslation();

  return (
    <Card style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space wrap>
          <Select
            placeholder={t('history.filterType')}
            allowClear
            style={{ width: 150 }}
            value={typeFilter}
            onChange={onTypeFilterChange}
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
            onChange={(e) => onTitleFilterChange(e.target.value)}
          />
          <Search
            placeholder={t('history.searchTag')}
            allowClear
            style={{ width: 200 }}
            value={tagFilter}
            onChange={(e) => onTagFilterChange(e.target.value || undefined)}
            onSearch={(value) => onTagFilterChange(value || undefined)}
          />
          <Search
            placeholder={t('history.searchAuthor')}
            allowClear
            style={{ width: 200 }}
            value={authorFilter}
            onChange={(e) => onAuthorFilterChange(e.target.value || undefined)}
            onSearch={(value) => onAuthorFilterChange(value || undefined)}
          />
          <RangePicker
            placeholder={[t('history.startDate'), t('history.endDate')]}
            value={dateRange}
            onChange={(dates) => onDateRangeChange(dates as [Dayjs | null, Dayjs | null] | null)}
            allowClear
          />
          <Button onClick={onReset}>
            {t('history.resetFilters')}
          </Button>
        </Space>
        <Space>
          <span>{t('history.sortBy')}</span>
          <Select
            value={sortBy}
            onChange={onSortByChange}
            style={{ width: 150 }}
          >
            <Select.Option value="downloadedAt">{t('history.sortDownloadTime')}</Select.Option>
            <Select.Option value="title">{t('history.sortTitle')}</Select.Option>
            <Select.Option value="author">{t('history.sortAuthor')}</Select.Option>
            <Select.Option value="pixivId">{t('history.sortPixivId')}</Select.Option>
          </Select>
          <Select
            value={sortOrder}
            onChange={onSortOrderChange}
            style={{ width: 100 }}
          >
            <Select.Option value="desc">{t('history.sortOrderDesc')}</Select.Option>
            <Select.Option value="asc">{t('history.sortOrderAsc')}</Select.Option>
          </Select>
        </Space>
      </Space>
    </Card>
  );
}

