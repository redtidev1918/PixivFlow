/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders correctly', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders with tip', () => {
    render(<LoadingSpinner tip="Loading..." />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders full screen when fullScreen is true', () => {
    const { container } = render(<LoadingSpinner fullScreen />);
    const spinner = container.querySelector('.ant-spin');
    expect(spinner).toBeInTheDocument();
  });
});

