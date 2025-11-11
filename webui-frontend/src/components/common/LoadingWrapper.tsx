import { ReactNode } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface LoadingWrapperProps {
  loading: boolean;
  children: ReactNode;
  fallback?: ReactNode;
  tip?: string;
  size?: 'small' | 'default' | 'large';
}

/**
 * Wrapper component that shows loading state
 */
export function LoadingWrapper({
  loading,
  children,
  fallback,
  tip,
  size = 'default',
}: LoadingWrapperProps) {
  if (loading) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <LoadingSpinner tip={tip} size={size} />;
  }

  return <>{children}</>;
}

