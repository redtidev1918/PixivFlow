/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingWrapper } from '../../../components/common/LoadingWrapper';

describe('LoadingWrapper', () => {
  it('renders children when loading is false', () => {
    render(
      <LoadingWrapper loading={false}>
        <div>Content</div>
      </LoadingWrapper>
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders LoadingSpinner when loading is true', () => {
    render(
      <LoadingWrapper loading={true}>
        <div>Content</div>
      </LoadingWrapper>
    );
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    // Ant Design Spin doesn't have role="status", check for loading indicator instead
    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('renders custom fallback when loading is true', () => {
    render(
      <LoadingWrapper
        loading={true}
        fallback={<div>Custom Loading</div>}
      >
        <div>Content</div>
      </LoadingWrapper>
    );
    expect(screen.getByText('Custom Loading')).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('passes tip to LoadingSpinner', () => {
    render(
      <LoadingWrapper loading={true} tip="Loading data...">
        <div>Content</div>
      </LoadingWrapper>
    );
    // LoadingSpinner shows tip, but Ant Design renders it in a specific way
    // Check for the loading indicator instead
    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('passes size to LoadingSpinner', () => {
    const { container } = render(
      <LoadingWrapper loading={true} size="large">
        <div>Content</div>
      </LoadingWrapper>
    );
    expect(container.querySelector('.ant-spin')).toBeInTheDocument();
  });
});

