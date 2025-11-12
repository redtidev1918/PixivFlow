import { Space, Select, Button, Input, Row, Col } from 'antd';
import {
  SearchOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Option } = Select;
const { Search } = Input;

export interface FileFiltersProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  dateFilter: 'all' | 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';
  onDateFilterChange: (value: FileFiltersProps['dateFilter']) => void;
  sortBy: 'name' | 'time' | 'size' | 'type' | 'downloadedAt';
  onSortByChange: (value: FileFiltersProps['sortBy']) => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (value: FileFiltersProps['sortOrder']) => void;
}

/**
 * File filters component for search, date filter, and sorting
 */
export function FileFilters({
  searchText,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
}: FileFiltersProps) {
  const { t } = useTranslation();

  return (
    <Row gutter={16} align="middle">
      <Col flex="auto">
        <Search
          placeholder={t('files.searchPlaceholder')}
          allowClear
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ width: '100%' }}
        />
      </Col>
      <Col>
        <Space>
          <Select
            value={dateFilter}
            onChange={onDateFilterChange}
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
            onChange={onSortByChange}
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
            onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? t('files.ascending') : t('files.descending')}
          </Button>
        </Space>
      </Col>
    </Row>
  );
}

