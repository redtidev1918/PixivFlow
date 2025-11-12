import { useCallback, useMemo, memo } from 'react';
import { Space, Select, Input, DatePicker, InputNumber, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { TableFiltersProps } from './types';

const { Search } = Input;
const { RangePicker } = DatePicker;

/**
 * Table filters component that provides consistent filtering UI
 * for data tables. Supports multiple filter types.
 */
export const TableFilters: React.FC<TableFiltersProps> = memo(({
  filters,
  values,
  onChange,
  onReset,
  showReset = true,
  style,
  className,
}) => {
  const handleFilterChange = useCallback((key: string, value: any) => {
    onChange({
      ...values,
      [key]: value,
    });
  }, [onChange, values]);

  const handleReset = useCallback(() => {
    const resetValues: Record<string, any> = {};
    filters.forEach((filter) => {
      resetValues[filter.key] = filter.defaultValue ?? (filter.type === 'dateRange' ? null : undefined);
    });
    onChange(resetValues);
    if (onReset) {
      onReset();
    }
  }, [filters, onChange, onReset]);

  const filterElements = useMemo(() => {
    return filters.map((filter) => {
      const value = values[filter.key];

      switch (filter.type) {
        case 'select':
          return (
            <Select
              key={filter.key}
              placeholder={filter.placeholder || `Select ${filter.label}`}
              value={value}
              onChange={(val) => handleFilterChange(filter.key, val)}
              allowClear
              style={{ minWidth: 150 }}
              options={filter.options}
            />
          );

        case 'input':
          return (
            <Search
              key={filter.key}
              placeholder={filter.placeholder || `Search ${filter.label}`}
              value={value}
              onChange={(e) => handleFilterChange(filter.key, e.target.value)}
              allowClear
              style={{ minWidth: 200 }}
              onSearch={(val) => handleFilterChange(filter.key, val)}
            />
          );

        case 'number':
          return (
            <InputNumber
              key={filter.key}
              placeholder={filter.placeholder || `Enter ${filter.label}`}
              value={value}
              onChange={(val) => handleFilterChange(filter.key, val)}
              style={{ minWidth: 150 }}
            />
          );

        case 'date':
          return (
            <DatePicker
              key={filter.key}
              placeholder={filter.placeholder || `Select ${filter.label}`}
              value={value}
              onChange={(val) => handleFilterChange(filter.key, val)}
              allowClear
              style={{ minWidth: 200 }}
            />
          );

        case 'dateRange':
          return (
            <RangePicker
              key={filter.key}
              value={value}
              onChange={(val) => handleFilterChange(filter.key, val)}
              style={{ minWidth: 300 }}
            />
          );

        default:
          return null;
      }
    });
  }, [filters, values, handleFilterChange]);

  return (
    <Space wrap style={style} className={className}>
      {filterElements}
      {showReset && (
        <Button
          icon={<ReloadOutlined />}
          onClick={handleReset}
        >
          Reset
        </Button>
      )}
    </Space>
  );
});

TableFilters.displayName = 'TableFilters';

export default TableFilters;

