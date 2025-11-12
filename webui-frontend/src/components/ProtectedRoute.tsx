import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Spin } from 'antd';
import { api } from '../services/api';
import { QUERY_KEYS } from '../constants';

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
    queryKey: QUERY_KEYS.AUTH_STATUS,
    queryFn: () => api.getAuthStatus(),
    retry: false,
    staleTime: 0, // No cache - always fetch fresh data
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch on window focus to avoid unnecessary requests
  });

  // Helper to check if authenticated from API response
  const isAuthenticated = (response: any): boolean => {
    // API response structure: response.data.data.authenticated or response.data.authenticated
    const responseData = response?.data?.data || response?.data;
    // Check multiple possible fields: authenticated, isAuthenticated, hasToken
    return res    return responseData?.authenticated === true 
      || responseData?.isAuthenticated === true;
  };

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
  if (!isAuthenticated(data)) {
    return <Navigate to="/login" replace />;
  }

  // If authenticated, render children
  return <>{children}</>;
}

