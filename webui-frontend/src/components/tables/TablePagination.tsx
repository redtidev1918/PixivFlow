import React from 'react';
import { Pagination } from 'antd';
import { TablePaginationProps } from './types';

/**
 * Table pagination component that provides consistent pagination UI
 * for data tables. Wraps Ant Design Pagination with table-specific defaults.
 */
export const TablePagination: React.FC<TablePaginationProps> = ({
  current,
  pageSize,
  total,
  onChange,
  showSizeChanger = true,
  pageSizeOptions = ['10', '20', '50', '100'],
  showTotal = true,
  style,
  className,
}) => {
  const renderTotal = showTotal
    ? typeof showTotal === 'function'
      ? showTotal
      : (total: number, range: [number, number]) =>
          `${range[0]}-${range[1]} of ${total} items`
    : undefined;

  return (
    <Pagination
      current={current}
      pageSize={pageSize}
      total={total}
      onChange={onChange}
      onShowSizeChange={onChange}
      showSizeChanger={showSizeChanger}
      pageSizeOptions={pageSizeOptions}
      showTotal={renderTotal}
      style={style}
      className={className}
    />
  );
};

export default TablePagination;

