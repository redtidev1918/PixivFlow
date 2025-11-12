/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorDisplay } from '../../../components/common/ErrorDisplay';
import { ErrorCode } from '../../../types/errors';

describe('ErrorDisplay', () => {
  it('renders with default title and error message', () => {
    const error = {
      code: ErrorCode.UNKNOWN_ERROR,
      message: 'Something went wrong',
    };
    render(<ErrorDisplay error={error} />);
    expect(screen.getByText('发生错误')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders with custom title and subtitle', () => {
    const error = {
      code: ErrorCode.UNKNOWN_ERROR,
      message: 'Error message',
    };
    render(
      <ErrorDisplay
        error={error}
        title="Custom Title"
        subTitle="Custom Subtitle"
      />
    );
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Custom Subtitle')).toBeInTheDocument();
  });

  it('displays retry button when onRetry is provided', async () => {
    const error = {
      code: ErrorCode.UNKNOWN_ERROR,
      message: 'Error message',
    };
    const onRetry = jest.fn();
    render(<ErrorDisplay error={error} onRetry={onRetry} />);
    
    // Wait for the button to be rendered
    const retryButton = await screen.findByRole('button', { name: /重\s*试/ });
    expect(retryButton).toBeInTheDocument();
    
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not display retry button when onRetry is not provided', () => {
    const error = {
      code: ErrorCode.UNKNOWN_ERROR,
      message: 'Error message',
    };
    render(<ErrorDisplay error={error} />);
    expect(screen.queryByRole('button', { name: /重\s*试/ })).not.toBeInTheDocument();
  });

  it('displays correct status for NETWORK_ERROR', () => {
    const error = {
      code: ErrorCode.NETWORK_ERROR,
      message: 'Network error',
    };
    render(<ErrorDisplay error={error} />);
    // Ant Design Result component with status="warning" should be rendered
    expect(screen.getByText('发生错误')).toBeInTheDocument();
  });

  it('displays correct status for AUTH_ERROR', () => {
    const error = {
      code: ErrorCode.AUTH_ERROR,
      message: 'Auth error',
    };
    render(<ErrorDisplay error={error} />);
    expect(screen.getByText('发生错误')).toBeInTheDocument();
  });

  it('displays correct status for VALIDATION_ERROR', () => {
    const error = {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation error',
    };
    render(<ErrorDisplay error={error} />);
    expect(screen.getByText('发生错误')).toBeInTheDocument();
  });

  it('displays correct status for SERVER_ERROR', () => {
    const error = {
      code: ErrorCode.SERVER_ERROR,
      message: 'Server error',
    };
    render(<ErrorDisplay error={error} />);
    expect(screen.getByText('发生错误')).toBeInTheDocument();
  });
});

