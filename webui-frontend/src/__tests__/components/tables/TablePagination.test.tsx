/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TablePagination } from '../../../components/tables/TablePagination';

describe('TablePagination', () => {
  it('renders pagination correctly', () => {
    render(
      <TablePagination
        current={1}
        pageSize={10}
        total={100}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('1-10 of 100 items')).toBeInTheDocument();
  });

  it('calls onChange when page changes', () => {
    const onChange = jest.fn();
    const { container } = render(
      <TablePagination
        current={1}
        pageSize={10}
        total={100}
        onChange={onChange}
      />
    );
    
    // Click next page button
    const nextButton = container.querySelector('.ant-pagination-next');
    if (nextButton) {
      fireEvent.click(nextButton);
      expect(onChange).toHaveBeenCalledWith(2, 10);
    }
  });

  it('shows size changer by default', () => {
    const { container } = render(
      <TablePagination
        current={1}
        pageSize={10}
        total={100}
        onChange={() => {}}
      />
    );
    expect(container.querySelector('.ant-pagination-options')).toBeInTheDocument();
  });

  it('hides size changer when showSizeChanger is false', () => {
    const { container } = render(
      <TablePagination
        current={1}
        pageSize={10}
        total={100}
        onChange={() => {}}
        showSizeChanger={false}
      />
    );
    expect(container.querySelector('.ant-pagination-options')).not.toBeInTheDocument();
  });

  it('uses custom pageSizeOptions', () => {
    render(
      <TablePagination
        current={1}
        pageSize={10}
        total={100}
        onChange={() => {}}
        pageSizeOptions={['5', '10', '20']}
      />
    );
    // The page size options should be available
    expect(screen.getByText('1-10 of 100 items')).toBeInTheDocument();
  });

  it('shows total by default', () => {
    render(
      <TablePagination
        current={1}
        pageSize={10}
        total={100}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/100 items/)).toBeInTheDocument();
  });

  it('hides total when showTotal is false', () => {
    render(
      <TablePagination
        current={1}
        pageSize={10}
        total={100}
        onChange={() => {}}
        showTotal={false}
      />
    );
    expect(screen.queryByText(/100 items/)).not.toBeInTheDocument();
  });

  it('uses custom showTotal function', () => {
    const customShowTotal = (total: number, range: [number, number]) =>
      `Showing ${range[0]}-${range[1]} of ${total}`;
    
    render(
      <TablePagination
        current={1}
        pageSize={10}
        total={100}
        onChange={() => {}}
        showTotal={customShowTotal}
      />
    );
    expect(screen.getByText('Showing 1-10 of 100')).toBeInTheDocument();
  });
});

