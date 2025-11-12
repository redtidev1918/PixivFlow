/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../../../components/common/EmptyState';

describe('EmptyState', () => {
  it('renders with default description', () => {
    render(<EmptyState />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('renders with custom description', () => {
    render(<EmptyState description="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('renders with action button', () => {
    render(
      <EmptyState
        description="No items"
        action={<button>Add Item</button>}
      />
    );
    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('Add Item')).toBeInTheDocument();
  });

  it('renders with custom image', () => {
    const CustomImage = () => <div>Custom Image</div>;
    render(<EmptyState image={<CustomImage />} />);
    expect(screen.getByText('Custom Image')).toBeInTheDocument();
  });
});

