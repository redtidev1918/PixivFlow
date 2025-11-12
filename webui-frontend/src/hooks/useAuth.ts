import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { QUERY_KEYS } from '../constants';

/**
 * Hook to check authentication status
 * Returns authentication state and helper functions
 */
export function useAuth() {
  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.AUTH_STATUS,
    queryFn: () => api.getAuthStatus(),
    retry: false,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Helper to check if authenticated from API response
  const isAuthenticated = (response: any): boolean => {
    if (!response) {
      return false;
    }
    
    const responseData = response?.data?.data || response?.data;
    
    if (!responseData) {
      return false;
    }
    
    return responseData?.authenticated === true 
      || responseData?.isAuthenticated === true;
  };

  const authenticated = !isError && isAuthenticated(data);

  return {
    authenticated,
    isLoading,
    isError,
    data,
  };
}
