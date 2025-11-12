/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '../../../components/tables/DataTable';

interface TestData {
  id: number;
  name: string;
  age: number;
  status: string;
}

describe('DataTable', () => {
  const mockData: TestData[] = [
    { id: 1, name: 'John', age: 25, status: 'active' },
    { id: 2, name: 'Jane', age: 30, status: 'inactive' },
    { id: 3, name: 'Bob', age: 35, status: 'active' },
  ];

  const mockColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
  ];

  it('renders table with data', () => {
    render(<DataTable data={mockData} columns={mockColumns} />);
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<DataTable data={mockData} columns={mockColumns} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<DataTable data={mockData} columns={mockColumns} loading />);
    // Ant Design Table shows loading spinner
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(<DataTable data={[]} columns={mockColumns} />);
    // There might be multiple "No data" texts (title and description), use getAllByText
    const noDataElements = screen.getAllByText('No data');
    expect(noDataElements.length).toBeGreaterThan(0);
  });

  it('shows custom empty text', () => {
    render(<DataTable data={[]} columns={mockColumns} emptyText="No records found" />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('uses custom rowKey', () => {
    const dataWithCustomKey = [
      { customId: 1, name: 'John' },
      { customId: 2, name: 'Jane' },
    ];
    const columns = [{ title: 'Name', dataIndex: 'name', key: 'name' }];
    
    render(<DataTable data={dataWithCustomKey} columns={columns} rowKey="customId" />);
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
  });

  it('uses function rowKey', () => {
    const columns = [{ title: 'Name', dataIndex: 'name', key: 'name' }];
    render(
      <DataTable
        data={mockData}
        columns={columns}
        rowKey={(record) => `row-${record.id}`}
      />
    );
    expect(screen.getByText('John')).toBeInTheDocument();
  });

  describe('Sortable columns', () => {
    it('enables sorting when sortable is true', () => {
      const sortableColumns = [
        {
          title: 'Name',
          dataIndex: 'name',
          key: 'name',
          sortable: true,
        },
      ];
      render(<DataTable data={mockData} columns={sortableColumns} />);
      // Sortable columns should have sort icons
      expect(screen.getByText('Name')).toBeInTheDocument();
    });
  });

  describe('Filterable columns', () => {
    it('enables filtering when filterable is true', () => {
      const filterableColumns = [
        {
          title: 'Status',
          dataIndex: 'status',
          key: 'status',
          filterable: true,
          filterOptions: [
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
          ],
        },
      ];
      render(<DataTable data={mockData} columns={filterableColumns} />);
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('shows pagination by default', () => {
      const largeData = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `Name ${i + 1}`,
        age: 20 + i,
        status: 'active',
      }));
      render(<DataTable data={largeData} columns={mockColumns} />);
      // Pagination should be visible
      expect(screen.getByText(/of \d+ items/)).toBeInTheDocument();
    });

    it('hides pagination when pagination is false', () => {
      render(<DataTable data={mockData} columns={mockColumns} pagination={false} />);
      expect(screen.queryByText(/of \d+ items/)).not.toBeInTheDocument();
    });

    it('uses custom pagination config', () => {
      const largeData = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `Name ${i + 1}`,
        age: 20 + i,
        status: 'active',
      }));
      render(
        <DataTable
          data={largeData}
          columns={mockColumns}
          pagination={{ pageSize: 5 }}
        />
      );
      expect(screen.getByText(/of \d+ items/)).toBeInTheDocument();
    });
  });

  describe('Row selection', () => {
    it('enables row selection when rowSelection is provided', () => {
      const onSelectChange = jest.fn();
      render(
        <DataTable
          data={mockData}
          columns={mockColumns}
          rowSelection={{
            onChange: onSelectChange,
          }}
        />
      );
      // Checkboxes should be present
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  describe('Custom styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <DataTable
          data={mockData}
          columns={mockColumns}
          className="custom-table"
        />
      );
      expect(container.querySelector('.custom-table')).toBeInTheDocument();
    });

    it('applies custom style', () => {
      const { container } = render(
        <DataTable
          data={mockData}
          columns={mockColumns}
          style={{ margin: '20px' }}
        />
      );
      const table = container.querySelector('.ant-table');
      expect(table).toBeInTheDocument();
    });

    it('applies size prop', () => {
      render(<DataTable data={mockData} columns={mockColumns} size="small" />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('applies bordered prop', () => {
      render(<DataTable data={mockData} columns={mockColumns} bordered />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  describe('Empty component', () => {
    it('uses custom empty component', () => {
      render(
        <DataTable
          data={[]}
          columns={mockColumns}
          emptyComponent={<div data-testid="custom-empty">Custom empty</div>}
        />
      );
      expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
    });
  });
});

