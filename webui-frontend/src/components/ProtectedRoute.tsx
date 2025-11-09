import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Spin } from 'antd';
import { api } from '../services/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute component that checks authentication status
 * If user is not authenticated, redirects to /login
 * If user is authenticated, renders the children
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['authStatus'],
    queryFn: () => api.getAuthStatus(),
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!data?.data?.authenticated) {
    return <Navigate to="/login" replace />;
  }

  // If authenticated, render children
  return <>{children}</>;
}

