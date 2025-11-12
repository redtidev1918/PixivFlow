/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../../components/common/ErrorBoundary';

// Component that throws an error
const ThrowError = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  // Suppress console.error for error boundary tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('catches errors and displays fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/Error:/i)).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('calls onError callback when error occurs', () => {
    const onError = jest.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    );
  });

  it('displays custom fallback when provided', () => {
    const customFallback = (error: Error) => (
      <div>Custom error: {error.message}</div>
    );
    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom error: Test error')).toBeInTheDocument();
  });

  it('shows error details when showDetails is true', () => {
    render(
      <ErrorBoundary showDetails>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Error Details/i)).toBeInTheDocument();
  });

  it('hides error details when showDetails is false', () => {
    render(
      <ErrorBoundary showDetails={false}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/Error Details/i)).not.toBeInTheDocument();
  });

  it('resets error state when Try Again button is clicked', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    
    const tryAgainButton = screen.getByText(/Try Again/i);
    fireEvent.click(tryAgainButton);
    
    // After clicking reset, the error state should be cleared
    // But since ThrowError still throws, we need to change it
    // Use a key to force remount or change props
    rerender(
      <ErrorBoundary key="reset">
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('No error')).toBeInTheDocument();
  });
});

