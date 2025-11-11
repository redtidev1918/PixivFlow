import { useMemo } from 'react';
import { Table } from 'antd';
import { DataTableProps } from './types';
import { EmptyState } from '../common/EmptyState';

/**
 * Universal data table component with built-in support for
 * sorting, filtering, pagination, and loading states.
 */
export function DataTable<T extends Record<string, any> = any>({
  data,
  columns,
  loading = false,
  pagination = true,
  rowKey = 'id',
  rowSelection,
  emptyText,
  emptyComponent,
  scroll,
  size = 'middle',
  bordered = false,
  style,
  className,
  ...tableProps
}: DataTableProps<T>) {
  // Convert rowKey to function if it's a string
  const getRowKey = useMemo(() => {
    if (typeof rowKey === 'function') {
      return rowKey;
    }
    return (record: T) => record[rowKey]?.toString() || '';
  }, [rowKey]);

  // Process columns to handle sortable/filterable
  const processedColumns = useMemo(() => {
    return columns.map((col) => {
      const processedCol: any = { ...col };
      
      // Handle sortable columns
      if (col.sortable && !col.sorter) {
        processedCol.sorter = (a: T, b: T) => {
          const dataIndex = (col as any).dataIndex as string | string[];
          const key = Array.isArray(dataIndex) ? dataIndex[0] : dataIndex;
          const aVal = key ? a[key] : undefined;
          const bVal = key ? b[key] : undefined;
          
          if (aVal === bVal) return 0;
          if (aVal == null) return 1;
          if (bVal == null) return -1;
          
          if (typeof aVal === 'string' && typeof bVal === 'string') {
            return aVal.localeCompare(bVal);
          }
          
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return aVal - bVal;
          }
          
          return String(aVal).localeCompare(String(bVal));
        };
      }
      
      // Handle filterable columns
      if (col.filterable && col.filterOptions) {
        processedCol.filters = col.filterOptions.map((opt) => ({
          text: opt.label,
          value: opt.value,
        }));
        processedCol.onFilter = col.onFilter || ((value: any, record: T) => {
          const dataIndex = (col as any).dataIndex as string | string[];
          const key = Array.isArray(dataIndex) ? dataIndex[0] : dataIndex;
          const recordValue = key ? record[key] : undefined;
          return recordValue === value;
        });
      }
      
      return processedCol;
    });
  }, [columns]);

  // Handle pagination configuration
  const paginationConfig = useMemo(() => {
    if (pagination === false) {
      return false;
    }
    
    if (typeof pagination === 'object') {
      return {
        showSizeChanger: true,
        showTotal: (total: number, range: [number, number]) =>
          `${range[0]}-${range[1]} of ${total} items`,
        pageSizeOptions: ['10', '20', '50', '100'],
        ...pagination,
      };
    }
    
    return {
      showSizeChanger: true,
      showTotal: (total: number, range: [number, number]) =>
        `${range[0]}-${range[1]} of ${total} items`,
      pageSizeOptions: ['10', '20', '50', '100'],
    };
  }, [pagination]);

  // Render empty state
  const renderEmpty = () => {
    if (emptyComponent) {
      return emptyComponent;
    }
    
    return (
      <EmptyState
        description={emptyText || 'No data'}
      />
    );
  };

  return (
    <Table<T>
      dataSource={data}
      columns={processedColumns}
      loading={loading}
      pagination={paginationConfig}
      rowKey={getRowKey}
      rowSelection={rowSelection}
      scroll={scroll}
      size={size}
      bordered={bordered}
      style={style}
      className={className}
      locale={{
        emptyText: renderEmpty(),
      }}
      {...tableProps}
    />
  );
}

export default DataTable;

